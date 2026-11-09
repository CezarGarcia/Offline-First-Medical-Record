# 12. Implantação e operação

Como colocar o MedicalField no ar na VM da Univates, como acessar o banco, como configurar o e-mail e como instalar o app cliente no Windows. Também tem as verificações para saber o que a VM permite (portas, Postgres já existente, domínio e HTTPS).

---

## 12.1 O que roda onde

| Onde | O quê |
|---|---|
| **VM da Univates** (Ubuntu 26.04) | Docker Compose com: PostgreSQL, Nginx (gateway + portal), ms-auth, ms-clinico e ms-docs |
| **PC do profissional** (Windows) | App cliente (instalador `.exe`), com o próprio banco SQLite |
| **Qualquer navegador** | Portal Admin, em `http://IP-DA-VM/` |

Na etapa 1, só o **PostgreSQL** e o **Nginx** estão no compose. Os serviços entram nas etapas seguintes; até lá, as rotas deles respondem `503 SERVICO_INDISPONIVEL`.

---

## 12.2 Pré-requisitos na VM

Docker, Compose e Git, uma vez só (pacotes do próprio Ubuntu; o Git já vem na VM do projeto):

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-v2 docker-buildx git
```

- `docker.io` é o Docker; `docker-compose-v2`, o comando `docker compose`; `docker-buildx`, o construtor de imagens que o Compose prefere (sem ele, o build também funciona).
- Confira com `sudo docker run --rm hello-world`.
- **Usar o Docker sem `sudo`** pede o usuário no grupo `docker`: `sudo usermod -aG docker $USER` e entrar de novo no SSH. **Na VM do projeto isso é bloqueado** (o sudo da Univates libera tudo, sem senha, menos mexer em contas, grupos e no próprio sudo), e não se deve contornar. Então lá o Docker é usado com `sudo` (D-50):
  - os scripts (`./infra/scripts/...`) percebem isso sozinhos e chamam `sudo docker`. Rode-os **sem** `sudo` na frente, para o `.env` e os backups continuarem sendo do seu usuário;
  - à mão, todo comando `docker` vai com `sudo` na frente: `sudo docker compose ps` ([12.15](#1215-fazendo-à-mão-sem-os-scripts)).
- Não use o Docker do *snap* (`snap install docker`, que o Ubuntu oferece quando o comando não existe): ele só enxerga pastas dentro do `home` e se atualiza sozinho.
- Na VM do projeto (Ubuntu 26.04, 03/11/2026), o `apt` oferece o Docker 29.1 e o Compose 2.40.

---

## 12.3 Verificações iniciais da VM

### Já existe um Postgres? Ele está aberto para a internet?

- Conseguir rodar `psql -U postgres` **dentro da VM** (depois de entrar por SSH) mostra que existe um Postgres instalado nela. **Não** mostra que ele está aberto para a internet: esse comando conecta por dentro da própria máquina.
- Para ver em que endereço cada programa escuta:

  ```bash
  sudo ss -tlnp
  ```

  Na linha da porta 5432: `127.0.0.1:5432` quer dizer que só a própria VM acessa. `0.0.0.0:5432`, `*:5432` ou `[::]:5432` quer dizer que ele aceita conexões de fora (se nenhum firewall bloquear).
- Teste de fora, no PowerShell do PC: `Test-NetConnection IP-DA-VM -Port 5432`. `TcpTestSucceeded : True` = aberto para fora.

**Para o projeto isso não importa:** o MedicalField usa um Postgres próprio, num container, aberto só em `127.0.0.1:5433` (D-03). Se existir outro Postgres na VM, ele não é usado nem alterado. Na VM do projeto não existe nenhum.

### As portas 80 e 443 chegam até a VM?

A porta 80 é a que o portal e a API usam, então esse teste é importante mesmo sem HTTPS.

1. Na VM, veja se algo já usa as portas: `sudo ss -tlnp | grep -E ':(80|443) '`. Se não aparecer nada, estão livres.
2. Suba um servidor temporário **numa pasta vazia** (para não expor arquivos da VM):

   ```bash
   cd "$(mktemp -d)" && sudo python3 -m http.server 80
   ```

3. No navegador do PC, abra `http://IP-DA-VM`. Se aparecer uma página "Directory listing", a porta 80 chega até a VM. Se não carregar, ela está bloqueada no caminho (firewall da Univates ou da VM).
4. `Ctrl+C` para parar. Repita com `443` no comando e `http://IP-DA-VM:443` no navegador.

Se a 80 estiver bloqueada: use outra porta liberada (`HTTP_PORTA` no `.env`) ou peça a liberação.

### A VM tem domínio? Já tem HTTPS?

- No PC (cmd ou PowerShell): `nslookup IP-DA-VM`. Se aparecer um nome (ex.: `algo.univates.br`), a VM tem um nome registrado. Vale confirmar com o professor se esse nome é acessível de fora.
- No navegador: `https://IP-DA-VM`. "Não foi possível conectar" = nada na porta 443 (não há HTTPS). Um aviso de certificado = existe algo na 443, mas sem certificado válido para o IP.

O que cada resultado permite:

| Situação | Caminho para HTTPS |
|---|---|
| Tem domínio e a porta 80 abre de fora | Certificado gratuito do Let's Encrypt direto no domínio |
| Não tem domínio, mas a 80 abre de fora | Subdomínio gratuito (ex.: DuckDNS) apontando para o IP + Let's Encrypt |
| A 80 não abre de fora | Let's Encrypt com validação por DNS (o DuckDNS permite) |

### O firewall do Ubuntu está ligado?

`sudo ufw status`. Se aparecer `inactive`, o firewall do Ubuntu está desligado (o filtro, se houver, está na rede da Univates). Ver [12.7](#127-firewall-opcional).

### Resultado na VM do projeto (verificado em 03/11/2026)

| Verificação | Resultado | O que isso quer dizer |
|---|---|---|
| `sudo ss -tlnp` | Só o SSH (porta 22) escuta para fora. Não há Postgres instalado na VM (nem o `psql`) | Nada da VM fica exposto além do SSH. As portas 80, 443 e 5433 estão livres |
| Porta 80 vista de fora | Pelo navegador do PC do aluno, pela internet, a página de teste abriu (o servidor registrou `GET / 200`) | O portal e a API vão funcionar pela porta 80 |
| Porta 443 vista de fora | Ainda não testada | Só importa se formos ligar HTTPS |
| `nslookup IP-DA-VM` | Existe um nome reverso (`…univates.br`), mas a consulta do nome não volta para o IP | A VM não tem um domínio utilizável para certificado |
| `https://IP-DA-VM` | Nada responde | Não existe HTTPS hoje |
| Saída para o Gmail (teste da [12.8](#128-e-mail-gmail)) | Portas 587 e 465 liberadas | O e-mail pode sair pelo SMTP do Gmail, sem precisar de outro provedor |
| `sudo -l` | Tudo liberado, sem senha, menos mexer em contas e grupos (`usermod`, `adduser`...) e no sudoers | O usuário não entra no grupo `docker`: o Docker é usado com `sudo` (D-50) |
| `sudo apt install docker.io ...` ([12.2](#122-pré-requisitos-na-vm)) | Docker 29.1.3; `sudo docker run --rm hello-world` funciona | |

Conclusão: o sistema roda em HTTP na porta 80 (D-24). Se quisermos HTTPS, o caminho é o da segunda linha da tabela acima: um subdomínio gratuito (DuckDNS) apontando para o IP, mais um certificado do Let's Encrypt validado pela porta 80, que já abre de fora ([12.9](#129-https-opcional)).

---

## 12.4 Primeira instalação

Numa VM nova (ou depois de apagar tudo), um comando só, que baixa o instalador direto do GitHub:

```bash
curl -fsSL https://raw.githubusercontent.com/CezarGarcia/offline-first-medical-record/main/infra/scripts/instalar.sh | bash
```

Ele faz, nesta ordem:

1. Instala o Docker, o Compose e o Git pelo `apt`, se faltarem (o mesmo de [12.2](#122-pré-requisitos-na-vm)).
2. Clona o repositório em `~/offline-first-medical-record` (se já existir, só atualiza com `git pull`).
3. Cria o `infra/.env` e **pergunta**: a `DEMO_SENHA` (a senha das contas de demonstração, digitada duas vezes) e, se quiser, o Gmail e a senha de app para o envio das fichas ([12.8](#128-e-mail-gmail); Enter pula). As respostas ficam só nesse arquivo.
4. Gera as chaves dos tokens em `infra/secrets/`.
5. **Constrói as imagens uma de cada vez** (compilar as quatro juntas pode passar da memória de uma VM pequena). Na VM do projeto, a primeira vez leva poucos minutos; as seguintes aproveitam o que já foi baixado.
6. Sobe tudo, espera cada serviço ficar saudável e carrega os dados de demonstração.
7. Roda o `verificar.sh` e mostra o endereço do portal.

De dentro do repositório, o mesmo script: `./infra/scripts/instalar.sh`. Pode rodar de novo quando quiser: não pergunta de novo, não apaga dados e regrava a senha das contas de demonstração com a do `.env` (útil depois de trocá-la, ou com uma conta bloqueada).

- As senhas do banco já vêm prontas no `.env.example`: usuário `postgres`, senha `postgres` (e um usuário por serviço, com a senha igual ao nome: `ms_auth`, `ms_clinico`, `ms_docs`). Elas podem ser simples porque o banco só aceita conexões de dentro da VM (D-49).
- Para mudar algo do `.env` depois (o e-mail, por exemplo): `nano infra/.env` (setas andam, `Ctrl+O` e `Enter` salvam, `Ctrl+X` sai) e rode o `instalar.sh` de novo.

Sem o script, à mão, é o mesmo que (na VM do projeto, com `sudo` antes de cada `docker`, D-50):

```bash
git clone https://github.com/CezarGarcia/offline-first-medical-record.git
cd offline-first-medical-record/infra
cp .env.example .env
nano .env                      # defina a DEMO_SENHA (e o e-mail)
mkdir -p secrets && openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out secrets/jwt-privada.pem
openssl pkey -in secrets/jwt-privada.pem -pubout -out secrets/jwt-publica.pem && chmod 644 secrets/*.pem
sudo docker compose build ms-auth && sudo docker compose build ms-clinico && sudo docker compose build ms-docs && sudo docker compose build nginx
sudo docker compose up -d --wait
```

e, para os dados de demonstração, rodar os dois arquivos de `infra/seed/` no banco (o primeiro recebe a senha das contas): `sudo docker compose exec -T db psql -U postgres -d medicalfield -v senha='<DEMO_SENHA>' -f - < seed/01-profissionais.sql`, depois o mesmo com `seed/02-clinico.sql` (sem o `-v`).

- Na primeira subida, o Postgres roda [`postgres/init/01-estrutura.sh`](../infra/postgres/init/01-estrutura.sh), que cria os usuários, os schemas e as permissões. O log mostra `MedicalField: usuários, schemas e permissões criados.`
- Teste: `http://IP-DA-VM/` no navegador mostra a tela de login do Portal Admin. `curl -s http://localhost/api/pessoa` responde `401 NAO_AUTENTICADO`: a rota existe e exige token.
- Testando de dentro da própria VM (`curl http://localhost/...`), o log de acesso mostra o IP da rede do Docker (`172.x.x.x`). Requisições vindas de fora mostram o IP real de quem chamou.

---

## 12.5 Atualizar para uma versão nova

```bash
cd offline-first-medical-record
./infra/scripts/atualizar.sh
```

Ele baixa o código (`git pull`), reconstrói as imagens uma de cada vez, sobe a versão nova, apaga as imagens antigas (que só ocupam disco) e roda o `verificar.sh`. Os dados ficam no volume `medicalfield_pgdata` e **não se perdem** numa atualização. As migrations de cada serviço rodam sozinhas quando ele sobe.

---

## 12.6 Acessar o banco

Usuário `postgres`, senha `postgres`, banco `medicalfield`, porta **5433** (os valores do `.env.example`, D-49). A porta só existe dentro da VM (`127.0.0.1`): de fora, nem com a senha se chega nele. Do PC, entra-se pelo SSH.

| Jeito | Comando ou passos | Senha |
|---|---|---|
| Na VM, pelo Docker (mais fácil, não precisa instalar nada) | `sudo docker compose exec db psql -U postgres -d medicalfield` (na pasta `infra/`) | não pede |
| Na VM, com o `psql` do sistema (instale antes: `sudo apt install -y postgresql-client`) | `psql -h 127.0.0.1 -p 5433 -U postgres -d medicalfield` | `postgres` |
| No PC, pelo DBeaver (túnel SSH) | ver abaixo | `postgres` + a do SSH |

Atenção: `psql -U postgres` **sem** `-h 127.0.0.1 -p 5433` procura um Postgres instalado na própria VM (pelo socket local), e não o do container. Na VM do projeto não existe nenhum, então dá erro. O `psql` também não vem instalado: use o do container (primeira linha da tabela) ou instale o cliente com `sudo apt install -y postgresql-client`.

Dentro do psql, o `postgres` enxerga as tabelas dos quatro schemas sem o prefixo: `\dt` lista todas, e `SELECT * FROM pessoa` funciona igual a `SELECT * FROM clinico.pessoa`. (Num banco criado antes dessa mudança, o `atualizar.sh` ajusta isso.)

**DBeaver com túnel SSH** (o banco continua fechado para a internet):

1. Nova conexão → **PostgreSQL**.
2. Aba **Main**: Host `localhost`, Port `5433`, Database `medicalfield`, Username `postgres`, Password `postgres`.
3. Aba **SSH**: marcar **Use SSH Tunnel**. Host = IP da VM, Port `22`, usuário e senha do teu SSH.
4. **Test Connection** → OK.

Outro jeito: abrir o túnel no PowerShell do PC e deixar a janela aberta, com `ssh -L 5433:127.0.0.1:5433 usuario@IP-DA-VM`. Enquanto ela estiver aberta, qualquer programa do PC (DBeaver sem a aba SSH, pgAdmin, psql) conecta em `localhost:5433`.

**Não abra a porta do banco para fora** (por exemplo, trocando `127.0.0.1` por `0.0.0.0` no `docker-compose.yml`): a senha `postgres` está no repositório, que é público, e qualquer um na internet entraria no banco. O `verificar.sh` acusa se isso acontecer.

O que tem no banco (um schema por serviço, D-03):

| Schema | Tabelas | Dono |
|---|---|---|
| `auth` | `profissional`, `sessao` | ms-auth |
| `clinico` | `pessoa`, `prontuario`, `atendimento`, `atendimento_medicamento`, `medicamento`, `conflito`, `unificacao` | ms-clinico |
| `documentos` | `envio_email` | ms-docs |
| `auditoria` | `log_acesso`, `log_cliente` (não aceitam alteração nem exclusão, D-04) | ms-auth |

Dentro do psql: `\dn` lista os schemas, `\dt clinico.*` as tabelas de um schema, `\d clinico.medicamento` as colunas de uma tabela, `\x` mostra cada linha na vertical (bom para tabelas largas) e `\q` sai. Todo comando SQL termina com `;`. As colunas de cada tabela estão em [05](05-modelo-de-dados.md).

---

## 12.7 Firewall (opcional)

Se quiser ligar o firewall do Ubuntu, **libere o SSH antes de ativar**, senão a conexão cai:

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw enable
```

Só ative se nada mais na VM precisar de outras portas. O Docker publica portas por fora do ufw; é por isso que o banco está preso a `127.0.0.1` no `docker-compose.yml`, em vez de depender do firewall.

---

## 12.8 E-mail (Gmail)

Sem esta configuração o sistema funciona, mas o envio da ficha por e-mail responde `502` dizendo que o SMTP não foi configurado (D-38). O PDF não depende dela.

1. **Teste se a VM alcança o Gmail** (faça isso antes de criar a conta; se as duas portas estiverem bloqueadas, o resto não adianta). Na VM do projeto, as duas estão liberadas (03/11/2026):

   ```bash
   for p in 587 465; do timeout 5 bash -c "</dev/tcp/smtp.gmail.com/$p" && echo "porta $p liberada" || echo "porta $p bloqueada"; done
   ```

2. Escolha a conta e ative nela a **verificação em duas etapas** (a senha de app só existe com ela ligada).
   - **Recomendado: uma conta criada só para o projeto.** A senha de app dá acesso à conta inteira (ler e mandar e-mails), e ela fica gravada no `.env` de um servidor ligado na internet. Com uma conta do projeto, um vazamento expõe só os e-mails do sistema. O remetente também fica com cara de sistema, e não com o endereço pessoal de alguém (D-43).
   - **Uma conta pessoal também funciona**, com a mesma configuração. Os e-mails saem com o endereço pessoal. Depois da apresentação, apague a senha de app (Conta Google → Segurança → Senhas de app); a senha da conta não muda.
3. Gere uma **senha de app**: Conta Google → Segurança → Senhas de app. São 16 letras, mostradas em grupos de 4 (os espaços não fazem parte da senha; o ms-docs ignora espaços).
4. No `infra/.env` da VM, tire o `#` das linhas de e-mail e preencha:

   ```bash
   SMTP_HOST=smtp.gmail.com
   SMTP_PORTA=587
   SMTP_USUARIO=conta-do-projeto@gmail.com
   SMTP_SENHA=abcdefghijklmnop
   SMTP_REMETENTE=conta-do-projeto@gmail.com
   ```

   Se só a porta 465 estiver liberada, use `SMTP_PORTA=465`: a conexão passa a ser SSL direto (`SMTP_SEGURANCA` já se ajusta pela porta).
5. Aplique: rode o `./infra/scripts/instalar.sh` de novo (ou, na pasta `infra/`, `sudo docker compose up -d ms-docs`). O log (`sudo docker compose logs ms-docs`) mostra `e-mail pelo SMTP smtp.gmail.com:587 (STARTTLS)`.
6. Teste: envie uma ficha para a opção **Outro** com um e-mail seu (pelo portal, pelo cliente ou pelo Postman).

O que cada resposta de erro quer dizer:

| Mensagem do `502 FALHA_ENVIO_EMAIL` | Causa provável |
|---|---|
| "o envio de e-mail não está configurado no servidor" | `SMTP_HOST` não está no `.env` (ou o ms-docs não foi reiniciado depois) |
| "o servidor de e-mail recusou o usuário ou a senha" | Senha de app errada, ou foi usada a senha normal da conta, ou falta a verificação em duas etapas |
| "o servidor de e-mail não respondeu" | Porta bloqueada no caminho, ou `SMTP_HOST`/`SMTP_PORTA` errados |
| "o servidor de e-mail recusou o endereço do destinatário" ou "recusou a mensagem (código …)" | Endereço inexistente, ou o Gmail barrou a mensagem (limite diário de envios, por exemplo) |

Se as portas 587 e 465 estiverem bloqueadas: pedir a liberação, ou trocar para um provedor de e-mail por API (HTTPS, porta 443). O envio fica atrás de um Adapter (D-16): bastaria escrever um adaptador novo no ms-docs, sem mexer em rotas, fila ou idempotência.

---

## 12.9 HTTPS (opcional)

Depende das verificações de [12.3](#123-verificações-iniciais-da-vm). Resumo do que seria feito:

1. Conseguir um nome: o domínio da VM, ou um subdomínio gratuito apontando para o IP.
2. Emitir um certificado gratuito do Let's Encrypt para esse nome.
3. Nginx escutando na 443 com o certificado e redirecionando a 80 para a 443.
4. Cliente e portal passam a usar `https://<nome>`.

---

## 12.10 App cliente no Windows

- **Instalar:** baixar `MedicalField-Setup-<versão>.exe` na página **Releases** do repositório (o GitHub Actions gera a cada versão, D-28) e executar. Na primeira vez aparece "O Windows protegeu o computador": clicar em **Mais informações** → **Executar assim mesmo** (o `.exe` não tem assinatura digital). O instalador é por usuário (não pede administrador) e deixa escolher a pasta.
- **Publicar uma versão:** criar uma tag de versão e mandar para o GitHub. O workflow **Instaladores do app cliente** gera o `.exe` numa máquina Windows (instala e abre o app para conferir) e o AppImage numa máquina Linux (abre o app para conferir), e cria a versão em **Releases** com os dois anexados (uns 10 minutos). A versão do app passa a ser a da tag:

  ```bash
  git tag v1.0.0
  git push origin v1.0.0
  ```

  Sem tag, cada push que muda o app cliente na `main` também gera o instalador: ele fica na execução do workflow (aba **Actions** → a execução → **Artifacts** → `MedicalField-Setup` e `MedicalField-AppImage`), por 30 dias.
- **Gerar o instalador no próprio Windows** (sem esperar o GitHub Actions): Node.js 22.22 ou mais novo e, na pasta `apps/cliente`, `npm ci`, `npm run build` e `npm run instalador`. O `.exe` sai em `apps/cliente/release/`.
- **Num PC com Linux:** baixar o `MedicalField-<versão>.AppImage` (Releases ou o artefato `MedicalField-AppImage`). É um arquivo único, que roda sem instalar. No terminal, na pasta do arquivo:

  ```bash
  chmod +x MedicalField-*.AppImage
  ./MedicalField-*.AppImage --no-sandbox
  ```

  - O `--no-sandbox` é para o Ubuntu 24.04 em diante, que restringe um recurso que o sandbox do Chromium usa. Sem ele, o app pode fechar logo ao abrir.
  - Se aparecer um erro de **FUSE** (`libfuse.so.2`), rode com `APPIMAGE_EXTRACT_AND_RUN=1` antes do comando.
  - Para a segunda ambulância, acrescente `--perfil=ambulancia-02`.
  - O banco local fica em `~/.config/MedicalField/<perfil>/`. Num Linux sem cofre de senhas, o app pede a senha de novo ao ser reaberto, e o login offline vale só para quem já entrou online nele (D-51).
  - Para gerar no próprio Linux: Node.js 22.22 ou mais novo e, na pasta `apps/cliente`, `npm ci`, `npm run build` e `npm run pacote:linux`. O arquivo sai em `apps/cliente/release/`.
- **Primeira abertura:** informar o endereço do servidor (`http://IP-DA-VM`) e o nome do dispositivo (ex.: `Ambulância 01`). Os dois podem ser trocados depois, na tela **Sobre**.
- **Segunda ambulância** (D-29): o instalador já cria o atalho **MedicalField (Ambulância 02)** na área de trabalho e no menu Iniciar. Ele abre o mesmo programa com `--perfil=ambulancia-02`, ou seja, outra instância, com banco e configuração próprios (na primeira abertura, configure o nome `Ambulância 02`). Para mais aparelhos, copie o atalho e troque o perfil em Propriedades → Destino (ex.: ` --perfil=ambulancia-03`, depois das aspas).
- **Onde fica o banco local:** `%APPDATA%\MedicalField\<perfil>\medicalfield.db` (o perfil padrão é `padrao`). O caminho exato aparece na tela **Sobre**.
- **Abrir o SQLite** (opcional): no DBeaver, Nova conexão → **SQLite** → escolher esse arquivo. **Não é necessário na apresentação:** as telas **Fila de sincronização** e **Logs locais** já mostram o que está no banco local.

---

## 12.11 Desenvolvimento local

- O mesmo `docker compose` funciona no PC com o Docker Desktop (Windows). Para não brigar com outros programas, dá para mudar `HTTP_PORTA` no `.env` (ex.: `8088`).
- Portal direto do código, com recarga automática: Node.js 22.22 ou mais novo e, na pasta `apps/portal`, `npm ci` e `MEDICALFIELD_API=http://localhost npm run dev` (abre em `http://localhost:5173`; ver o [README do portal](../apps/portal/README.md)).
- App cliente direto do código: Node.js 22.22 ou mais novo e, na pasta `apps/cliente`, `npm ci` e `npm run dev` (abre a janela do app com recarga automática das telas). Para usar outro perfil: `npm run dev -- -- --perfil=ambulancia-02`. Os testes, a integração e o passeio estão em [13.2](13-testes-automatizados.md#132-como-rodar); o resto, no [README do app](../apps/cliente/README.md).
- **E-mail sem conta de e-mail:** com o `infra/docker-compose.teste.yml`, o ms-docs manda para o Mailpit, um servidor de e-mail de teste que guarda as mensagens e mostra tudo em `http://localhost:8025`, com o PDF anexado. As linhas do `.env` e o comando estão no começo desse arquivo. Não use na VM da apresentação.
- O `.gitattributes` força fim de linha LF. Assim os scripts `.sh` editados no Windows continuam funcionando no Linux.

---

## 12.12 Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| `bad interpreter: /bin/bash^M` | Script salvo com CRLF (Windows) | O `.gitattributes` evita. Se acontecer: `git config core.autocrlf false`, apagar o arquivo e `git checkout` de novo |
| `permission denied ... docker.sock` | Usuário fora do grupo `docker` (na VM do projeto, sempre: D-50) | À mão, `sudo` na frente do `docker`. Os scripts já usam o `sudo` sozinhos. Fora da VM do projeto: `sudo usermod -aG docker $USER` e entrar de novo no SSH |
| PDF ou e-mail respondem `503 SERVICO_INDISPONIVEL` | O ms-docs está no ar, mas não conseguiu falar com o ms-clinico | `docker compose ps` e `docker compose logs ms-clinico` |
| E-mail responde `502 FALHA_ENVIO_EMAIL` | Problema no envio (configuração, senha, porta) | Ver a tabela de mensagens em [12.8](#128-e-mail-gmail). O pedido fica registrado com o motivo e pode ser repetido |
| `address already in use` na porta 80 | Outro programa usa a 80 (ex.: Apache) | `sudo ss -tlnp \| grep ':80 '`; parar o outro programa ou mudar `HTTP_PORTA` |
| `address already in use` na 5433 | Outro programa usa a 5433 | Mudar `DB_PORTA_LOCAL` |
| `/api/...` responde `SERVICO_INDISPONIVEL` | Serviço parado ou ainda não implantado | `docker compose ps` e `docker compose logs <serviço>` |
| Trocou senha do banco no `.env` e nada mudou | O script de inicialização só roda na primeira subida | Recriar o banco com `./infra/scripts/zerar.sh` (**apaga todos os dados** e recarrega os de demonstração) |
| `no configuration file provided: not found` | O `docker compose` foi rodado fora da pasta `infra/` | `cd ~/offline-first-medical-record/infra` (os scripts funcionam de qualquer pasta) |
| Mudou o `.env` e o serviço continua igual | `docker compose restart` não relê o `.env` | `docker compose up -d <serviço>`: recria o container com os valores novos |
| O DBeaver não conecta no banco | Sem o túnel SSH, ou com a porta padrão 5432 em vez da 5433 | Ver [12.6](#126-acessar-o-banco): aba SSH marcada, porta `5433` |
| `Command 'psql' not found` | O cliente do Postgres não vem instalado na VM | Use o do container: `cd infra && sudo docker compose exec db psql -U postgres -d medicalfield`, ou instale o cliente: `sudo apt install -y postgresql-client` |
| `\dt` diz `Did not find any tables` | O psql está no banco `postgres`, ou o caminho de busca ainda é o antigo | Entre com `-d medicalfield`. Se continuar, rode o `./infra/scripts/atualizar.sh` (ou use `\dt *.*`) |
| Cliente diz "servidor inacessível" | Endereço errado, porta bloqueada ou VM fora do ar | Abrir `http://IP-DA-VM` no navegador do mesmo PC. O endereço do app fica em **Sobre** |
| Cliente pede "Faça login online para sincronizar" | A sessão do servidor venceu (7 dias), foi encerrada, ou o app foi reaberto depois de um login offline | Clicar em **Entrar online** na barra e digitar a senha. Nada se perde (D-46) |
| Ao abrir o atalho, a janela que já estava aberta vem para a frente | Cada perfil abre uma janela só | Para outra ambulância, use o atalho do outro perfil |
| E-mail responde `FALHA_ENVIO_EMAIL` | Senha de app errada ou porta SMTP bloqueada | Conferir o `.env` e o teste de porta de [12.8](#128-e-mail-gmail). A página **E-mails enviados** do portal mostra a mensagem do erro |
| O build para com `killed` ou `exit code 137` | Falta de memória (o Maven e o build do portal são os que mais pedem) | Criar um swap de 2 GB e rodar de novo: `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile` (para ficar depois de reiniciar: `echo '/swapfile none swap sw 0 0' \| sudo tee -a /etc/fstab`) |
| Login das contas de demonstração recusado | A `DEMO_SENHA` do `.env` mudou depois de carregar os dados, ou a conta ficou bloqueada por senhas erradas | `./infra/scripts/instalar.sh`: regrava a senha do `.env`, desbloqueia e reativa as quatro contas (não apaga dados) |
| O roteiro mostra registros a mais nos passos 2 a 4 | Sobrou o que foi criado nos ensaios | `./infra/scripts/zerar.sh` (e, no notebook, `apagar-dados-locais.cmd`) |

---

## 12.13 Scripts de operação

São só quatro, em [`infra/scripts/`](../infra/scripts). Rodam de qualquer pasta do repositório, sem `sudo` na frente (eles chamam o Docker com `sudo` sozinhos quando precisa, D-50), e mostram numa linha cinza começando com `$` o comando que rodam por baixo.

| Script | Quando usar | O que faz |
|---|---|---|
| `instalar.sh` | VM nova, ou para deixar tudo no ar de novo | Tudo, do zero até o portal no ar: Docker (se faltar), código, configuração, chaves, imagens, banco e dados de demonstração (12.4). Roda também pela URL do GitHub. Pode rodar de novo sem perder dados |
| `atualizar.sh` | Depois de uma mudança no código | `git pull`, reconstrói as imagens e sobe a versão nova. Os dados ficam (12.5) |
| `zerar.sh` | Antes da apresentação e entre ensaios | Apaga **todos** os dados e recarrega os de demonstração: volta ao começo do roteiro. Pede para digitar `ZERAR`. O banco inteiro é recriado, porque os logs de auditoria não podem ser apagados um a um (D-04) |
| `verificar.sh` | Antes de começar, ou quando algo parecer errado | Confere containers, rotas, o login das contas de demonstração, os dados, o e-mail, o disco e a memória. Não muda nada. Termina com "Tudo pronto", ou com o que falta e como resolver |

Todo o resto (ver logs, derrubar um serviço, entrar no banco, inserir o medicamento do passo 9, trocar a estratégia de conflitos) se faz à mão, com os comandos de [12.15](#1215-fazendo-à-mão-sem-os-scripts): é o que se mostra ao professor.

No notebook (Windows): [`apps/cliente/scripts/apagar-dados-locais.cmd`](../apps/cliente/scripts/apagar-dados-locais.cmd) apaga os dados do app cliente deste computador (os perfis `padrao` e `ambulancia-02`), com o app fechado. Na próxima abertura, ele pede o endereço do servidor e o nome do dispositivo, e o primeiro login precisa ser online.

---

## 12.14 Antes da apresentação

O passo a passo completo do dia, com os comandos de cada passo do roteiro e os diagramas para mostrar, está em [`apresentacao/ROTEIRO-DA-APRESENTACAO.md`](../apresentacao/ROTEIRO-DA-APRESENTACAO.md). Resumo:

Na VM, no dia (ou na véspera):

1. `./infra/scripts/atualizar.sh`, se houve mudança no código desde a instalação.
2. `./infra/scripts/zerar.sh`: os passos 2 a 4 do roteiro esperam só os dados de demonstração (2 prontuários e 2 atendimentos), sem os registros dos ensaios.
3. `./infra/scripts/verificar.sh`: tem de terminar em "Tudo pronto" (ou só com avisos que você entenda).
4. Pelo portal, mandar uma ficha por e-mail para a caixa que será aberta na apresentação (confere o Gmail de ponta a ponta).
5. Repassar os comandos à mão de [12.15](#1215-fazendo-à-mão-sem-os-scripts): o professor pode pedir para ver um log, derrubar um serviço ou inserir algo direto no banco.

No notebook:

1. `apagar-dados-locais.cmd`, para o app começar sem os registros dos ensaios.
2. Abrir o **MedicalField**, configurar o endereço da VM e o nome `Ambulância 01`, e **entrar online** com a Dra. Ana. O login offline só vale para quem entrou online no aparelho nos últimos 7 dias.
3. Fazer o mesmo no atalho **MedicalField (Ambulância 02)**, com o nome `Ambulância 02` e o Enf. Bruno, se for mostrar o conflito (11.4).
4. Deixar a chave em **Online**, sem pendentes na fila.

---

## 12.15 Fazendo à mão (sem os scripts)

Tudo o que não é instalar, atualizar, zerar ou verificar se faz à mão, **na pasta `infra/`**, porque é lá que estão o `docker-compose.yml` e o `.env`, e o `docker compose` procura os dois na pasta atual:

```bash
cd ~/offline-first-medical-record/infra
```

**Na VM do projeto, todo comando `docker` vai com `sudo` na frente** (o usuário não pode entrar no grupo `docker`, D-50): `sudo docker compose ps`, `sudo docker compose logs -f ms-clinico`, e assim por diante. A tabela abaixo mostra os comandos sem o `sudo`, como num PC com o Docker Desktop.

Os nomes dos serviços são os do `docker-compose.yml`: `db`, `ms-auth`, `ms-clinico`, `ms-docs` e `nginx`.

| Para | À mão (na pasta `infra/`) |
|---|---|
| Ver o que está no ar | `docker compose ps` |
| Ver os logs de um serviço (`Ctrl+C` sai) | `docker compose logs -f --tail 100 ms-clinico` |
| Derrubar um serviço | `docker compose stop ms-docs` |
| Religar | `docker compose start ms-docs` |
| Reiniciar | `docker compose restart ms-clinico` |
| Aplicar uma mudança do `.env` | `docker compose up -d` (recria só os containers que mudaram) |
| Trocar a estratégia de conflitos | `nano .env` (linha `ESTRATEGIA_CONFLITO=SERVIDOR_VENCE`) e `docker compose up -d ms-clinico` |
| Parar tudo (os dados ficam) | `docker compose down` |
| Subir tudo | `docker compose up -d` |
| Reconstruir um serviço depois de mudar o código | `docker compose build ms-clinico` e `docker compose up -d ms-clinico` |
| Entrar no banco | `docker compose exec db psql -U postgres -d medicalfield` |
| Um comando SQL só | `docker compose exec db psql -U postgres -d medicalfield -c "SELECT count(*) FROM clinico.atendimento;"` |
| Zerar (apaga **todos** os dados) | `docker compose down -v` e `docker compose up -d --wait`; os dados de demonstração voltam com o `./scripts/zerar.sh` (ou o `instalar.sh`) |
| Backup do banco | `mkdir -p backups` e `docker compose exec -T db pg_dump -U postgres -d medicalfield -Fc > backups/meu.dump` |
| Testar uma rota | `curl -i http://localhost/api/pessoa` (responde `401`: a rota existe e pede token) |
| Memória e processador de cada container | `docker stats --no-stream` |

A diferença entre `down` e `down -v`: o `-v` apaga também o volume do banco, ou seja, **todos os dados**. Sem o `-v`, os dados ficam e voltam no próximo `up -d`.

No banco (dentro do psql, [12.6](#126-acessar-o-banco)), os comandos mais prováveis:

```sql
-- Horários no fuso de Brasília (o banco guarda em UTC)
SET TIME ZONE 'America/Sao_Paulo';

-- Passo 9 do roteiro: um medicamento novo, direto no banco (aparece no portal e, depois de sincronizar, no app)
INSERT INTO clinico.medicamento (nome, apresentacao, unidade_padrao)
VALUES ('Cetoprofeno', 'Frasco-ampola 100 mg', 'MG');

-- Um profissional novo (o enunciado permite cadastrar direto no banco; a senha vai em bcrypt, D-30)
INSERT INTO auth.profissional (nome, tipo_registro, registro, perfil, senha_hash)
VALUES ('Dr. Novo', 'CRM', '99999-RS', 'OPERACIONAL', crypt('a-senha-dele', gen_salt('bf', 10)));

-- Desativar um profissional (o próximo login dele, e a renovação da sessão, são recusados)
UPDATE auth.profissional SET ativo = false WHERE registro = '99999-RS';

-- Os últimos atendimentos: de quem, quando, se foi registrado online ou offline, e em que aparelho
SELECT p.nome, a.data_hora, a.modo_registro, a.dispositivo_nome
FROM clinico.atendimento a
JOIN clinico.prontuario pr ON pr.id = a.prontuario_id
JOIN clinico.pessoa p ON p.id = pr.pessoa_id
ORDER BY a.data_hora DESC LIMIT 5;

-- Auditoria: os últimos acessos à API e as últimas ações registradas nos aparelhos
SELECT data_hora, servico, metodo, rota, status_code FROM auditoria.log_acesso ORDER BY data_hora DESC LIMIT 10;
SELECT data_hora, dispositivo_nome, acao, modo FROM auditoria.log_cliente ORDER BY data_hora DESC LIMIT 10;

-- Conflitos de unificação e e-mails enviados
SELECT detectado_em, entidade, motivo, estrategia, dispositivo_nome FROM clinico.conflito ORDER BY detectado_em DESC;
SELECT solicitado_em, destinatario_email, status, erro FROM documentos.envio_email ORDER BY solicitado_em DESC;
```

Para mostrar a auditoria protegida (D-04): `DELETE FROM auditoria.log_acesso;` é recusado pelo próprio banco, até para o `postgres` ("Registros de auditoria não podem ser alterados nem apagados").

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

Docker, Compose e Git (uma vez só):

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-v2 git
sudo usermod -aG docker $USER
```

Depois, **saia do SSH e entre de novo** (para o grupo `docker` valer) e confira com `docker compose version`. Se o pacote `docker-compose-v2` não existir nessa versão do Ubuntu, siga a instalação oficial: <https://docs.docker.com/engine/install/ubuntu/>.

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

**Para o projeto isso não importa:** o MedicalField usa um Postgres próprio, num container, aberto só em `127.0.0.1:5433` (D-03). O Postgres que já existe na VM não é usado nem alterado.

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
| `sudo ss -tlnp` | Só o SSH (porta 22) escuta para fora. O Postgres que já existe atende só pelo socket local | Nada da VM fica exposto além do SSH. As portas 80, 443 e 5433 estão livres |
| Porta 80 vista de fora | Pelo navegador do PC do aluno, pela internet, a página de teste abriu (o servidor registrou `GET / 200`) | O portal e a API vão funcionar pela porta 80 |
| Porta 443 vista de fora | Ainda não testada | Só importa se formos ligar HTTPS |
| `nslookup IP-DA-VM` | Existe um nome reverso (`…univates.br`), mas a consulta do nome não volta para o IP | A VM não tem um domínio utilizável para certificado |
| `https://IP-DA-VM` | Nada responde | Não existe HTTPS hoje |

Conclusão: o sistema roda em HTTP na porta 80 (D-24). Se quisermos HTTPS, o caminho é o da segunda linha da tabela acima: um subdomínio gratuito (DuckDNS) apontando para o IP, mais um certificado do Let's Encrypt validado pela porta 80, que já abre de fora ([12.9](#129-https-opcional)).

---

## 12.4 Primeira instalação

```bash
git clone https://github.com/CezarGarcia/offline-first-medical-record.git
cd offline-first-medical-record/infra
cp .env.example .env
nano .env                      # troque TODAS as senhas
./scripts/gerar-chaves-jwt.sh  # chaves dos tokens (uma vez só)
docker compose up -d --build
docker compose ps
```

- Se o repositório for privado, o `git clone` pede usuário e um **token de acesso do GitHub** (não a senha da conta).
- Na primeira subida, o Postgres roda [`postgres/init/01-estrutura.sh`](../infra/postgres/init/01-estrutura.sh), que cria os usuários, os schemas e as permissões. O log mostra `MedicalField: usuários, schemas e permissões criados.`
- Teste: `http://IP-DA-VM/` no navegador mostra a página provisória do MedicalField (até o Portal Admin entrar, na etapa 5). `curl -s http://localhost/api/pessoa` responde `401 NAO_AUTENTICADO`: a rota existe e exige token. `docker compose ps` deve mostrar `db`, `ms-auth`, `ms-clinico` e `ms-docs` como `healthy`.
- Dados de demonstração: defina `DEMO_SENHA` no `.env` e rode `./scripts/popular-demo.sh` (profissionais desde a etapa 2; dados clínicos a partir da etapa 3). Pode rodar mais de uma vez.
- Testando de dentro da própria VM (`curl http://localhost/...`), o log de acesso mostra o IP da rede do Docker (`172.x.x.x`). Requisições vindas de fora mostram o IP real de quem chamou.

---

## 12.5 Atualizar para uma versão nova

```bash
cd offline-first-medical-record
git pull
cd infra
docker compose up -d --build
```

Os dados ficam no volume `medicalfield_pgdata` e **não se perdem** numa atualização. As migrations de cada serviço rodam sozinhas quando ele sobe.

---

## 12.6 Acessar o banco

| Jeito | Comando ou passos | Senha |
|---|---|---|
| Na VM, pelo script (mais fácil) | `./infra/scripts/psql.sh` (a partir da pasta do repositório) | não pede |
| Na VM, com o `psql` do sistema | `psql -h 127.0.0.1 -p 5433 -U postgres -d medicalfield` | `POSTGRES_PASSWORD` do `.env` |
| No PC, pelo DBeaver (túnel SSH) | ver abaixo | `POSTGRES_PASSWORD` + a do SSH |

Atenção: `psql -U postgres` **sem** `-p 5433` entra no Postgres que já existia na VM, não no do MedicalField.

**DBeaver com túnel SSH** (o banco continua fechado para a internet):

1. Nova conexão → **PostgreSQL**.
2. Aba **Main**: Host `localhost`, Port `5433`, Database `medicalfield`, Username `postgres`, Password = `POSTGRES_PASSWORD`.
3. Aba **SSH**: marcar **Use SSH Tunnel**. Host = IP da VM, Port `22`, usuário e senha do teu SSH.
4. **Test Connection** → OK.

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

1. **Teste se a VM alcança o Gmail** (faça isso antes de criar a conta; se as duas portas estiverem bloqueadas, o resto não adianta):

   ```bash
   for p in 587 465; do timeout 5 bash -c "</dev/tcp/smtp.gmail.com/$p" && echo "porta $p liberada" || echo "porta $p bloqueada"; done
   ```

2. Crie uma conta Gmail só para o projeto e ative a **verificação em duas etapas** nela.
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
5. Aplique: `docker compose up -d ms-docs`. O log (`docker compose logs ms-docs`) mostra `e-mail pelo SMTP smtp.gmail.com:587 (STARTTLS)`.
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

- **Instalar:** baixar `MedicalField-Setup-<versão>.exe` na página **Releases** do repositório (o GitHub Actions gera a cada versão, D-28) e executar. Na primeira vez aparece "O Windows protegeu o computador": clicar em **Mais informações** → **Executar assim mesmo** (o `.exe` não tem assinatura digital).
- **Primeira abertura:** informar o endereço do servidor (`http://IP-DA-VM`) e o nome do dispositivo (ex.: `Ambulância 01`).
- **Segunda ambulância** (D-29): criar um atalho do `MedicalField.exe` e, em Propriedades → Destino, acrescentar ` --perfil=ambulancia-02` depois das aspas. Esse atalho abre outra instância, com banco e configuração próprios.
- **Onde fica o banco local:** `%APPDATA%\MedicalField\<perfil>\medicalfield.db` (o perfil padrão é `padrao`). O caminho exato aparece na tela **Sobre**.
- **Abrir o SQLite** (opcional): no DBeaver, Nova conexão → **SQLite** → escolher esse arquivo. **Não é necessário na apresentação:** as telas **Fila de sincronização** e **Logs locais** já mostram o que está no banco local.

---

## 12.11 Desenvolvimento local

- O mesmo `docker compose` funciona no PC com o Docker Desktop (Windows). Para não brigar com outros programas, dá para mudar `HTTP_PORTA` no `.env` (ex.: `8088`).
- App cliente direto do código: Node.js LTS, e `npm install` e `npm run dev` na pasta `apps/cliente` (etapa 6).
- O `.gitattributes` força fim de linha LF. Assim os scripts `.sh` editados no Windows continuam funcionando no Linux.

---

## 12.12 Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| `bad interpreter: /bin/bash^M` | Script salvo com CRLF (Windows) | O `.gitattributes` evita. Se acontecer: `git config core.autocrlf false`, apagar o arquivo e `git checkout` de novo |
| `permission denied ... docker.sock` | Usuário fora do grupo `docker` | `sudo usermod -aG docker $USER` e entrar de novo no SSH |
| PDF ou e-mail respondem `503 SERVICO_INDISPONIVEL` | O ms-docs está no ar, mas não conseguiu falar com o ms-clinico | `docker compose ps` e `docker compose logs ms-clinico` |
| E-mail responde `502 FALHA_ENVIO_EMAIL` | Problema no envio (configuração, senha, porta) | Ver a tabela de mensagens em [12.8](#128-e-mail-gmail). O pedido fica registrado com o motivo e pode ser repetido |
| `address already in use` na porta 80 | Outro programa usa a 80 (ex.: Apache) | `sudo ss -tlnp \| grep ':80 '`; parar o outro programa ou mudar `HTTP_PORTA` |
| `address already in use` na 5433 | Outro programa usa a 5433 | Mudar `DB_PORTA_LOCAL` |
| `/api/...` responde `SERVICO_INDISPONIVEL` | Serviço parado ou ainda não implantado | `docker compose ps` e `docker compose logs <serviço>` |
| Trocou senha do banco no `.env` e nada mudou | O script de inicialização só roda na primeira subida | Recomeçar do zero com `docker compose down -v` (**apaga todos os dados**) e subir de novo |
| Cliente diz "servidor inacessível" | Endereço errado, porta bloqueada ou VM fora do ar | Abrir `http://IP-DA-VM` no navegador do mesmo PC |
| E-mail responde `FALHA_ENVIO_EMAIL` | Senha de app errada ou porta SMTP bloqueada | Conferir o `.env` e o teste de porta de [12.8](#128-e-mail-gmail) |

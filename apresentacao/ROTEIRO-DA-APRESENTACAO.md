# Roteiro da apresentação

O passo a passo do dia: o que preparar, o que fazer em cada passo do roteiro de testes ([docs/11](../docs/11-roteiro-de-testes.md)), os comandos exatos, o que aparece na tela e o que dá para falar. Os diagramas citados estão em [`diagramas/`](diagramas).

Convenções deste documento:

- **VM** = terminal SSH na VM (`ssh univates@IP-DA-VM`), na pasta do projeto: `cd ~/offline-first-medical-record`.
- **App** = o app cliente no notebook. **Portal** = o navegador em `http://IP-DA-VM/`.
- `<DEMO_SENHA>` = a senha das contas de demonstração que você definiu no `infra/.env` da VM.
- Os scripts (`./infra/scripts/...`) rodam **sem** `sudo`: eles mesmos chamam o Docker com `sudo` (D-50). À mão, todo comando `docker` vai com `sudo` na frente.

---

## 0. Na véspera (ou uma hora antes)

### Na VM

Atualizar para a última versão do código (só se houve mudança desde a instalação):

```bash
cd ~/offline-first-medical-record
```

```bash
./infra/scripts/atualizar.sh
```

Voltar ao começo do roteiro: apaga os registros dos ensaios e recarrega os dados de demonstração (pede para digitar `ZERAR`):

```bash
./infra/scripts/zerar.sh
```

Mandar uma ficha de verdade para a caixa que você vai abrir na apresentação:

```bash
./infra/scripts/testar-email.sh seu-email@gmail.com
```

Conferir tudo (tem de terminar em "Tudo pronto"):

```bash
./infra/scripts/verificar.sh
```

### No notebook

1. **Instalar o app:** baixar o `MedicalField-Setup-1.0.0.exe` na página **Releases** do GitHub e instalar ("Mais informações" → "Executar assim mesmo"). Se o PC for Linux, o `MedicalField-1.0.0.AppImage` ([docs/12, 12.10](../docs/12-implantacao.md#1210-app-cliente-no-windows)).
2. **Limpar os ensaios:** rodar `apps/cliente/scripts/apagar-dados-locais.cmd`, com o app fechado (digite `APAGAR`).
3. **Ambulância 01:** abrir o **MedicalField**, servidor `http://IP-DA-VM`, nome `Ambulância 01`. Chave em **Online**, entrar com a **Dra. Ana** (CRM `12345-RS`). Isso libera o login offline dela e já traz a réplica de credenciais (o Carlos vai poder entrar offline no B3).
4. **Ambulância 02** (para o conflito, 11.4): abrir o atalho **MedicalField (Ambulância 02)**, nome `Ambulância 02`, entrar online com o **Enf. Bruno** (COREN `543210-RS`).
5. **Postman:** importar `postman/MedicalField.postman_collection.json` e `postman/MedicalField.postman_environment.json`; no ambiente, `baseUrl` = `http://IP-DA-VM`, `senha` = `<DEMO_SENHA>`, `emailDeTeste` = o seu e-mail.
6. **Abrir antes de começar:**
   - o navegador no portal, já na tela de login;
   - o Gmail da caixa de teste;
   - dois terminais SSH na VM: um para os scripts e outro para o banco (seção 2, passo 9);
   - a pasta `apresentacao/diagramas` (para mostrar as imagens).
7. Chave do app em **Online**, sem pendentes na fila.

### Contas de demonstração

| Perfil | Nome | Tipo | Registro | Usa em |
|---|---|---|---|---|
| ADMIN | Dr. Ricardo Almeida | CRM | `10001-RS` | Portal |
| OPERACIONAL | Dra. Ana Souza | CRM | `12345-RS` | App (Ambulância 01) |
| OPERACIONAL | Enf. Bruno Lima | COREN | `543210-RS` | App (Ambulância 02) |
| OPERACIONAL | Carlos Pereira | ID de Socorrista | `SOC-0001` | Login offline pela réplica (B3) |

Todas com a `<DEMO_SENHA>`. Dados já carregados: 12 medicamentos, 2 pessoas (João da Silva e Ana Beatriz Costa), 2 prontuários, 2 atendimentos.

---

## 1. Abertura: como o sistema é feito (3 a 5 minutos)

Mostre as imagens nesta ordem (todas em `diagramas/`):

| Imagem | O que falar |
|---|---|
| `01-arquitetura.png` | Um app desktop que grava tudo num SQLite local e sincroniza com três microsserviços na VM, em três linguagens: **ms-auth** em TypeScript (Fastify), **ms-clinico** em Java (Spring Boot), **ms-docs** em Python (FastAPI). Na frente, o **Nginx** como proxy reverso / API Gateway: a única porta pública (80). Atrás, um PostgreSQL só, com um schema por serviço |
| `09-rede-e-portas.png` | Da internet só chegam a 80 (Nginx) e a 22 (SSH). Os serviços estão só na rede interna do Docker, e o banco só em `127.0.0.1` |
| `11-app-por-dentro.png` | O Electron tem dois processos: as telas (isoladas, sem rede nem banco) e o núcleo (Node.js), que conversam por IPC num contrato tipado |
| `10-padroes-de-projeto.png` | Os três padrões sugeridos (Repository, Strategy, Observer) e os três escolhidos (Command, Adapter, Builder), cada um com onde está e para quê |

Os outros diagramas servem para responder perguntas na hora (seção 5).

---

## 2. Roteiro do enunciado (17 passos)

### Passo 1 · Portal: login do admin

1. Mostre que o perfil operacional é recusado: entre com a Dra. Ana (`12345-RS`). Aparece **"Acesso restrito a administradores"**.
2. Entre com o **Dr. Ricardo** (`10001-RS`). Abre a página **Atendimentos**.

> O portal é só leitura e só para ADMIN (D-17). O servidor confere o perfil de novo nas rotas de admin: com o token da Dra. Ana, `GET /api/log/acesso` responde `403`.

### Passos 2, 3 e 4 · Portal: cadastros, prontuários e atendimentos

Abra **Pessoas**, **Profissionais** e **Medicamentos** (os de demonstração); depois **Prontuários** (2) e **Atendimentos** (2).

### Passo 5 · App: login online

No app (**Ambulância 01**), chave em **Online**, entre com a **Dra. Ana**. A barra de cima mostra o profissional e "Online".

> O login gera um JWT de 15 minutos (assinado pelo ms-auth com a chave privada) e um refresh token de 7 dias, guardado cifrado pelo cofre do Windows. E o app guarda um verificador da senha para o login offline. Diagrama `07-login-e-tokens.png`.

### Passo 6 · App: receber dados

Clique em **Sincronizar**. Os pacientes e os medicamentos aparecem; "Última sincronização" é atualizada.

> É o `GET /api/sync/pull?desde=<cursor>`: traz só o que mudou desde a última vez. Diagrama `05-sincronizacao.png`.

### Passo 7 · App: atendimento online

**Nova ocorrência** → buscar **João da Silva** → **Selecionar** → **Usar este prontuário** → preencher o atendimento (tipo, queixa, triagem, sinais vitais, um medicamento, desfecho) → **Salvar**. Aparece "Salvo no aparelho" e o selo vira **Sincronizado** em instantes. A fila fica vazia.

> Mesmo online, o app grava primeiro no SQLite, com um item na fila (outbox), e a fila sai na hora. É um caminho só para online e offline (D-11). Diagrama `04-offline-first.png`.

### Passo 8 · Portal: o atendimento chegou

**Atendimentos** → **Atualizar**. O novo está no topo: dispositivo `Ambulância 01`, modo **Online**.

### Passo 9 · Banco: inserir um medicamento direto no SQL

No **segundo terminal SSH**, entre no banco **do projeto**. Use uma destas três opções (todas abrem o mesmo banco):

Pelo script (mais fácil, a partir da pasta do projeto):

```bash
./infra/scripts/psql.sh
```

Pelo Docker (na pasta `infra/`):

```bash
cd ~/offline-first-medical-record/infra && sudo docker compose exec db psql -U postgres -d medicalfield
```

Pelo `psql` da própria VM, na porta do projeto (pede a senha: `postgres`). O `psql` não vem instalado na VM; para ter, uma vez: `sudo apt install -y postgresql-client`.

```bash
psql -h 127.0.0.1 -p 5433 -U postgres -d medicalfield
```

> **Atenção:** `psql -U postgres` sozinho (sem `-h 127.0.0.1 -p 5433 -d medicalfield`) não acha o banco: ele procura um Postgres instalado direto na VM, e o do projeto está num container. As duas primeiras opções acima funcionam sem instalar nada.

Dentro do psql (o prompt é `medicalfield=#`):

```sql
INSERT INTO clinico.medicamento (nome, apresentacao, unidade_padrao)
VALUES ('Cetoprofeno', 'Frasco-ampola 100 mg', 'MG');
```

Resultado: **`INSERT 0 1`**. Para mostrar que entrou:

```sql
SELECT nome, apresentacao, criado_em FROM clinico.medicamento ORDER BY criado_em DESC LIMIT 3;
```

Deixe o psql aberto (vai usar no extra de auditoria). Para sair: `\q`.

> Alternativa num comando só: `./infra/scripts/medicamento.sh` (mostra o SQL e o `INSERT 0 1`). Se o Cetoprofeno já existir (num segundo ensaio), o `INSERT` normal dá certo do mesmo jeito, mas cria um segundo. Por isso o `zerar.sh` antes da apresentação.

### Passo 10 · Portal: atendimentos e medicamentos

**Atendimentos**: sem mudança. **Medicamentos**: o **Cetoprofeno** já aparece.

> O enunciado diz "listar atendimentos" depois de inserir um medicamento. Provavelmente queria dizer medicamentos; mostramos as duas listas (ambiguidade A7).

### Passo 11 · App: receber o medicamento novo

Clique em **Sincronizar**. Em **Nova ocorrência**, na lista de medicamentos do atendimento, o **Cetoprofeno** aparece.

> O insert feito à mão no SQL entrou no "receber dados" porque o `atualizado_em` do medicamento tem valor padrão e gatilho.

### Passo 12 · App: ocorrência completa offline

1. Chave em **Offline**. A barra avisa "Modo offline: tudo está sendo salvo neste aparelho".
2. **Nova ocorrência** → **Cadastrar nova pessoa**: **Maria Oliveira**, CPF **`935.411.347-80`**, com o e-mail de um familiar (use a caixa de teste, para o passo 17).
3. **Prontuário**: alergias, tipo sanguíneo.
4. **Atendimento** usando o **Cetoprofeno** → **Salvar**.
5. A barra mostra **3 pendentes**. Abra **Fila de sincronização**: os três itens em ordem (pessoa, prontuário, atendimento).

> Cada item da fila é um **Command** (`CriarPessoa`, `CriarProntuario`, `CriarAtendimento`). A ordem importa por causa das chaves estrangeiras: o prontuário precisa da pessoa, e o atendimento do prontuário.

### Passo 13 · Portal: nada chegou

**Prontuários** e **Atendimentos** → **Atualizar**. **Maria não aparece**: com a chave em Offline, nenhuma requisição sai do aparelho (D-14).

### Passo 14 · App: a conexão volta

Chave em **Online**, sem clicar em mais nada. A fila esvazia sozinha (**Observer**): pendentes 0.

> O `EstadoConectividade` avisa o motor de sincronização quando a chave volta. Se a resposta se perdesse e o app reenviasse, o servidor responderia `JA_EXISTIA`: o ID é criado no aparelho, e reenviar nunca duplica.

### Passo 15 · Portal: chegou

**Prontuários** e **Atendimentos** → **Atualizar**. **Maria aparece**. No atendimento: modo **Offline**, e o horário do registro é anterior ao "recebido em".

### Passo 16 · PDF

Abra o atendimento da Maria (no portal ou no app) → **Baixar PDF**. Salva `ficha-atendimento-<número>.pdf`, com paciente, prontuário, triagem, Glasgow, sinais vitais, medicamentos, desfecho e rastreabilidade.

> O PDF é gerado no ms-docs (Python, WeasyPrint), pelo padrão **Builder**. O ms-docs busca o atendimento no ms-clinico, repassando o token de quem pediu.

### Passo 17 · E-mail

**Enviar por e-mail** → **Familiar** (ou **Outro**, digitando a caixa de teste) → **Enviar**. Status **Enviado**. Abra o Gmail: a mensagem chegou com o PDF anexado. No portal, **E-mails enviados** mostra o envio.

> O envio fica atrás de um **Adapter** (`EnvioPorSmtp`): trocar o Gmail por outro provedor não mexe nas rotas. Cada pedido tem um ID: repetir o mesmo pedido não manda outro e-mail.

---

## 3. Extras (se der tempo, ou se o professor pedir)

### 11.4 · O mesmo paciente em duas ambulâncias (conflito)

| # | Onde | O que fazer |
|---|---|---|
| A1 | Ambulância 02 | Já está logada com o Enf. Bruno (preparação). Clique em **Sincronizar** |
| A2 | As duas | Chave em **Offline** nas duas |
| A3 | Ambulância 01 | Pessoa nova, CPF **`286.255.878-87`**, telefone `51911110000`, **sem** e-mail; prontuário com alergias `Dipirona`; um atendimento |
| A4 | Ambulância 02 | Uns minutos depois: **a mesma pessoa** (mesmo CPF), telefone `51922220000`, **com** e-mail; prontuário com alergias `Penicilina` e tipo `O+`; um atendimento |
| A5 | Ambulância 01 | Chave em **Online**: sincroniza normal |
| A6 | Ambulância 02 | Chave em **Online**: a pessoa e o prontuário são **unificados**; a pessoa aparece uma vez só |
| A7 | Portal | **Pessoas** e **Prontuários**: telefone `51922220000` e alergias `Penicilina` (o **mais recente vence**), e o e-mail e o `O+` da 02 (complemento) |
| A8 | Portal | No prontuário: **dois atendimentos**, um de cada ambulância |
| A9 | Portal | **Conflitos**: duas entradas (pessoa e prontuário), com cada diferença, o valor mantido e o descartado |

> Diagrama `06-conflito.png`. A regra é um **Strategy**: para mostrar a outra, na VM, `./infra/scripts/estrategia.sh SERVIDOR_VENCE` (à mão: mudar `ESTRATEGIA_CONFLITO` no `infra/.env` e `sudo docker compose up -d ms-clinico`). Para voltar: `./infra/scripts/estrategia.sh MAIS_RECENTE_VENCE`.

### 11.5 · Login offline e sessão mantida

| # | O que fazer | O que aparece |
|---|---|---|
| B1 | Fechar o app e abrir de novo | Continua logado |
| B2 | **Sair** → chave em Offline → entrar com a **Dra. Ana** | Entra em **modo offline** (a credencial ficou guardada no passo 5) |
| B3 | **Sair** → entrar offline com o **Carlos** (ID de Socorrista `SOC-0001`) | Entra em **modo offline**, mesmo sem nunca ter entrado neste aparelho: a réplica de credenciais veio na sincronização (D-51) |
| B4 | Errar a senha da Dra. Ana 5 vezes, offline | "Bloqueado até HH:MM" (5 minutos) |
| B5 | Depois do bloqueio: entrar offline, registrar um atendimento, chave em **Online** | O app faz o login online sozinho e sincroniza |
| B6 | Portal → **Logs dos clientes** | `LOGIN_OFFLINE`, `LOGIN_FALHOU`, `CONECTIVIDADE_ALTERADA`, `ATENDIMENTO_CRIADO`…, cada um com o modo |

> Diagrama `08-login-offline.png`. O app confere a senha offline com um hash: scrypt (o verificador criado no login online deste aparelho) ou bcrypt (o hash que veio do servidor, guardado cifrado pelo cofre do Windows). A senha em si nunca é gravada.

### 11.6 · Postman

No Postman, pasta **1. Roteiro do Postman**: rode de C1 a C13, na ordem (ou **Run folder**). Os testes de cada requisição aparecem em **Test Results**.

| # | O que mostrar |
|---|---|
| C1 | `GET /api/medicamento` sem token → `401` |
| C2 | Login da Dra. Ana → o token fica guardado sozinho |
| C4, C5 | O mesmo `POST /api/pessoa` duas vezes → `CRIADO`, depois `JA_EXISTIA` (idempotência) |
| C6 | Outro ID, mesmo CPF → `UNIFICADO` |
| C7, C8 | Log de acesso com o token operacional → `403`; com o admin → `200`, e o `401` do C1 está lá |
| C10 a C12 | PDF; e-mail; o mesmo pedido de e-mail de novo → `200`, sem e-mail novo |

### 11.7 · Auditoria

No portal, **Logs de acesso** → filtrar o serviço `ms-clinico` e a rota `/api/atendimento`: aparecem os envios do passo 14 (IP do notebook, Dra. Ana, `POST`, `201`, tempo em ms).

No psql (segundo terminal), tentar alterar e apagar um log:

```sql
UPDATE auditoria.log_acesso SET status_code = 200;
```

```sql
DELETE FROM auditoria.log_acesso;
```

Resultado: **erro** nos dois ("Registros de auditoria não podem ser alterados nem apagados"), até para o usuário `postgres`. É um gatilho no banco (D-04).

### 11.8 · Um serviço fora do ar

No primeiro terminal:

```bash
./infra/scripts/servico.sh parar ms-docs
```

(à mão: `cd infra && sudo docker compose stop ms-docs`)

- Portal: **Baixar PDF** responde "O serviço responsável por esta rota está fora do ar" (`503`). Atendimentos, prontuários e logs continuam abrindo.
- App (Online): registrar um atendimento e pedir o e-mail. O atendimento sincroniza; o pedido de e-mail fica na fila, com nova tentativa marcada.

Para voltar:

```bash
./infra/scripts/servico.sh iniciar ms-docs
```

(à mão: `sudo docker compose start ms-docs`). Na próxima tentativa (ou em **Sincronizar**), o e-mail sai.

---

## 4. Banco pelo terminal: cola

Entrar (seção 2, passo 9) e, dentro do psql:

| Para | Comando |
|---|---|
| Listar os schemas | `\dn` |
| Tabelas de um schema | `\dt clinico.*` (ou `auth.*`, `documentos.*`, `auditoria.*`) |
| Colunas de uma tabela | `\d clinico.atendimento` |
| Ver uma linha "em pé" (tabelas largas) | `\x` (liga e desliga) |
| Horários em Brasília | `SET TIME ZONE 'America/Sao_Paulo';` |
| Sair | `\q` |

Consultas prontas:

```sql
-- Os últimos atendimentos: paciente, quando, online/offline e o aparelho
SELECT p.nome, a.data_hora, a.modo_registro, a.dispositivo_nome
FROM clinico.atendimento a
JOIN clinico.prontuario pr ON pr.id = a.prontuario_id
JOIN clinico.pessoa p ON p.id = pr.pessoa_id
ORDER BY a.data_hora DESC LIMIT 5;
```

```sql
-- Os profissionais (a senha só em bcrypt)
SELECT nome, tipo_registro, registro, perfil, ativo FROM auth.profissional ORDER BY nome;
```

```sql
-- Os últimos acessos à API (auditoria)
SELECT data_hora, servico, metodo, rota, status_code, tempo_ms FROM auditoria.log_acesso ORDER BY data_hora DESC LIMIT 10;
```

```sql
-- O que os aparelhos fizeram (inclusive offline)
SELECT data_hora, dispositivo_nome, acao, modo FROM auditoria.log_cliente ORDER BY data_hora DESC LIMIT 10;
```

```sql
-- Conflitos e e-mails
SELECT detectado_em, entidade, motivo, estrategia, dispositivo_nome FROM clinico.conflito ORDER BY detectado_em DESC;
SELECT solicitado_em, destinatario_email, status, erro FROM documentos.envio_email ORDER BY solicitado_em DESC;
```

```sql
-- Um profissional novo, direto no banco (o enunciado permite; a senha vai em bcrypt)
INSERT INTO auth.profissional (nome, tipo_registro, registro, perfil, senha_hash)
VALUES ('Dr. Novo', 'CRM', '99999-RS', 'OPERACIONAL', crypt('a-senha-dele', gen_salt('bf', 10)));
```

As tabelas, resumidas: `diagramas/02-banco-servidor.png` (servidor) e `diagramas/03-banco-local-sqlite.png` (app). As colunas de cada uma estão em [docs/05](../docs/05-modelo-de-dados.md).

### Docker pelo terminal (na pasta `infra/`, com `sudo`)

| Para | Comando |
|---|---|
| Ver o que está no ar | `sudo docker compose ps` |
| Logs de um serviço (`Ctrl+C` sai) | `sudo docker compose logs -f --tail 50 ms-clinico` |
| Parar / religar / reiniciar | `sudo docker compose stop ms-docs` · `start ms-docs` · `restart ms-auth` |
| Memória de cada container | `sudo docker stats --no-stream` |
| Testar uma rota | `curl -i http://localhost/api/pessoa` (responde `401`: existe e pede token) |

Mais comandos à mão: [docs/12, seção 12.15](../docs/12-implantacao.md#1215-fazendo-à-mão-sem-os-scripts).

---

## 5. Perguntas prováveis (respostas curtas)

| Pergunta | Resposta | Diagrama |
|---|---|---|
| Para que serve o Nginx? | Proxy reverso / API Gateway: a única porta pública. Roteia `/api/...` para o serviço certo, entrega o portal, repassa o IP real para a auditoria, responde `503` se um serviço cair e manda os cabeçalhos de segurança (CSP). **Quem confere o JWT são os serviços**, cada um sozinho | 01, 09 |
| Como funciona o JWT? | O ms-auth assina com a chave **privada** (RS256); os serviços conferem com a **pública**, sem consultar ninguém. Vale 15 min; o refresh token (7 dias) pede outro. Quem não tem a privada não consegue fabricar nem alterar um token | 07 |
| Onde fica o token? | Portal: `sessionStorage` (some ao fechar a aba). App: o JWT só na memória e o refresh token no SQLite, cifrado pelo cofre do Windows (DPAPI) | 07 |
| O que é offline-first aqui? | Tudo é gravado primeiro no SQLite, com um item na fila (outbox), numa transação. A fila sai quando há conexão, em ordem, um item por vez | 04 |
| E se a mesma coisa for enviada duas vezes? | O ID nasce no aparelho (UUID v7); o servidor faz `INSERT ... ON CONFLICT DO NOTHING` e responde `JA_EXISTIA`. Nunca duplica | 04 |
| E conflitos? | Como registro clínico não é editado, o conflito é criar a mesma coisa duas vezes (mesmo CPF). O servidor unifica campo a campo com a estratégia configurada (Strategy) e guarda as diferenças em Conflitos | 06 |
| Como entra offline quem nunca usou o aparelho? | A cada sincronização, o app recebe os profissionais ativos com o hash bcrypt da senha, guardado cifrado pelo cofre. Offline, confere a senha com esse hash (D-51) | 08 |
| Por que um banco só? | Um schema e um usuário por serviço: cada serviço só enxerga o que é seu (Database per Service possível com um servidor de banco). O `ms_auth` recebe "permission denied" se tentar ler o `clinico` | 02 |
| Os logs podem ser apagados? | Não: um gatilho recusa `UPDATE` e `DELETE` até para o `postgres` (mostrar no psql, seção 3) | 02 |
| A senha do banco é `postgres`? Não é inseguro? | O banco só escuta em `127.0.0.1` dentro da VM; da internet não se chega nele (D-49). A senha que protege o sistema publicado é a das contas (`DEMO_SENHA`), que não está no repositório | 09 |
| Quais padrões de projeto? | Repository, Strategy e Observer (sugeridos); Command, Adapter e Builder (escolhidos) | 10 |
| Como foi testado? | 196 testes automáticos, a coleção do Postman (51 requisições) e dois passeios automáticos (portal e app). Tudo roda a cada push no GitHub Actions, com o sistema inteiro no Docker | — |

---

## 6. Se algo der errado

| Sintoma | O que fazer |
|---|---|
| Qualquer coisa estranha | `./infra/scripts/verificar.sh`: ele diz o que está fora e como resolver |
| Um serviço não responde | `./infra/scripts/servico.sh logs ms-clinico` (ou o serviço da vez), depois `./infra/scripts/servico.sh reiniciar ms-clinico` |
| Login das contas recusado | `./infra/scripts/popular-demo.sh` (regrava a senha do `.env`, desbloqueia e reativa) |
| Passos 2 a 4 mostram registros a mais | Sobrou do ensaio: `./infra/scripts/zerar.sh` (e o `apagar-dados-locais.cmd` no notebook) |
| O app diz "Faça login online para sincronizar" | Clique em **Entrar online** na barra e digite a senha. Nada se perde |
| O e-mail não chega | `./infra/scripts/testar-email.sh <e-mail>` mostra a mensagem do Gmail. Confira o spam |
| `psql: command not found`, ou `psql -U postgres` não conecta | Use `./infra/scripts/psql.sh` (o `psql` de dentro do container), ou instale o cliente: `sudo apt install -y postgresql-client` |
| `docker compose` diz `no configuration file provided` | Faltou entrar na pasta: `cd ~/offline-first-medical-record/infra` |
| `permission denied ... docker.sock` | Faltou o `sudo` na frente do `docker` |

---

## 7. Depois da apresentação

- Na VM: `./infra/scripts/zerar.sh`, se quiser deixar o sistema limpo.
- No Gmail: apagar a senha de app em <https://myaccount.google.com/apppasswords> (a senha da conta não muda).

CPFs válidos de reserva, que não estão nos dados de demonstração: `390.533.447-05`, `718.263.954-82`, `604.872.139-04`.

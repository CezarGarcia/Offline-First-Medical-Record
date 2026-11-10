# MedicalField · Guia de demonstração

O documento da apresentação, em duas partes:

- **Parte I · O sistema:** cada peça do MedicalField, como ela funciona e onde está no repositório: arquitetura, serviços, app cliente, portal, bancos, os fluxos principais (login, offline-first, sincronização, conflitos, PDF, e-mail, auditoria), padrões de projeto, segurança e testes.
- **Parte II · A demonstração:** preparação do ambiente, os 17 passos do roteiro do enunciado (com o que acontece por trás de cada um), cenários complementares, comandos do banco e do Docker e solução de problemas.

As imagens estão em [`diagramas/`](diagramas). O passo a passo com o que falar em cada passo está no [`ROTEIRO-DA-APRESENTACAO.md`](ROTEIRO-DA-APRESENTACAO.md). A documentação completa, com cada decisão (D-01 em diante), está em [`docs/`](../docs).

Convenções: `IP-DA-VM` é o endereço da VM; `<DEMO_SENHA>` é a senha das contas de demonstração, definida na instalação. Caminhos são relativos à raiz do repositório.

---

# Parte I · O sistema

## 1. Visão geral

O MedicalField é um prontuário eletrônico para atendimento pré-hospitalar (ambulâncias). O profissional usa um **app desktop offline-first**, que grava tudo primeiro num banco local (SQLite) e sincroniza com o servidor quando há conexão. No servidor, **três microsserviços em três linguagens** ficam atrás de um **Nginx** (a única porta pública) e usam **um PostgreSQL com um schema por serviço**. Um **portal administrativo** no navegador mostra tudo o que chegou, gera o PDF da ficha e envia por e-mail.

Diagrama `01-arquitetura.png`.

| Componente | Responsabilidade | Tecnologia | Onde roda | Porta | Pasta |
|---|---|---|---|---|---|
| **App cliente** | Login online e offline, ficha de atendimento, chave Online/Offline, fila de pendentes, sincronização | Electron 45 + React 19 + TypeScript + SQLite (`node:sqlite`) | PC do profissional (Windows ou Linux) | — | `apps/cliente/` |
| **Portal Admin** | Login de admin, listagens, detalhes, PDF, e-mail, logs, conflitos, Swagger | React 19 + TypeScript + Vite + BoardUI (Tailwind v4) | Navegador, servido pelo Nginx | 80 | `apps/portal/` |
| **Nginx** | API Gateway e proxy reverso: encaminha `/api/...`, entrega o portal, repassa o IP real, cabeçalhos de segurança | Nginx | VM (Docker) | **80 (pública)** | `infra/nginx/` |
| **ms-auth** | Login, sessão e tokens, profissionais, réplica de credenciais, logs (recebe os dos clientes e lista os de acesso) | TypeScript, Node.js, Fastify | VM (Docker) | 3000 (interna) | `servicos/ms-auth/` |
| **ms-clinico** | Pessoas, prontuários, atendimentos, medicamentos, idempotência, unificação de duplicados, "receber dados" | Java 21, Spring Boot 4 | VM (Docker) | 8080 (interna) | `servicos/ms-clinico/` |
| **ms-docs** | PDF da ficha, envio por e-mail, histórico de envios | Python 3.13, FastAPI | VM (Docker) | 8000 (interna) | `servicos/ms-docs/` |
| **PostgreSQL** | Banco central: schemas `auth`, `clinico`, `documentos` e `auditoria` | PostgreSQL 18 | VM (Docker) | 5433 (só `127.0.0.1`) | `infra/postgres/` |
| **Código compartilhado** | Tipos da API, rótulos, formatação, validação e geração de IDs, usados pelo portal e pelo app | TypeScript | — | — | `apps/compartilhado/` |

### Estrutura do repositório

```
offline-first-medical-record/
├── apps/
│   ├── cliente/           app desktop (Electron): src/main (núcleo), src/preload, src/renderer (telas)
│   ├── portal/            Portal Admin (React); o Dockerfile gera a imagem do Nginx com o portal
│   └── compartilhado/     tipos, rótulos, formatos, validação e IDs (portal e cliente)
├── servicos/
│   ├── ms-auth/           TypeScript: src/rotas, src/seguranca, src/plugins, migrations/
│   ├── ms-clinico/        Java: src/main/java/br/univates/medicalfield/clinico/..., db/migration (Flyway)
│   └── ms-docs/           Python: ms_docs/ (rotas, ficha, correio, envios), migracoes/ (Alembic)
├── infra/
│   ├── docker-compose.yml os cinco containers e a rede interna
│   ├── .env.example       modelo de configuração (o .env real fica fora do Git)
│   ├── nginx/conf.d/      medicalfield.conf: as rotas do gateway
│   ├── postgres/init/     01-estrutura.sh: schemas, usuários e permissões
│   ├── seed/              dados de demonstração (profissionais e cadastros clínicos)
│   ├── scripts/           instalar, atualizar, zerar e verificar (.sh e .ps1)
│   └── secrets/           chaves do JWT (fora do Git)
├── postman/               coleção e ambiente (rodam também pelo Newman)
├── docs/                  documentação completa (01 a 13)
├── apresentacao/          este guia, o roteiro e os diagramas
└── .github/workflows/     testes.yml (testes a cada push) e instaladores.yml (.exe e AppImage)
```

---

## 2. Arquitetura, rede e comunicação

Diagramas `01-arquitetura.png` e `09-rede-e-portas.png`.

### Rede e portas na VM

```
Internet ──► :80  Nginx ──► rede interna do Docker ──► ms-auth:3000
                                                   ├─► ms-clinico:8080
                                                   └─► ms-docs:8000
         ──► :22  SSH (administração)

127.0.0.1:5433 ──► PostgreSQL (só a própria VM; de fora, por túnel SSH)
```

- Da internet só se chega às portas **80** (Nginx) e **22** (SSH). Os serviços não publicam porta: só o Nginx fala com eles, pela rede interna do Docker (`interna`, em `infra/docker-compose.yml`).
- O banco é publicado só em `127.0.0.1:5433`: acessível de dentro da VM, nunca da internet (D-49).

### O Nginx (API Gateway)

Configuração: `infra/nginx/conf.d/medicalfield.conf`. Uma regra `location` por serviço, pelo prefixo da rota:

| Prefixo da rota | Serviço | Linguagem |
|---|---|---|
| `/api/auth`, `/api/profissional`, `/api/log`, `/api/docs/ms-auth` | ms-auth | TypeScript |
| `/api/pessoa`, `/api/prontuario`, `/api/atendimento`, `/api/medicamento`, `/api/sync`, `/api/conflito`, `/api/docs/ms-clinico` | ms-clinico | Java |
| `/api/documentos`, `/api/docs/ms-docs` | ms-docs | Python |
| `/` (o resto) | arquivos do portal | — |

O que o Nginx faz e o que não faz:

- encaminha o caminho **sem mudança** e repassa o IP real em `X-Real-IP` (usado pela auditoria);
- descobre os serviços pelo DNS do Docker **na hora da requisição**: sobe mesmo com um serviço parado e responde `503 SERVICO_INDISPONIVEL` só para as rotas dele;
- envia os cabeçalhos de segurança do portal: CSP (só scripts, fontes e dados do próprio servidor), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`;
- **não confere o JWT**: cada serviço valida o token sozinho, com a chave pública.

### Quem fala com quem

| De → Para | Como |
|---|---|
| App cliente → Nginx | HTTP/JSON + `Authorization: Bearer`, só com a chave em Online. Envia `X-Dispositivo-Id` e `X-Dispositivo-Nome` |
| Portal → Nginx | HTTP/JSON + Bearer, no mesmo endereço do portal (sem CORS) |
| Postman → Nginx | HTTP/JSON + Bearer, com login automático pela coleção |
| Serviços → PostgreSQL | Cada um com o próprio usuário, que só enxerga o próprio schema |
| ms-docs → ms-clinico | A única chamada entre serviços: busca o atendimento para o PDF, repassando o token, o IP e o dispositivo de quem pediu |
| ms-docs → Gmail | SMTP com TLS (porta 587) |

---

## 3. Os microsserviços

Os três seguem a mesma organização: **rotas → serviço (regras) → repositório (SQL)**, um filtro de autenticação que confere o JWT e um interceptor de log de acesso em volta de toda requisição. Toda rota exige token, **menos `POST /api/auth/login`** (D-19). Cada um publica a própria especificação OpenAPI em `GET /api/docs/<serviço>`, mostrada no portal (página **API (Swagger)**).

### ms-auth (TypeScript, Fastify)

| Rota | O que faz |
|---|---|
| `POST /api/auth/login` | Confere tipo de registro + registro + senha (bcrypt). 5 erros seguidos bloqueiam por 5 min (`423`). Cria a sessão e devolve JWT + refresh token |
| `POST /api/auth/refresh` | Novo JWT a partir do refresh token (confere sessão não revogada, validade e profissional ativo) |
| `POST /api/auth/logout` | Revoga a sessão |
| `GET /api/auth/me` | Quem está logado |
| `GET /api/auth/credenciais-offline` | A réplica de credenciais: profissionais ativos com o hash bcrypt (login offline, D-51) |
| `GET /api/profissional` (admin) | Lista de profissionais |
| `POST /api/log` | Recebe em lote os logs dos aparelhos (idempotente pelo `id` de cada log) |
| `GET /api/log/acesso`, `GET /api/log/cliente` (admin) | Listagens de auditoria, com filtros e paginação |

| Arquivo | Papel |
|---|---|
| `src/app.ts`, `src/index.ts` | Monta o Fastify e sobe o servidor |
| `src/rotas/auth.ts`, `profissionais.ts`, `logs.ts`, `docs.ts` | As rotas |
| `src/seguranca/tokens.ts` | Emite e confere o JWT (biblioteca `jose`, RS256) |
| `src/seguranca/chaves.ts` | Carrega as chaves privada e pública de `infra/secrets/` |
| `src/seguranca/senha.ts` | bcrypt |
| `src/repositorios/` | `profissionais.ts`, `sessoes.ts`, `logs.ts`: todo o SQL (Repository) |
| `src/plugins/autenticacao.ts` | Confere o Bearer em toda rota protegida |
| `src/plugins/logAcesso.ts` | Log de acesso: ganchos `onRequest` (início) e `onResponse` (grava) |
| `migrations/001_auth.sql`, `002_auditoria.sql` | Tabelas `auth.*` e `auditoria.*` (inclusive o gatilho que impede alterar logs) |

### ms-clinico (Java 21, Spring Boot 4)

| Rota | O que faz |
|---|---|
| `GET/POST /api/pessoa` | Lista e cadastra pessoas. O `POST` é idempotente e unifica pelo CPF |
| `GET /api/prontuario`, `GET /api/prontuario/{id}`, `POST /api/prontuario` | Prontuários (um por pessoa; o segundo é unificado) |
| `GET /api/atendimento`, `GET /api/atendimento/{id}`, `GET /api/atendimento/detalhe/{id}`, `POST /api/atendimento` | Atendimentos e os medicamentos administrados. O `detalhe` traz tudo junto (usado pelo ms-docs) |
| `GET /api/medicamento` | Catálogo de medicamentos |
| `GET /api/sync/pull?desde=<cursor>` | "Receber dados": tudo o que mudou desde o cursor |
| `GET /api/conflito` (admin) | Unificações feitas, com as diferenças |

As respostas de cadastro dizem o que aconteceu: `201 CRIADO`, `200 JA_EXISTIA` (reenvio do mesmo ID) ou `200 UNIFICADO` (duplicado absorvido).

| Pacote (`servicos/ms-clinico/src/main/java/br/univates/medicalfield/clinico/`) | Papel |
|---|---|
| `pessoa/`, `prontuario/`, `atendimento/`, `medicamento/` | Para cada entidade: `*Controller` (rotas), `Servico*` (regras), `Repositorio*` (SQL com `JdbcClient`), o registro e a entrada validada |
| `sincronizacao/` | `SincronizacaoController` e `ServicoSincronizacao`: o pull, numa transação `REPEATABLE READ` |
| `unificacao/` | `Mesclador` (mescla campo a campo), `EstrategiaDeMesclagem` + `MaisRecenteVence` + `ServidorVence` (Strategy), `Carimbos`, `Diferenca`, `RepositorioUnificacoes`, `ConflitoController` |
| `seguranca/` | `FiltroAutenticacao` e `LeitorDeToken` (conferem o JWT com Nimbus JOSE), `SomenteAdmin` + `InterceptorAdmin` (rotas de admin) |
| `auditoria/` | `FiltroLogAcesso` (um `OncePerRequestFilter` em volta de toda a cadeia) e `RegistradorDeAcessos` |
| `config/ConfiguracaoGeral.java` | Lê o `ESTRATEGIA_CONFLITO` e escolhe a estratégia |
| `comum/` | `Cpf` (dígitos verificadores), `Uuids`, `ResultadoCadastro`, origem e autor do registro |
| `erros/` | `TratadorDeErros`: o formato único de erro da API |
| `src/main/resources/db/migration/` | Flyway: `V1__clinico.sql` (tabelas e o gatilho do `atualizado_em` do medicamento) e `V2__unificacao.sql` |

### ms-docs (Python 3.13, FastAPI)

| Rota | O que faz |
|---|---|
| `GET /api/documentos/ficha/{id}/pdf` | Gera o PDF da ficha na hora (`ficha-atendimento-<8 últimos caracteres do ID>.pdf`), com `Cache-Control: no-store` |
| `POST /api/documentos/ficha/{id}/email` | Envia a ficha em PDF para `PACIENTE`, `FAMILIAR` ou `OUTRO`. Idempotente pelo `id` do pedido |
| `GET /api/documentos/email` (admin) | Histórico de envios |

| Arquivo (`servicos/ms-docs/ms_docs/`) | Papel |
|---|---|
| `__main__.py`, `principal.py` | Sobe o app e escolhe a implementação de e-mail conforme a configuração de SMTP |
| `rotas/documentos.py` | As rotas de PDF e e-mail |
| `clinico.py` | Cliente HTTP (`httpx`) que busca o atendimento no ms-clinico |
| `ficha/construtor.py` | `FichaPdfBuilder` e `MontadorDaFicha` (Builder); `ficha/modelos/ficha.html` e `ficha.css` (Jinja2 → WeasyPrint) |
| `correio/envio.py`, `correio/smtp.py` | `EnvioDeEmail`, `EnvioDesativado` e `EnvioPorSmtp` (Adapter sobre o `smtplib`) |
| `envios/` | `servico.py` (regra de idempotência), `repositorio.py` (`RepositorioEnvios`), `mensagem.py` (assunto e texto) |
| `seguranca.py` | Confere o JWT (PyJWT) |
| `auditoria.py` | Middleware ASGI do log de acesso, que grava numa thread separada |
| `migracoes/` | Alembic: `0001_envio_email.py` |

---

## 4. O app cliente

Diagrama `11-app-por-dentro.png`. Pasta `apps/cliente/`.

### Dois processos e o IPC

| Parte | Pasta | O que faz | O que **não** faz |
|---|---|---|---|
| **Telas** (renderização, React + Mantine) | `src/renderer/` | Mostra e coleta dados | Nunca acessa o SQLite nem a rede: roda com `contextIsolation`, `sandbox`, sem Node.js e com CSP |
| **Núcleo local** (processo principal, Node.js) | `src/main/nucleo/` | Banco, fila, HTTP, sincronização, conectividade, sessão, login offline, logs | Não depende do Electron (cofre, rede e "Salvar como" chegam de fora), por isso roda nos testes com Node.js puro |
| **Ponte** | `src/preload/index.ts` | Expõe só duas funções em `window.medicalfield`: chamar um método do contrato e ouvir os avisos do núcleo | — |
| **Contrato** | `src/comum/contrato.ts` | A API tipada (`ApiDoNucleo`) entre as telas e o núcleo | — |

### O núcleo, arquivo por arquivo (`apps/cliente/src/main/nucleo/`)

| Arquivo | Papel |
|---|---|
| `nucleo.ts` | A fachada: os métodos que as telas chamam |
| `banco.ts`, `migracoes.ts` | Abre o SQLite (WAL, `busy_timeout`) e aplica as migrações que faltam |
| `repositorios/` | Um repositório por tabela (`pessoas.ts`, `prontuarios.ts`, `atendimentos.ts`, `medicamentos.ts`, `outbox.ts`, `logs.ts`, `credenciais.ts`, `credenciais-do-servidor.ts`, `sessao.ts`, `config.ts`): o único lugar com SQL |
| `registros.ts` | Gravação local: registro + item da fila + log, numa transação |
| `comandos.ts` | Os comandos da fila (`CriarPessoa`, `CriarProntuario`, `CriarAtendimento`, `EnviarEmail`) |
| `sincronizacao.ts` | O motor: envio, recebimento, credenciais e logs |
| `conectividade.ts` | `EstadoConectividade`: a chave Online/Offline (Observer) |
| `http.ts` | O cliente HTTP: recusa tudo com a chave em Offline e cancela o que está saindo quando ela desliga |
| `sessao.ts`, `credencial.ts` | Sessão mantida, renovação do token e login offline (scrypt e bcrypt) |
| `auditoria.ts` | Logs locais |
| `../index.ts`, `../perfil.ts` | Janela, cofre (`safeStorage`), "Salvar como" do PDF, IPC e o `--perfil` (D-29) |

### Duas ambulâncias num PC só

Cada **perfil** (`--perfil=<nome>`) tem a própria pasta de dados, com outro SQLite e outra configuração. O instalador do Windows cria dois atalhos: **MedicalField** (perfil padrão) e **MedicalField (Ambulância 02)** (`--perfil=ambulancia-02`). O banco fica em `%APPDATA%\MedicalField\<perfil>\medicalfield.db` (Windows) ou em `~/.config/MedicalField/` (Linux); a tela **Sobre** mostra o caminho.

### Telas

| Tela | O que tem |
|---|---|
| **Configuração inicial** | Endereço do servidor e nome do dispositivo (só na primeira vez; depois, em **Sobre**) |
| **Login** | Tipo de registro (CRM, COREN, ID de Socorrista), registro, senha e a chave Online/Offline |
| **Nova ocorrência** | Assistente em 3 passos: pessoa (busca ou cadastro, avisa CPF repetido) → prontuário (mostra o existente) → atendimento (alergias em destaque, triagem, Glasgow, sinais vitais, medicamentos, desfecho) |
| **Pacientes** e **Atendimentos** | Listas do aparelho, com o selo **Pendente** / **Sincronizado**; no atendimento, **Baixar PDF** e **Enviar por e-mail** |
| **Fila de sincronização** | Cada item na ordem de envio, com status, tentativas, último erro e **Tentar de novo** |
| **Logs locais** | Ações registradas no aparelho e se já foram enviadas |
| **Sobre** | Versão, dispositivo, servidor, perfil, chave e caminho do banco local |

A barra superior mostra sempre: o profissional, a posição da chave, o número de pendentes, a última sincronização e avisos ("servidor inacessível", "faça login online para sincronizar", "N itens com erro").

---

## 5. O Portal Admin

Pasta `apps/portal/`. React servido como arquivos estáticos pelo próprio Nginx (o `apps/portal/Dockerfile` gera a imagem do Nginx já com o portal).

- **Só leitura e só para `ADMIN`** (D-17). O portal confere o perfil depois do login, e o servidor confere de novo nas rotas de admin (`403` com perfil operacional).
- **Sessão** no `sessionStorage` (`src/api/sessao.ts`, o `ArmazemDaSessao`): recarregar mantém, fechar a aba encerra. Renova o JWT sozinho quando faltam 30 s ou quando recebe `401`.
- **Páginas** (`src/paginas/`): Atendimentos (e o detalhe, com **Baixar PDF** e **Enviar por e-mail**), Prontuários, Pessoas, Medicamentos, Profissionais, Conflitos, Logs de acesso, Logs dos clientes, E-mails enviados e **API (Swagger)** em `/documentacao`.
- **Chamadas à API:** `src/api/cliente.ts` (token e renovação) e `src/api/consultas.ts` (TanStack Query).

---

## 6. Os bancos de dados

### PostgreSQL (servidor)

Diagrama `02-banco-servidor.png`. Um banco, `medicalfield`, com **um schema e um usuário por serviço** (Database per Service): `infra/postgres/init/01-estrutura.sh`.

| Schema | Dono (usuário) | Tabelas | Quem mais acessa |
|---|---|---|---|
| `auth` | ms-auth (`ms_auth`) | `profissional`, `sessao` | ninguém |
| `clinico` | ms-clinico (`ms_clinico`) | `pessoa`, `prontuario`, `atendimento`, `atendimento_medicamento`, `medicamento`, `unificacao`, `conflito` | ninguém |
| `documentos` | ms-docs (`ms_docs`) | `envio_email` | ninguém |
| `auditoria` | ms-auth (`ms_auth`) | `log_acesso`, `log_cliente` | ms-clinico e ms-docs: **só `INSERT`** |

Regras que ficam no próprio banco:

- **Auditoria imutável:** um gatilho (`auditoria.impedir_alteracao`, em `servicos/ms-auth/migrations/002_auditoria.sql`) recusa `UPDATE` e `DELETE` nos logs, até para o usuário `postgres` (D-04).
- **Medicamento inserido à mão entra no pull:** `atualizado_em` tem valor padrão e um gatilho (`clinico.tocar_atualizado_em`, em `V1__clinico.sql`).
- **Um prontuário por pessoa** e **CPF único quando preenchido**: restrições únicas, que também resolvem dois envios simultâneos.
- **Glasgow total calculado pelo banco** e combinações de triagem conferidas por `CHECK`.
- **Rastreabilidade:** todo registro clínico tem o bloco de origem: `criado_por_*`, `criado_em` (relógio do aparelho), `dispositivo_*`, `modo_registro` (`ONLINE`/`OFFLINE`), `sincronizado_por_id`, `recebido_em` e `atualizado_em` (relógio do servidor).
- **Registro clínico não é editado nem apagado** (D-08): só cresce.

Quem cria as tabelas é cada serviço, ao subir: ms-auth (`migrations/`, SQL), ms-clinico (Flyway) e ms-docs (Alembic). Os dados de demonstração estão em `infra/seed/`.

### SQLite (app cliente)

Diagrama `03-banco-local-sqlite.png`. Um arquivo por perfil, só acessado pelo núcleo.

| Tabela | Para quê |
|---|---|
| `pessoa`, `prontuario`, `atendimento`, `atendimento_medicamento`, `medicamento` | Espelho do servidor, com a coluna extra `estado_sync` (`PENDENTE`, `SINCRONIZADO`, `ERRO`) |
| `outbox` | A fila de pendentes: `ordem`, `tipo`, `payload` (o JSON exato a enviar), `status`, `tentativas`, `ultimo_erro`, `proxima_tentativa_em`, `resultado` |
| `log_local` | Ações feitas no aparelho, com o `enviado_em` |
| `credencial_offline` | Verificador scrypt de quem já entrou online neste aparelho |
| `credencial_servidor` | Réplica: hash bcrypt de todos os profissionais ativos, **cifrado pelo cofre do sistema** (D-51) |
| `sessao` | Quem está logado, com o refresh token cifrado pelo cofre |
| `config` | `servidor_url`, `dispositivo_id`, `dispositivo_nome`, `conectividade`, `cursor_pull`, `ultima_sincronizacao_em` |

O SQLite não tem chaves estrangeiras de propósito: quem garante a integridade é o servidor, e um registro que vem dele nunca pode ser recusado pelo aparelho.

---

## 7. Como funciona: os fluxos principais

### 7.1 Login online e tokens

Diagrama `07-login-e-tokens.png`.

1. O app (ou o portal) envia tipo de registro + registro + senha para `POST /api/auth/login`.
2. O ms-auth confere a senha com o bcrypt de `auth.profissional`. Errou 5 vezes seguidas: bloqueio de 5 minutos (`423`). Registro inexistente recebe a mesma resposta da senha errada, para não revelar quem existe.
3. Cria a sessão (`auth.sessao`) e devolve:
   - **JWT de 15 minutos**, assinado com a **chave privada** RSA (RS256). Leva `sub` (profissional), `sid` (sessão), nome, registro e perfil;
   - **refresh token de 7 dias**: 32 bytes aleatórios; o servidor guarda só o SHA-256. Não muda a cada renovação (D-06), para uma resposta perdida não derrubar a sessão.
4. Os outros serviços conferem o JWT com a **chave pública** (assinatura, emissor, público e validade), sem consultar o ms-auth. Quem não tem a privada não consegue fabricar nem alterar um token.

Onde ficam: no app, o JWT só na memória e o refresh token no SQLite, cifrado pelo cofre (DPAPI no Windows, `safeStorage`); no portal, no `sessionStorage`. As chaves são geradas na instalação e ficam em `infra/secrets/` (a privada só para o ms-auth).

### 7.2 Login offline

Diagrama `08-login-offline.png`. Arquivos `apps/cliente/src/main/nucleo/sessao.ts` e `credencial.ts`.

Com a chave em Offline, o app confere a senha com uma de duas fontes guardadas no SQLite:

| Fonte | De onde vem | Como confere |
|---|---|---|
| Credencial do aparelho (`credencial_offline`) | A cada login online neste aparelho | scrypt com sal aleatório (lento de propósito) |
| Réplica de credenciais (`credencial_servidor`) | A cada sincronização: `GET /api/auth/credenciais-offline` | bcrypt, o mesmo hash do servidor, guardado cifrado pelo cofre |

- A réplica é o que permite entrar offline **quem nunca entrou neste aparelho** (o Carlos, na demonstração). Pré-requisito: o aparelho ter sincronizado ao menos uma vez.
- Cada fonte vale **7 dias** desde a última confirmação pelo servidor. 5 erros seguidos bloqueiam por 5 minutos, também offline.
- A senha nunca vai para o disco. Depois de um login offline ela fica só na memória, e quando a conexão volta o app faz o login online sozinho para sincronizar.
- Fechar e abrir o app mantém o profissional logado; só **Sair**, a sessão vencer ou o profissional ser desativado encerram.

### 7.3 Gravação offline-first (outbox)

Diagrama `04-offline-first.png`. Arquivo `apps/cliente/src/main/nucleo/registros.ts`.

Ao salvar, o núcleo faz **numa única transação do SQLite**:

1. grava o registro com `estado_sync = PENDENTE`;
2. adiciona um item na `outbox` com o JSON exato que será enviado;
3. grava um log local (ex.: `ATENDIMENTO_CRIADO`).

Ou entra tudo, ou nada. **Online e offline usam o mesmo caminho** (D-11): online, a fila apenas sai na hora. O ID de cada registro nasce no aparelho (UUID v7), o que torna o reenvio seguro.

| Tipo do item | Requisição |
|---|---|
| `CRIAR_PESSOA` | `POST /api/pessoa` |
| `CRIAR_PRONTUARIO` | `POST /api/prontuario` |
| `CRIAR_ATENDIMENTO` | `POST /api/atendimento` |
| `ENVIAR_EMAIL` | `POST /api/documentos/ficha/{id}/email` |

### 7.4 A chave Online/Offline (Observer)

Arquivo `apps/cliente/src/main/nucleo/conectividade.ts`.

É o interruptor geral (D-14). Em **Offline**, o cliente HTTP recusa qualquer requisição, nem log nem teste de conexão: é o que garante que o portal não vê nada antes da hora (passo 13). Quando a chave muda, o `EstadoConectividade` avisa os inscritos:

- o **motor de sincronização** (`sincronizacao.ts`): foi para Online, sincroniza tudo; foi para Offline, cancela a próxima tentativa;
- o **cliente HTTP** (`http.ts`): foi para Offline, cancela o que estava saindo (o item volta para `PENDENTE`);
- o **núcleo** (`nucleo.ts`): grava a posição no SQLite, registra `CONECTIVIDADE_ALTERADA` e avisa as telas.

Com a chave em Online e o servidor sem responder, o app continua funcionando como offline, mostra "servidor inacessível" e tenta de novo sozinho.

### 7.5 Envio da fila (push)

Diagrama `05-sincronizacao.png`. Arquivos `sincronizacao.ts` e `comandos.ts`.

A fila sai **na ordem em que os itens foram criados, um por vez**: a pessoa antes do prontuário, o prontuário antes do atendimento (chaves estrangeiras no servidor). Para cada item: marca `ENVIANDO`, garante um JWT válido (renova se precisar), envia e trata a resposta:

| Resposta | O que o app faz |
|---|---|
| `201 CRIADO` / `200 JA_EXISTIA` | Item `CONCLUIDO`, registro `SINCRONIZADO` |
| `200 UNIFICADO` | Aplica a unificação no SQLite e conclui o item (7.7) |
| `401` | Renova o token e repete uma vez. Se não der, para a fila e pede "Entrar online" (só a senha). Nada se perde (D-46) |
| `400`, `403`, `404`, `422` | Item em `ERRO` com a mensagem; segue para o próximo |
| `500` | Até 3 tentativas, depois `ERRO` |
| Rede caiu, `502`, `503`, `504`, tempo esgotado | **Para a fila** (para não furar a ordem) e tenta de novo com espera crescente: 5 s, 10 s, 20 s… até 5 min |
| `502 FALHA_ENVIO_EMAIL` | Até 3 tentativas, **sem parar a fila** (nada depende de um e-mail) |

Se o app fechar no meio de um envio, os itens `ENVIANDO` voltam para `PENDENTE` na próxima abertura.

Quando a sincronização roda: chave vai para Online, botão **Sincronizar**, login online, app aberto em Online (tudo: envio → recebimento → credenciais → logs); algo salvo em Online (só o envio). Não há recebimento periódico automático.

### 7.6 Idempotência

A regra: **o primeiro envio de um ID vale; os seguintes devolvem o que já existe**. No servidor, a garantia vem do banco: chaves primárias e `INSERT ... ON CONFLICT DO NOTHING`.

| O que é enviado | Chave | Reenvio devolve |
|---|---|---|
| Pessoa, prontuário, atendimento | `id` do registro | `JA_EXISTIA` (ou `UNIFICADO`) |
| Pedido de e-mail | `id` do pedido | o mesmo resultado, sem mandar outro e-mail (D-36) |
| Logs do cliente | `id` de cada log | contados como repetidos |

Exemplo: o servidor grava um atendimento, mas a resposta se perde. O app reenvia; o servidor responde `JA_EXISTIA`. Nada duplica.

### 7.7 Conflitos (unificação de duplicados)

Diagrama `06-conflito.png`. Pacote `servicos/ms-clinico/.../unificacao/`.

Como registro clínico não é editado, o único conflito possível é **criar a mesma coisa duas vezes** antes de sincronizar:

| Situação | Como o servidor detecta | `motivo` |
|---|---|---|
| A mesma pessoa em dois aparelhos | Já existe pessoa com o mesmo **CPF** | `CPF_DUPLICADO` |
| Um segundo prontuário para a mesma pessoa | Já existe prontuário para a pessoa | `PRONTUARIO_DUPLICADO` |

O que o servidor faz:

1. Mantém o registro que já estava no servidor e absorve o que chegou, **campo a campo** (`Mesclador`):
   - vazio de um lado e preenchido do outro: fica o preenchido (`COMPLEMENTO`);
   - os dois preenchidos e diferentes (`CONFLITO`): a **estratégia** decide.
2. Grava o conflito em `clinico.conflito` (cada diferença, o valor mantido e o descartado) e o apelido em `clinico.unificacao` (ID descartado → ID mantido). Tudo que chegar depois com o ID descartado é traduzido sozinho.
3. Responde `UNIFICADO`, com o registro mantido. O app troca as referências no SQLite e apaga o descartado.

| Estratégia (Strategy) | Valores diferentes | Configuração em `infra/.env` |
|---|---|---|
| `MAIS_RECENTE_VENCE` (padrão) | Vence o de carimbo mais recente (cada campo guarda o seu em `carimbos`) | `ESTRATEGIA_CONFLITO=MAIS_RECENTE_VENCE` |
| `SERVIDOR_VENCE` | Fica o que já estava no servidor | `ESTRATEGIA_CONFLITO=SERVIDOR_VENCE` |

Atendimentos nunca são unificados: dois atendimentos são sempre dois. Pessoa sem CPF nunca é considerada duplicada. Tudo aparece no portal, na página **Conflitos**.

### 7.8 Recebimento (pull)

Rota `GET /api/sync/pull?desde=<cursor>` (`ServicoSincronizacao`).

- Traz o que **mudou no servidor** desde o cursor: medicamentos, pessoas, prontuários, atendimentos e unificações.
- O cursor é a hora do servidor no início da consulta; o app guarda em `config.cursor_pull`. A primeira vez, sem cursor, traz tudo.
- Margem de 30 segundos antes do cursor, para não perder uma gravação que terminou no meio. Repetir não faz mal: o app grava com *upsert*.
- A consulta roda em `REPEATABLE READ`: todas as listas mostram o mesmo instante.
- Depois do pull, o app troca a réplica de credenciais e envia os logs locais em lotes de até 500 (`POST /api/log`).

### 7.9 PDF da ficha (Builder)

Arquivo `servicos/ms-docs/ms_docs/ficha/construtor.py`.

1. O portal ou o app pede `GET /api/documentos/ficha/{id}/pdf`.
2. O ms-docs busca o atendimento completo no ms-clinico (`GET /api/atendimento/detalhe/{id}`), repassando o token, o IP e o dispositivo de quem pediu (aparece no log do ms-clinico com o mesmo profissional).
3. O `MontadorDaFicha` (o diretor) chama o `FichaPdfBuilder` seção por seção: cabeçalho, paciente, prontuário, ocorrência, triagem, avaliação (Glasgow e sinais vitais), medicamentos, desfecho, responsável e rastreabilidade. O `construir()` gera o PDF (Jinja2 → HTML → WeasyPrint).
4. O PDF é gerado a cada pedido, não fica guardado. Horários em Brasília; campo vazio aparece como "não informado"; rodapé com o aviso de LGPD.

No app, o botão fica desabilitado enquanto o atendimento está pendente: o PDF é gerado no servidor (D-15).

### 7.10 E-mail (Adapter)

Arquivos `servicos/ms-docs/ms_docs/correio/` e `envios/`.

1. `POST /api/documentos/ficha/{id}/email` com o `id` do pedido e o destinatário (`PACIENTE`, `FAMILIAR` ou `OUTRO` com o e-mail).
2. O ms-docs gera o PDF (7.9), monta a mensagem (assunto com paciente e data, texto curto, aviso de LGPD) e chama `enviar(mensagem)`.
3. Quem envia é a implementação de `EnvioDeEmail`: o `EnvioPorSmtp` adapta o `smtplib` para o Gmail (porta 587, TLS); sem SMTP configurado, entra o `EnvioDesativado`. Trocar de provedor não mexe nas rotas.
4. O envio fica em `documentos.envio_email` (`ENVIADO` ou `ERRO`, com o motivo). Repetir o mesmo `id` devolve o mesmo resultado sem mandar outro e-mail; se deu erro, tenta de novo.

Pedido feito offline no app vira item `ENVIAR_EMAIL` na fila, depois do atendimento.

### 7.11 Auditoria

**Log de acesso (servidor).** Os três serviços têm um interceptor em volta de toda requisição que grava em `auditoria.log_acesso`: data/hora, IP (`X-Real-IP`), profissional (do token), método, rota, status, tempo em ms, dispositivo e user-agent. Grava sem atrasar a resposta, e registra tudo, inclusive `401`, `403` e erros.

| Serviço | Mecanismo | Arquivo |
|---|---|---|
| ms-auth | Ganchos `onRequest` / `onResponse` do Fastify | `src/plugins/logAcesso.ts` |
| ms-clinico | `OncePerRequestFilter` do Spring | `auditoria/FiltroLogAcesso.java` |
| ms-docs | Middleware ASGI | `ms_docs/auditoria.py` |

**Log do cliente (aparelho).** O app registra em `log_local` o que acontece no aparelho, inclusive offline (`LOGIN_ONLINE`, `LOGIN_OFFLINE`, `LOGIN_FALHOU`, `CONECTIVIDADE_ALTERADA`, `PESSOA_CRIADA`, `ATENDIMENTO_CRIADO`, `EMAIL_SOLICITADO`, `SINCRONIZACAO_*`, `REGISTRO_UNIFICADO`…). Os logs sobem no fim de cada sincronização para `auditoria.log_cliente`.

Os dois são **imutáveis** (gatilho no banco) e aparecem no portal: **Logs de acesso** e **Logs dos clientes**.

---

## 8. Padrões de projeto

Diagrama `10-padroes-de-projeto.png`.

| Padrão | Origem | Como foi aplicado | Onde está implementado | Pontos do código |
|---|---|---|---|---|
| **Repository** | Enunciado | O acesso ao banco fica concentrado em classes próprias; telas e regras de negócio não conhecem a origem dos dados | `apps/cliente/src/main/nucleo/repositorios/` (um repositório por tabela); `servicos/ms-clinico/.../pessoa/RepositorioPessoas.java` (e os outros `Repositorio*`); `servicos/ms-docs/ms_docs/envios/repositorio.py` | Todo o SQL está nas classes `Repositorio*`; o restante do código chama métodos como `buscar()` e `gravarDoServidor()` |
| **Strategy** | Enunciado | A regra de resolução de conflitos é intercambiável: "o mais recente vence" ou "o servidor vence", definida por configuração | `servicos/ms-clinico/.../unificacao/`: `EstrategiaDeMesclagem.java`, `MaisRecenteVence.java`, `ServidorVence.java` | Interface com o método `decidir(carimboDoExistente, carimboDoRecebido)`; o `Mesclador.java` aplica a estratégia campo a campo; a seleção ocorre em `config/ConfiguracaoGeral.java` (`ESTRATEGIA_CONFLITO`) |
| **Observer** | Enunciado | A chave Online/Offline notifica os componentes inscritos; ao retornar a conexão, a fila de envio é processada automaticamente | `apps/cliente/src/main/nucleo/conectividade.ts` (`EstadoConectividade`); no portal, o `ArmazemDaSessao` (`apps/portal/src/api/sessao.ts`) | `mudar()` notifica os inscritos; `assinar()` registra um inscrito. Inscritos: `sincronizacao.ts` (sincroniza), `http.ts` (cancela requisições ao ficar offline) e `nucleo.ts` (persiste o estado e atualiza as telas) |
| **Command** | Escolhido | Cada item da fila de envio é um objeto que encapsula a requisição e o tratamento da resposta | `apps/cliente/src/main/nucleo/comandos.ts` | Interface `Comando` (`requisicao()`, `aplicar()`, `aoFalhar()`, `descrever()`) e as classes `CriarPessoa`, `CriarProntuario`, `CriarAtendimento` e `EnviarEmail`; o motor obtém o comando por `comandoPara(item)` e trata todos do mesmo jeito |
| **Adapter** | Escolhido | O envio de e-mail é feito por uma interface própria; o SMTP do Gmail é uma das implementações | `servicos/ms-docs/ms_docs/correio/`: `envio.py` (`EnvioDeEmail`, `EnvioDesativado`) e `smtp.py` (`EnvioPorSmtp`) | As rotas chamam apenas `enviar(mensagem)`; `EnvioPorSmtp` adapta o `smtplib`; a implementação é escolhida em `ms_docs/__main__.py` conforme a configuração de SMTP |
| **Builder** | Escolhido | O PDF da ficha de atendimento é construído por etapas, em ordem definida | `servicos/ms-docs/ms_docs/ficha/construtor.py` | `FichaPdfBuilder` com um método por seção (`cabecalho()`, `paciente()`...) e `construir()` ao final; `MontadorDaFicha.montar()` atua como diretor |

Padrões arquiteturais:

| Padrão | Para quê | Onde está implementado |
|---|---|---|
| **API Gateway** | Uma porta só, roteando para cada serviço | Nginx: `infra/nginx/conf.d/medicalfield.conf`, uma regra `location /api/...` por serviço |
| **Outbox** | Nenhuma operação se perde entre gravar e enviar | Tabela `outbox` (`apps/cliente/src/main/nucleo/migracoes.ts`) e `repositorios/outbox.ts` |
| **Database per Service** | Cada serviço só enxerga os próprios dados | Um schema e um usuário por serviço: `infra/postgres/init/01-estrutura.sh` |
| **Offline-First** | O aparelho nunca depende da rede para trabalhar | Registro e item da fila na mesma transação: `apps/cliente/src/main/nucleo/registros.ts` |

---

## 9. Segurança, em resumo

| Camada | Como é protegida |
|---|---|
| Identidade | Tipo de registro + registro + senha; senha em bcrypt no servidor; bloqueio de 5 min após 5 erros |
| Requisições | JWT RS256 em todas as rotas, menos o login; cada serviço confere sozinho com a chave pública |
| Autorização | Perfis `ADMIN` (portal) e `OPERACIONAL` (app); rotas de admin respondem `403` para operacional |
| Aparelho | Login offline por scrypt/bcrypt; refresh token e réplica cifrados pelo cofre do sistema; senha nunca gravada |
| Rede | Só 80 (Nginx) e 22 (SSH) abertas; serviços na rede interna do Docker; banco só em `127.0.0.1` |
| Portal | CSP, `X-Frame-Options`, `nosniff`, `no-referrer`; sessão no `sessionStorage`; sem CORS (mesmo endereço) |
| Banco | Um usuário por serviço, cada um só no próprio schema; auditoria só aceita `INSERT` |
| Segredos | `infra/.env` (senha das contas, Gmail) e `infra/secrets/` (chaves do JWT), fora do Git |

Fora do escopo, de propósito (D-20): HTTPS (depende de domínio, D-24), criptografia do arquivo SQLite (SQLCipher) e minimização dos dados por região. Detalhes e LGPD: [docs/08](../docs/08-seguranca-e-auditoria.md).

---

## 10. Testes e entrega

| O quê | Onde |
|---|---|
| Testes automatizados de cada parte (196, todos passando) | `servicos/*/test*`, `apps/*` ([docs/13](../docs/13-testes-automatizados.md)) |
| Coleção do Postman (51 requisições, com testes em cada uma) | `postman/` (roda pelo Newman) |
| Passeios automáticos pelo portal e pelo app | `apps/portal/e2e/passeio.mjs`, `apps/cliente/e2e/passeio.mjs` |
| GitHub Actions a cada push, com o sistema inteiro no Docker e o Mailpit como e-mail de teste | `.github/workflows/testes.yml` |
| Instaladores do app (`.exe` no Windows, AppImage no Linux), anexados à página Releases | `.github/workflows/instaladores.yml` |
| Scripts de operação da VM (`instalar`, `atualizar`, `zerar`, `verificar`, em `.sh` e `.ps1`) | `infra/scripts/` ([docs/12](../docs/12-implantacao.md)) |

---

# Parte II · A demonstração

## 11. Preparação

### 11.1 Aplicativo cliente

Instaladores em <https://github.com/CezarGarcia/offline-first-medical-record/releases>. Um único aplicativo atende as duas ambulâncias: cada uma é uma instância com banco de dados próprio.

| Sistema | Arquivo | Instâncias |
|---|---|---|
| Windows | `MedicalField-Setup-1.0.0.exe` ("Mais informações" → "Executar assim mesmo") | Atalhos **MedicalField** (Ambulância 01) e **MedicalField (Ambulância 02)** |
| Linux | `MedicalField-1.0.0.AppImage` | Um comando por instância, cada um em um terminal |

No Linux:

```bash
chmod +x MedicalField-1.0.0.AppImage
```

```bash
APPIMAGE_EXTRACT_AND_RUN=1 ./MedicalField-1.0.0.AppImage --no-sandbox
```

```bash
APPIMAGE_EXTRACT_AND_RUN=1 ./MedicalField-1.0.0.AppImage --no-sandbox --perfil=ambulancia-02
```

Configuração inicial de cada instância: servidor `http://IP-DA-VM` e nome do dispositivo (`Ambulância 01` ou `Ambulância 02`), seguidos de um login online (Dra. Ana, CRM `12345-RS`, na 01; Enf. Bruno, COREN `543210-RS`, na 02). O login online da Dra. Ana já traz a réplica de credenciais (permite o login offline do Carlos).

Limpar ensaios anteriores, com o app fechado: no Windows, `apps/cliente/scripts/apagar-dados-locais.cmd` (digitar `APAGAR`); no Linux, `rm -rf ~/.config/MedicalField`.

### 11.2 Servidor na VM

```bash
ssh univates@IP-DA-VM
```

Instalação completa, a partir de uma VM sem o projeto (instala o Docker, o código, o banco e os dados de demonstração; pergunta a `DEMO_SENHA` e o Gmail):

```bash
curl -fsSL https://raw.githubusercontent.com/CezarGarcia/offline-first-medical-record/main/infra/scripts/instalar.sh | bash
```

Ambiente já instalado: atualização, retorno ao estado inicial do roteiro e verificação (deve terminar em "Tudo pronto").

```bash
cd ~/offline-first-medical-record
```

```bash
./infra/scripts/atualizar.sh
```

```bash
./infra/scripts/zerar.sh
```

```bash
./infra/scripts/verificar.sh
```

Os scripts rodam **sem** `sudo` (eles mesmos chamam o Docker com `sudo`, D-50). À mão, todo comando `docker` vai com `sudo`.

Acesso ao banco de dados (usado no passo 9), num segundo terminal:

```bash
cd ~/offline-first-medical-record/infra && sudo docker compose exec db psql -U postgres -d medicalfield
```

### 11.3 Postman

Importar `postman/MedicalField.postman_collection.json` e `postman/MedicalField.postman_environment.json`; no ambiente, `baseUrl` = `http://IP-DA-VM`, `senha` = `<DEMO_SENHA>`, `emailDeTeste` = a caixa de teste.

### 11.4 Contas e dados de demonstração

| Perfil | Nome | Tipo | Registro | Usa em |
|---|---|---|---|---|
| ADMIN | Dr. Ricardo Almeida | CRM | `10001-RS` | Portal |
| OPERACIONAL | Dra. Ana Souza | CRM | `12345-RS` | App (Ambulância 01) |
| OPERACIONAL | Enf. Bruno Lima | COREN | `543210-RS` | App (Ambulância 02) |
| OPERACIONAL | Carlos Pereira | ID de Socorrista | `SOC-0001` | Login offline pela réplica |

Todas com a `<DEMO_SENHA>`. Dados carregados (`infra/seed/`): 12 medicamentos, 2 pessoas (João da Silva e Ana Beatriz Costa), 2 prontuários e 2 atendimentos.

### 11.5 Abrir antes de começar

O portal na tela de login; o Gmail da caixa de teste; dois terminais SSH na VM (scripts e banco); a pasta `apresentacao/diagramas`; o app com a chave em **Online** e a fila vazia.

---

## 12. Roteiro de testes (os 17 passos do enunciado)

| # | Onde | Ação | Resultado esperado | O que acontece por trás |
|---|---|---|---|---|
| 1 | Portal `http://IP-DA-VM/` | Login com **Dr. Ricardo** (CRM `10001-RS`) | Acesso ao portal; perfil operacional recusado ("Acesso restrito a administradores") | Portal só para `ADMIN` (D-17); o servidor confere de novo nas rotas de admin (7.1) |
| 2 | Portal | Pessoas, Profissionais e Medicamentos | Cadastros de demonstração | Leitura no ms-clinico e no ms-auth, cada uma registrada no log de acesso |
| 3 | Portal | Prontuários | 2 prontuários | — |
| 4 | Portal | Atendimentos | 2 atendimentos | — |
| 5 | Ambulância 01 | Chave **Online**; login com **Dra. Ana** | Profissional e modo Online na barra superior | JWT de 15 min + refresh token de 7 dias; o app guarda o verificador scrypt (7.1, 7.2) |
| 6 | Ambulância 01 | **Sincronizar** | Pacientes e medicamentos disponíveis no aplicativo | `GET /api/sync/pull` traz o que mudou; o app grava com upsert (7.8) |
| 7 | Ambulância 01 | Nova ocorrência → João da Silva → Selecionar → Usar este prontuário → atendimento → Salvar | "Salvo no aparelho" e o selo **Sincronizado** em instantes | Grava no SQLite + item na outbox; online, a fila sai na hora (7.3, 7.5) |
| 8 | Portal | Atendimentos → Atualizar | Novo atendimento no topo, dispositivo `Ambulância 01`, modo **Online** | Bloco de origem gravado com o registro (seção 6) |
| 9 | Banco de dados | Inserção do medicamento (SQL abaixo) | `INSERT 0 1` | `atualizado_em` preenchido pelo valor padrão do banco |
| 10 | Portal | Medicamentos e Atendimentos | **Cetoprofeno** na lista de medicamentos | O enunciado diz "atendimentos"; mostramos as duas listas (ambiguidade A7) |
| 11 | Ambulância 01 | **Sincronizar** | Cetoprofeno disponível no formulário de atendimento | O pull usa o `atualizado_em`: o insert à mão entra (7.8) |
| 12 | Ambulância 01 | Chave **Offline** → nova pessoa **Maria Oliveira** (CPF `935.411.347-80`, com e-mail do familiar = caixa de teste) → prontuário → atendimento com Cetoprofeno | **3 pendentes** na fila de sincronização, em ordem | Três **Commands** na outbox: pessoa, prontuário, atendimento (7.3) |
| 13 | Portal | Prontuários e Atendimentos → Atualizar | Maria Oliveira **não** aparece | Em Offline, nenhuma requisição sai do aparelho (D-14, 7.4) |
| 14 | Ambulância 01 | Chave **Online** (sem clicar em mais nada) | Fila esvaziada automaticamente | **Observer**: a chave avisa o motor, que envia em ordem; reenvio daria `JA_EXISTIA` (7.4 a 7.6) |
| 15 | Portal | Prontuários e Atendimentos → Atualizar | Maria Oliveira aparece; atendimento em modo **Offline**, registro anterior ao "recebido em" | `criado_em` é do aparelho; `recebido_em` é do servidor |
| 16 | Portal | Atendimento de Maria Oliveira → **Baixar PDF** | `ficha-atendimento-<número>.pdf` | ms-docs busca no ms-clinico e monta pelo **Builder** (7.9) |
| 17 | Portal | **Enviar por e-mail** → Familiar → Enviar | Status **Enviado**; e-mail com a ficha em PDF anexada; registro em **E-mails enviados** | **Adapter** `EnvioPorSmtp`; o `id` do pedido evita e-mail repetido (7.10) |

Passo 9, no psql (prompt `medicalfield=#`):

```sql
INSERT INTO clinico.medicamento (nome, apresentacao, unidade_padrao) VALUES ('Cetoprofeno', 'Frasco-ampola 100 mg', 'MG');
```

```sql
SELECT nome, apresentacao, criado_em FROM clinico.medicamento ORDER BY criado_em DESC LIMIT 3;
```

Num segundo ensaio sem zerar, o `INSERT` cria outro Cetoprofeno: por isso o `zerar.sh` antes da apresentação.

---

## 13. Cenários complementares

### Conflito entre ambulâncias

Diagrama `06-conflito.png`.

| # | Onde | O que fazer |
|---|---|---|
| 1 | Ambulância 02 | Logada com o Enf. Bruno: **Sincronizar** |
| 2 | As duas | Chave em **Offline** |
| 3 | Ambulância 01 | Pessoa nova, CPF `286.255.878-87`, telefone `51911110000`, **sem** e-mail; prontuário com alergias `Dipirona`; um atendimento |
| 4 | Ambulância 02 | Minutos depois, a **mesma pessoa** (mesmo CPF), telefone `51922220000`, **com** e-mail; prontuário com alergias `Penicilina` e tipo `O+`; um atendimento |
| 5 | Ambulância 01 | Chave em **Online**: sincroniza normal (`CRIADO`) |
| 6 | Ambulância 02 | Chave em **Online**: pessoa e prontuário **unificados** (`UNIFICADO`) |
| 7 | Portal | Pessoas e Prontuários: telefone `51922220000` e alergias `Penicilina` (o mais recente vence), e o e-mail e o `O+` da 02 (complemento) |
| 8 | Portal | No prontuário: **dois atendimentos**, um de cada ambulância |
| 9 | Portal | **Conflitos**: duas entradas (pessoa e prontuário), com cada diferença, o valor mantido e o descartado |

**Troca da estratégia (Strategy).** Na VM, na pasta `infra/`: `nano .env`, linha `ESTRATEGIA_CONFLITO=SERVIDOR_VENCE` (salvar com `Ctrl+O`, `Enter`, `Ctrl+X`), seguido de:

```bash
sudo docker compose up -d ms-clinico
```

Para voltar, o mesmo com `MAIS_RECENTE_VENCE`.

### Login offline e sessão mantida

Diagrama `08-login-offline.png`.

| # | O que fazer | O que aparece |
|---|---|---|
| 1 | Fechar o app e abrir de novo | Continua logado |
| 2 | **Sair** → chave **Offline** → **Dra. Ana** | Entra em modo offline (credencial do aparelho, scrypt) |
| 3 | **Sair** → **Carlos**, ID de Socorrista `SOC-0001` | Entra em modo offline sem nunca ter usado o aparelho (réplica, bcrypt, D-51) |
| 4 | Errar a senha da Dra. Ana 5 vezes, offline | "Bloqueado até HH:MM" (5 minutos) |
| 5 | Entrar offline, registrar um atendimento, chave em **Online** | O app faz o login online sozinho e sincroniza |
| 6 | Portal → **Logs dos clientes** | `LOGIN_OFFLINE`, `LOGIN_FALHOU`, `CONECTIVIDADE_ALTERADA`, `ATENDIMENTO_CRIADO`…, cada um com o modo |

### Testes pelo Postman

Pasta **1. Roteiro do Postman**, de C1 a C13 (ou **Run folder**); os resultados aparecem em **Test Results**.

| # | O que mostra |
|---|---|
| C1 | `GET /api/medicamento` sem token → `401` |
| C2 | Login da Dra. Ana → o token fica guardado sozinho |
| C4, C5 | O mesmo `POST /api/pessoa` duas vezes → `CRIADO`, depois `JA_EXISTIA` (idempotência) |
| C6 | Outro ID, mesmo CPF → `UNIFICADO` |
| C7, C8 | Log de acesso com token operacional → `403`; com o admin → `200`, e o `401` do C1 está lá |
| C10 a C12 | PDF; e-mail; o mesmo pedido de e-mail de novo → `200`, sem e-mail novo |

### Auditoria imutável

No portal, **Logs de acesso** → serviço `ms-clinico`, rota `/api/atendimento`: os envios do passo 14 (IP, profissional, `POST`, `201`, tempo em ms). No psql:

```sql
SELECT data_hora, servico, metodo, rota, status_code, tempo_ms FROM auditoria.log_acesso ORDER BY data_hora DESC LIMIT 10;
```

```sql
UPDATE auditoria.log_acesso SET status_code = 200;
```

```sql
DELETE FROM auditoria.log_acesso;
```

Resultado esperado nos dois últimos: erro "Registros de auditoria não podem ser alterados nem apagados", até para o `postgres` (gatilho, D-04).

### Indisponibilidade de um serviço

```bash
cd ~/offline-first-medical-record/infra && sudo docker compose stop ms-docs
```

- Portal: **Baixar PDF** responde "O serviço responsável por esta rota está fora do ar" (`503`, pelo Nginx). Atendimentos, prontuários e logs continuam abrindo.
- App (Online): um atendimento sincroniza normalmente; o pedido de e-mail fica na fila com nova tentativa agendada.

```bash
sudo docker compose start ms-docs
```

Na próxima tentativa (ou em **Sincronizar**), o e-mail sai.

---

## 14. Banco de dados e Docker pelo terminal

### psql

| Comando | Função |
|---|---|
| `\dn` | Lista os schemas |
| `\dt clinico.*` | Tabelas de um schema (ou `auth.*`, `documentos.*`, `auditoria.*`) |
| `\d clinico.atendimento` | Estrutura de uma tabela |
| `\x` | Exibição de uma linha por bloco (liga e desliga) |
| `SET TIME ZONE 'America/Sao_Paulo';` | Horários de Brasília |
| `\q` | Encerra o psql |

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
-- O que os aparelhos fizeram (inclusive offline)
SELECT data_hora, dispositivo_nome, acao, modo FROM auditoria.log_cliente ORDER BY data_hora DESC LIMIT 10;
```

```sql
-- Conflitos e e-mails
SELECT detectado_em, entidade, motivo, estrategia, dispositivo_nome FROM clinico.conflito ORDER BY detectado_em DESC;
SELECT solicitado_em, destinatario_email, status, erro FROM documentos.envio_email ORDER BY solicitado_em DESC;
```

```sql
-- Um profissional novo, direto no banco (a senha vai em bcrypt)
INSERT INTO auth.profissional (nome, tipo_registro, registro, perfil, senha_hash)
VALUES ('Dr. Novo', 'CRM', '99999-RS', 'OPERACIONAL', crypt('a-senha-dele', gen_salt('bf', 10)));
```

As colunas de cada tabela: [docs/05](../docs/05-modelo-de-dados.md).

### Docker (na pasta `infra/`, com `sudo`)

| Para | Comando |
|---|---|
| Ver o que está no ar | `sudo docker compose ps` |
| Logs de um serviço (`Ctrl+C` sai) | `sudo docker compose logs -f --tail 50 ms-clinico` |
| Parar / religar / reiniciar | `sudo docker compose stop ms-docs` · `start ms-docs` · `restart ms-auth` |
| Memória de cada container | `sudo docker stats --no-stream` |
| Testar uma rota | `curl -i http://localhost/api/pessoa` (responde `401`: existe e pede token) |

Mais comandos à mão: [docs/12, seção 12.15](../docs/12-implantacao.md#1215-fazendo-à-mão-sem-os-scripts).

---

## 15. Solução de problemas

| Situação | Ação |
|---|---|
| Diagnóstico geral do ambiente | `./infra/scripts/verificar.sh` (diz o que está fora e como resolver) |
| Um serviço não responde | Na pasta `infra/`: `sudo docker compose logs --tail 50 <serviço>`, depois `sudo docker compose restart <serviço>` |
| Login das contas de demonstração recusado | `./infra/scripts/instalar.sh` (regrava as senhas, desbloqueia e reativa; os dados são mantidos) |
| Registros de execuções anteriores | `./infra/scripts/zerar.sh` (e `apagar-dados-locais.cmd` no notebook) |
| Aplicativo: "Faça login online para sincronizar" | Botão **Entrar online** na barra superior e a senha. Nada se perde |
| E-mail não chega | Conferir o spam; a página **E-mails enviados** mostra a mensagem de erro do Gmail |
| `psql: command not found` ou não conecta | Usar o do container: `cd infra && sudo docker compose exec db psql -U postgres -d medicalfield` |
| `\dt` não mostra tabelas | Conferir o prompt `medicalfield=#` (senão, `\c medicalfield`); depois `\dt *.*` |
| `docker compose`: `no configuration file provided` | Executar a partir de `~/offline-first-medical-record/infra` |
| `permission denied ... docker.sock` | Executar o comando com `sudo` |
| Aplicativo no Linux encerra ao abrir | Incluir a opção `--no-sandbox` |

CPFs válidos de reserva, fora dos dados de demonstração: `390.533.447-05`, `718.263.954-82`, `604.872.139-04`.

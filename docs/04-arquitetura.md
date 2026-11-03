# 4. Arquitetura

Visão geral dos componentes, onde cada um roda, como eles conversam, as tecnologias e os padrões de projeto usados. É o entregável "Modelo de arquitetura: desenho + tecnologias utilizadas".

---

## 4.1 Desenho geral

```mermaid
flowchart LR
    subgraph DISP["Dispositivo do profissional (Windows)"]
        UI["Telas (React)"] --> NUC["Núcleo local<br/>(processo principal do Electron)"]
        NUC --> SQL[("SQLite local")]
    end

    subgraph VM["VM da Univates (Ubuntu + Docker Compose)"]
        NGX["Nginx :80<br/>gateway da API + arquivos do Portal"]
        AUTH["ms-auth<br/>TypeScript / Node.js"]
        CLIN["ms-clinico<br/>Java / Spring Boot"]
        DOCS["ms-docs<br/>Python / FastAPI"]
        PG[("PostgreSQL<br/>schemas auth, clinico,<br/>documentos e auditoria")]
        NGX --> AUTH
        NGX --> CLIN
        NGX --> DOCS
        AUTH --> PG
        CLIN --> PG
        DOCS --> PG
        DOCS -- "busca o atendimento" --> CLIN
    end

    NAV["Navegador<br/>(Portal Admin)"] --> NGX
    PM["Postman / Insomnia"] --> NGX
    NUC -- "HTTP + JWT<br/>só com a chave em Online" --> NGX
    DOCS -- "SMTP" --> GM["Gmail"]
    GM --> CX["Caixa de e-mail do<br/>paciente ou familiar"]
```

**Em uma frase:** o profissional usa um app desktop que grava tudo num banco local e sincroniza, quando há conexão, com três microsserviços na VM. Eles ficam atrás de um único Nginx, que também entrega o portal administrativo.

---

## 4.2 Componentes

| Componente | Responsabilidade | Tecnologia | Onde roda | Porta |
|---|---|---|---|---|
| **App cliente** | Interface do profissional: login (online e offline), ficha de atendimento, chave Online/Offline, fila de pendentes, sincronização | Electron + React + TypeScript + SQLite | PC do profissional (Windows) | — |
| **Portal Admin** | Interface administrativa: login, listagens, detalhes, PDF, e-mail, logs, conflitos, documentação da API | React + TypeScript (arquivos estáticos) | Navegador, servido pelo Nginx | 80 (via Nginx) |
| **Nginx** | Porta única do sistema (API Gateway): encaminha `/api/...` ao serviço certo, repassa o IP real e entrega o portal | Nginx | VM (Docker) | **80 (pública)** |
| **ms-auth** | Login, sessão e tokens, profissionais, auditoria (recebe os logs dos clientes e lista os logs) | TypeScript (Node.js, Fastify) | VM (Docker) | 3000 (interna) |
| **ms-clinico** | Pessoas, prontuários, atendimentos, medicamentos, idempotência, unificação de duplicados e "receber dados" | Java 21 (Spring Boot) | VM (Docker) | 8080 (interna) |
| **ms-docs** | PDF da Ficha de Atendimento, envio por e-mail e histórico de envios | Python 3.13 (FastAPI) | VM (Docker) | 8000 (interna) |
| **PostgreSQL** | Banco central, com um schema por serviço + auditoria | PostgreSQL 18 | VM (Docker) | 5433 (só `127.0.0.1`) |

### Dentro do app cliente

O Electron tem duas partes, e a divisão entre elas é parte da arquitetura:

| Parte | O que faz | O que **não** faz |
|---|---|---|
| **Telas** (processo de renderização, React) | Mostra e coleta dados | Nunca acessa o SQLite nem a rede diretamente |
| **Núcleo local** (processo principal, Node.js/TypeScript) | Repositórios (local e remoto), fila (outbox), motor de sincronização, estado da conectividade, sessão e login offline, logs locais | — |

As telas chamam o núcleo por uma API pequena e tipada (IPC do Electron, exposta pelo *preload*). Isso isola a interface das regras de dados, que é exatamente a sugestão do **Repository Pattern** no enunciado.

---

## 4.3 Comunicação

| De → Para | Como | Observação |
|---|---|---|
| App cliente → Nginx | HTTP/JSON + `Authorization: Bearer` | Só com a chave em Online. Envia `X-Dispositivo-Id` e `X-Dispositivo-Nome` |
| Portal → Nginx | HTTP/JSON + Bearer | Mesmo endereço do portal (sem CORS) |
| Postman → Nginx | HTTP/JSON + Bearer | Coleção em `postman/` (etapa 7) |
| Nginx → serviços | HTTP na rede interna do Docker | Caminho repassado sem mudança; IP real em `X-Real-IP` |
| ms-docs → ms-clinico | HTTP interno, repassando o token de quem pediu | O ms-clinico registra esse acesso no log também |
| Serviços → PostgreSQL | Conexão com o usuário do próprio serviço | Cada um só enxerga o seu schema; log de acesso só com `INSERT` |
| ms-docs → Gmail | SMTP com TLS (porta 587) | Atrás de um Adapter, para trocar de provedor por configuração |

Os serviços **não** dependem uns dos outros para validar token: cada um confere o JWT com a chave pública. A única chamada entre serviços é a do ms-docs ao ms-clinico.

---

## 4.4 Rede e portas na VM

```
Internet ──► :80  Nginx ──► rede interna do Docker ──► ms-auth:3000
                                                   ├─► ms-clinico:8080
                                                   └─► ms-docs:8000
         ──► :22  SSH (administração)

127.0.0.1:5433 ──► PostgreSQL (só a própria VM; de fora, via túnel SSH)
```

- O Postgres do projeto roda num container próprio, **separado** de qualquer Postgres que já exista na VM (que costuma usar a porta 5432).
- O Nginx descobre os serviços pelo DNS interno do Docker **na hora da requisição**. Assim ele sobe mesmo se um serviço estiver parado, e responde `503 SERVICO_INDISPONIVEL` para as rotas dele.
- Mapa de rotas → serviço: [06-api.md](06-api.md#61-visão-geral). A configuração está em [`infra/nginx/conf.d/medicalfield.conf`](../infra/nginx/conf.d/medicalfield.conf).

---

## 4.5 Padrões de projeto

O enunciado sugere três padrões e pede mais três de livre escolha.

| Padrão | Onde | Para quê |
|---|---|---|
| **Repository** (sugerido) | App cliente: `RepositorioLocal` (SQLite) e `RepositorioRemoto` (API), atrás das mesmas interfaces; no servidor, os repositórios do Spring Data | As telas não sabem de onde vêm os dados; trocar o armazenamento não mexe na interface |
| **Strategy** (sugerido) | ms-clinico: `EstrategiaDeMesclagem` com `MaisRecenteVence` e `ServidorVence` | Regra de resolução de conflitos trocável por configuração |
| **Observer** (sugerido) | App cliente: `EstadoConectividade` avisa o motor de sincronização, a sessão e a tela quando a chave muda | Disparar o envio da fila sozinho quando a conexão volta |
| **Command** (escolhido) | App cliente: cada item da outbox (`CriarPessoa`, `CriarProntuario`, `CriarAtendimento`, `EnviarEmail`) é um comando com `executar()` | A fila guarda e executa operações de tipos diferentes do mesmo jeito, na ordem certa |
| **Adapter** (escolhido) | ms-docs: interface `EnvioDeEmail` com `SmtpAdapter` (Gmail) e um adaptador de console para desenvolvimento | Trocar o provedor de e-mail sem mexer no resto |
| **Builder** (escolhido) | ms-docs: `FichaPdfBuilder` monta o PDF por partes (cabeçalho, paciente, triagem, sinais vitais, medicamentos, desfecho) | Montar um documento complexo passo a passo e de forma legível |

Padrões de **arquitetura** que também aparecem: **API Gateway** (Nginx), **Outbox** (fila de pendentes), **Database per Service** (um schema e um usuário por serviço) e **Offline-First**.

---

## 4.6 Tecnologias

| Parte | Tecnologias principais |
|---|---|
| ms-auth | Node.js (LTS), TypeScript, Fastify, node-postgres, bcrypt, `jose` (JWT RS256), migrations SQL |
| ms-clinico | Java 21, Spring Boot (Web, Validation, Security como *resource server* JWT, Data JPA/JDBC), Flyway, springdoc-openapi |
| ms-docs | Python 3.13, FastAPI, Uvicorn, SQLAlchemy + Alembic, PyJWT, httpx, WeasyPrint (PDF), smtplib |
| Portal | React, TypeScript, Vite, Mantine, Swagger UI |
| App cliente | Electron, React, TypeScript, Vite, Mantine, better-sqlite3, `safeStorage` (cofre do Windows) |
| Infraestrutura | Docker Compose, Nginx, PostgreSQL 18 |
| Qualidade e entrega | Testes automatizados por serviço, coleção do Postman, GitHub Actions (gera o `.exe` do cliente) |

As versões exatas ficam nos arquivos de build de cada parte (`package.json`, `pom.xml`, `pyproject.toml`).

---

## 4.7 Estrutura do repositório

```
offline-first-medical-record/
├── docs/                  documentação (este conjunto de arquivos)
├── infra/                 Docker Compose, Nginx, inicialização do Postgres, scripts
│   ├── docker-compose.yml
│   ├── .env.example
│   ├── nginx/
│   ├── postgres/init/
│   ├── scripts/
│   └── secrets/           chaves JWT (fora do Git)
├── servicos/
│   ├── ms-auth/           TypeScript
│   ├── ms-clinico/        Java
│   └── ms-docs/           Python
├── apps/
│   ├── portal/            Portal Admin (React)
│   └── cliente/           App cliente (Electron)
└── postman/               coleção e ambiente (etapa 7)
```

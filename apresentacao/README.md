# Apresentação

Material para apresentar o MedicalField: o passo a passo do dia e os diagramas.

| Arquivo | O que é |
|---|---|
| [`ROTEIRO-DA-APRESENTACAO.md`](ROTEIRO-DA-APRESENTACAO.md) | O passo a passo: preparação, os 17 passos do roteiro com os comandos e o que falar, os extras (conflito, login offline, Postman, auditoria, serviço fora do ar), a cola do banco pelo terminal, perguntas prováveis e o que fazer se algo der errado |
| [`diagramas/`](diagramas) | As imagens (`.png` para slides, `.svg` para ampliar sem perder qualidade) e as fontes de cada uma (`diagramas/fontes/*.mmd`) |

## Diagramas

| Imagem | Mostra | Bom para explicar |
|---|---|---|
| [`01-arquitetura`](diagramas/01-arquitetura.png) | Todas as partes, com linguagem, frameworks e portas; as rotas que o Nginx distribui; quem chama quem | A visão geral (comece por ela). Cores: azul = TypeScript, laranja = Java, verde = Python, roxo = bancos |
| [`02-banco-servidor`](diagramas/02-banco-servidor.png) | O PostgreSQL: as tabelas de cada schema (`auth`, `clinico`, `documentos`, `auditoria`), colunas, chaves e relações | Database per Service; ligações cheias = chave estrangeira, pontilhadas = só o ID (entre schemas) |
| [`03-banco-local-sqlite`](diagramas/03-banco-local-sqlite.png) | O SQLite do app: a cópia dos dados e as tabelas só do aparelho (fila, logs, credenciais, sessão) | Como o app trabalha sem rede |
| [`04-app-cliente-por-dentro`](diagramas/04-app-cliente-por-dentro.png) | Os dois processos do Electron, o IPC e as peças do núcleo local (Observer, Command, repositórios) | "O que é o núcleo local e o IPC?" |
| [`05-gravacao-e-envio`](diagramas/05-gravacao-e-envio.png) | Salvar → SQLite + fila numa transação → `POST` → `201 CRIADO` ou `200 JA_EXISTIA` | Offline-first, outbox e idempotência (passos 7, 12 e 14) |
| [`06-recebimento`](diagramas/06-recebimento.png) | O "receber dados": cursor, margem de 30 s, credenciais e logs | Passos 6 e 11 |
| [`07-unificacao`](diagramas/07-unificacao.png) | O mesmo paciente em duas ambulâncias: unificação, apelidos e "o mais recente vence" | O extra do conflito (11.4) |
| [`08-login-e-tokens`](diagramas/08-login-e-tokens.png) | Login, JWT de 15 min, uso nas requisições e renovação pelo refresh token | Autenticação (passos 1 e 5) |
| [`09-chaves-jwt`](diagramas/09-chaves-jwt.png) | A chave privada assina (só o ms-auth), a pública confere (os três serviços) | "Para que servem as chaves?" |
| [`10-login-offline`](diagramas/10-login-offline.png) | Como o app decide entre login online, offline pela credencial do aparelho ou pela réplica de credenciais | O extra do login offline (11.5) |
| [`11-rede-e-portas`](diagramas/11-rede-e-portas.png) | O que fica aberto na VM (80 e 22) e o que não fica (serviços e banco) | Segurança e Nginx |
| [`12-padroes-de-projeto`](diagramas/12-padroes-de-projeto.png) | Os seis padrões de projeto e os de arquitetura, com onde estão e para quê | A pergunta dos padrões |

## Mudar um diagrama

As fontes são texto ([Mermaid](https://mermaid.js.org)): dá para editar e ver na hora em <https://mermaid.live>, e o GitHub desenha os `.mmd` direto. Para gerar as imagens de novo (Node.js 22 ou mais novo):

```bash
cd apresentacao/diagramas
npm ci
npx playwright-core install chromium
npm run gerar
```

`npm run gerar -- 07` gera só os que têm `07` no nome.

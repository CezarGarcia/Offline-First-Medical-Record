# ms-auth — Identidade e auditoria

**Linguagem:** TypeScript (Node.js) · **Situação:** a implementar (etapa 2)

## Responsabilidades

- Login dos profissionais (CRM, COREN ou ID de Socorrista + senha) e emissão do token de acesso (JWT RS256, 15 min) e do refresh token (7 dias).
- Renovação e encerramento de sessão.
- Listagem de profissionais (cadastro de apoio).
- Auditoria: dono do schema `auditoria`, recebe os logs do cliente (`POST /api/log`) e lista os logs de acesso e dos clientes para o portal.
- Middleware de log de acesso (como os outros dois serviços).

## Referências

- Rotas: [docs/06-api.md, seção 6.8](../../docs/06-api.md#68-ms-auth)
- Tabelas: schemas `auth` e `auditoria` em [docs/05-modelo-de-dados.md](../../docs/05-modelo-de-dados.md)
- Tokens, login, bloqueio e logs: [docs/08-seguranca-e-auditoria.md](../../docs/08-seguranca-e-auditoria.md)

## Tecnologias previstas

Node.js LTS, TypeScript, Fastify, node-postgres, bcrypt, `jose` (JWT), migrations em SQL. Porta interna 3000. Usuário do banco `ms_auth`.

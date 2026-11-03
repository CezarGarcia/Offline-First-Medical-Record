# ms-auth — Identidade e auditoria

**Linguagem:** TypeScript (Node.js 24, Fastify 5) · **Situação:** implementado (etapa 2)

## Responsabilidades

- Login dos profissionais (CRM, COREN ou ID de Socorrista + senha) e emissão do token de acesso (JWT RS256, 15 min) e do refresh token (7 dias, sem rotação).
- Renovação e encerramento de sessão; bloqueio de 5 minutos na 5ª senha errada seguida.
- Listagem de profissionais (cadastro de apoio, só admin).
- Auditoria: dono do schema `auditoria`. Recebe os logs do cliente (`POST /api/log`) e lista os logs de acesso e dos clientes para o portal.
- Middleware de log de acesso (o mesmo que os outros dois serviços terão).

Rotas: [docs/06-api.md, seção 6.8](../../docs/06-api.md#68-ms-auth). Tokens, login e logs: [docs/08-seguranca-e-auditoria.md](../../docs/08-seguranca-e-auditoria.md).

## Estrutura

```
migrations/              SQL aplicado na subida, em ordem (auth.migracao guarda o que já rodou)
src/
  index.ts               inicialização: configuração, banco, migrations, servidor
  app.ts                 monta o Fastify (usado também pelos testes)
  config.ts              variáveis de ambiente e constantes (validades, limites)
  banco.ts               pool do Postgres e executor de migrations
  erros.ts               formato padrão de erro (docs/06-api.md, seção 6.5)
  esquemas.ts            esquemas TypeBox compartilhados (geram a validação e o OpenAPI)
  plugins/
    logAcesso.ts         middleware de log de acesso (grava em auditoria.log_acesso)
    autenticacao.ts      exige o token em toda rota que não é marcada como pública
  seguranca/
    tokens.ts            emissão e conferência do JWT; geração e hash do refresh token
    senha.ts             conferência bcrypt (com tempo constante para registro inexistente)
  repositorios/          SQL de profissionais, sessões e logs
  rotas/                 auth, profissionais, logs e a especificação OpenAPI
test/                    testes de integração contra um Postgres de verdade
```

## Variáveis de ambiente

| Variável | Padrão | Para quê |
|---|---|---|
| `PORTA` | `3000` | Porta HTTP |
| `DB_HOST`, `DB_PORTA`, `DB_NOME`, `DB_USUARIO` | `localhost`, `5432`, `medicalfield`, `ms_auth` | Banco |
| `DB_SENHA` | — (obrigatória) | Senha do usuário `ms_auth` |
| `JWT_CHAVE_PRIVADA_ARQUIVO` | `/run/secrets/jwt-privada.pem` | Chave que assina os tokens |
| `JWT_CHAVE_PUBLICA_ARQUIVO` | `/run/secrets/jwt-publica.pem` | Chave que confere os tokens |

No Docker Compose tudo isso já vem preenchido a partir do `infra/.env` e de `infra/secrets/`.

## Rodando e testando no desenvolvimento

Com o banco do `infra/` no ar (`docker compose up -d db`, porta 5433):

```bash
npm install
npm run typecheck
DB_HOST=127.0.0.1 DB_PORTA=5433 DB_SENHA=ms_auth npm test
```

- Os testes sobem o app com chaves JWT geradas na hora, criam os próprios profissionais (com senha feita pelo `crypt()` do Postgres, como num cadastro manual) e os apagam no fim. Os logs gerados ficam, porque a auditoria não aceita exclusão.
- Para testar também a permissão do ms-clinico na auditoria (só INSERT), passe `MS_CLINICO_DB_SENHA`.
- Para rodar o serviço direto do código: `npm run dev`, com as mesmas variáveis e os caminhos das chaves.

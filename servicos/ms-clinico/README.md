# ms-clinico — Dados clínicos e sincronização

**Linguagem:** Java 21 (Spring Boot 4) · **Situação:** implementado (etapa 3)

## Responsabilidades

- Pessoas, prontuários (um por pessoa), atendimentos com os medicamentos administrados, e o catálogo de medicamentos.
- Idempotência dos cadastros: o ID gerado pelo cliente vale como chave; reenvio responde `JA_EXISTIA`.
- Unificação de duplicados (CPF repetido, segundo prontuário da mesma pessoa) com o padrão Strategy (`MAIS_RECENTE_VENCE` ou `SERVIDOR_VENCE`), carimbos por campo, apelidos de ID e registro de cada conflito.
- "Receber dados" incremental (`GET /api/sync/pull`).
- Middleware de log de acesso (grava em `auditoria.log_acesso`, só com INSERT).

Rotas: [docs/06-api.md, seção 6.9](../../docs/06-api.md#69-ms-clinico). Regras de sincronização e conflito: [docs/07-sincronizacao.md](../../docs/07-sincronizacao.md). Decisões deste serviço: D-32, D-33 e D-34 em [docs/03-decisoes.md](../../docs/03-decisoes.md).

## Estrutura

```
src/main/java/br/univates/medicalfield/clinico/
  auditoria/      FiltroLogAcesso (middleware) e RegistradorDeAcessos (grava em outra thread)
  seguranca/      FiltroAutenticacao, LeitorDeToken (JWT RS256 com a chave pública), @SomenteAdmin
  erros/          formato padrão de erro e o tratador global
  comum/          origem/sincronização, validação de CPF, IDs v7, regras entre campos
  unificacao/     EstrategiaDeMesclagem (Strategy) + MaisRecenteVence e ServidorVence, Mesclador,
                  apelidos e conflitos
  medicamento/  pessoa/  prontuario/  atendimento/   controller, serviço e repositório de cada um
  sincronizacao/  "receber dados" (pull)
src/main/resources/
  application.yml
  db/migration/   V1__clinico.sql e V2__unificacao.sql (Flyway)
src/test/java/    testes unitários (Mesclador, CPF) e de integração (rotas, contra um Postgres de verdade)
```

## Variáveis de ambiente

| Variável | Padrão | Para quê |
|---|---|---|
| `PORTA` | `8080` | Porta HTTP |
| `DB_HOST`, `DB_PORTA`, `DB_NOME`, `DB_USUARIO` | `localhost`, `5432`, `medicalfield`, `ms_clinico` | Banco |
| `DB_SENHA` | — (obrigatória) | Senha do usuário `ms_clinico` |
| `JWT_CHAVE_PUBLICA_ARQUIVO` | `/run/secrets/jwt-publica.pem` | Chave que confere os tokens do ms-auth |
| `ESTRATEGIA_CONFLITO` | `MAIS_RECENTE_VENCE` | Regra de unificação (`MAIS_RECENTE_VENCE` ou `SERVIDOR_VENCE`) |

No Docker Compose tudo isso vem do `infra/.env` e de `infra/secrets/`. O ms-clinico só sobe depois do ms-auth, que cria as tabelas de auditoria.

## Rodando e testando no desenvolvimento

Com o banco do `infra/` no ar e as migrations do ms-auth já aplicadas (`docker compose up -d db ms-auth`):

```bash
DB_HOST=127.0.0.1 DB_PORTA=5433 DB_SENHA=<MS_CLINICO_DB_PASSWORD> MS_AUTH_DB_SENHA=<MS_AUTH_DB_PASSWORD> mvn test
```

- Os testes sobem o serviço numa porta aleatória, com um par de chaves JWT gerado na hora, e apagam no fim tudo o que criaram (os logs ficam, porque a auditoria não aceita exclusão).
- `MS_AUTH_DB_SENHA` é usada só para ler a auditoria e conferir o log de acesso (o usuário do ms-clinico só pode inserir).
- Para rodar o serviço direto do código: `mvn spring-boot:run` com as mesmas variáveis e `JWT_CHAVE_PUBLICA_ARQUIVO=../../infra/secrets/jwt-publica.pem`.

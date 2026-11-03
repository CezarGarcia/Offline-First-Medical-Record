# ms-clinico — Dados clínicos e sincronização

**Linguagem:** Java 21 (Spring Boot) · **Situação:** a implementar (etapa 3)

## Responsabilidades

- Pessoas, prontuários (um por pessoa), atendimentos com os medicamentos administrados, e o catálogo de medicamentos.
- Idempotência dos cadastros (o ID gerado pelo cliente vale como chave).
- Unificação de duplicados (CPF repetido, prontuário repetido) com o padrão Strategy (`MAIS_RECENTE_VENCE` ou `SERVIDOR_VENCE`), apelidos de ID e registro de conflitos.
- "Receber dados" incremental (`GET /api/sync/pull`).
- Middleware de log de acesso.

## Referências

- Rotas: [docs/06-api.md, seção 6.9](../../docs/06-api.md#69-ms-clinico)
- Tabelas: schema `clinico` em [docs/05-modelo-de-dados.md](../../docs/05-modelo-de-dados.md)
- Regras de sincronização e conflito: [docs/07-sincronizacao.md](../../docs/07-sincronizacao.md)

## Tecnologias previstas

Java 21, Spring Boot (Web, Validation, Security como *resource server* JWT, acesso a dados), Flyway, springdoc-openapi. Porta interna 8080. Usuário do banco `ms_clinico`.

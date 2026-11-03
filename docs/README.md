# Documentação do MedicalField

Tudo que foi pedido, tudo que foi decidido e como o sistema funciona. Para quem chega agora, a ordem de leitura sugerida é a da tabela.

| # | Documento | O que tem |
|---|---|---|
| 1 | [Enunciado](01-enunciado.md) | O que o professor pediu, organizado, e como interpretamos cada ambiguidade |
| 2 | [Escopo e requisitos](02-requisitos.md) | Requisitos funcionais e não funcionais numerados, o que fica de fora e o cruzamento com o roteiro de testes |
| 3 | [Registro de decisões](03-decisoes.md) | Cada decisão (D-01 em diante), com o motivo e as alternativas descartadas |
| 4 | [Arquitetura](04-arquitetura.md) | Desenho, componentes, comunicação, portas, padrões de projeto e tecnologias |
| 5 | [Modelo de dados](05-modelo-de-dados.md) | Banco central (PostgreSQL) e banco local (SQLite), tabela por tabela |
| 6 | [API](06-api.md) | Todas as rotas, formatos, erros e idempotência |
| 7 | [Sincronização](07-sincronizacao.md) | Offline-first: fila, envio, recebimento, idempotência, conflitos e casos de borda |
| 8 | [Segurança e auditoria](08-seguranca-e-auditoria.md) | Tokens, login offline, sessão, autorização, logs e LGPD |
| 9 | [Ficha e domínio](09-ficha-e-dominio.md) | Campos dos formulários, regras, Glasgow, Manchester, START, PDF, e-mail e glossário |
| 10 | [Telas](10-telas.md) | App cliente e Portal Admin, tela por tela |
| 11 | [Roteiro de testes](11-roteiro-de-testes.md) | Os 17 passos do enunciado com o resultado esperado, mais roteiros extras |
| 12 | [Implantação e operação](12-implantacao.md) | VM, Docker, banco, e-mail, HTTPS, instalação do cliente e problemas comuns |
| 13 | [Testes automatizados](13-testes-automatizados.md) | O que cada serviço testa sozinho, como rodar e o que fica para o roteiro manual |

## Entregáveis exigidos pelo enunciado

| Entregável | Onde está |
|---|---|
| Modelo de arquitetura: desenho + tecnologias | [04-arquitetura.md](04-arquitetura.md) |
| Documentação das APIs e endpoints | [06-api.md](06-api.md) + Swagger UI no Portal Admin (página **API (Swagger)**) + [coleção do Postman](../postman) |
| Modelagem dos bancos de dados | [05-modelo-de-dados.md](05-modelo-de-dados.md) |
| Roteiro de testes | [11-roteiro-de-testes.md](11-roteiro-de-testes.md) (+ testes automatizados em [13-testes-automatizados.md](13-testes-automatizados.md)) |

## Como manter esta documentação

- Mudou uma decisão? Atualize o [registro de decisões](03-decisoes.md) (não apague a antiga: registre a nova e diga o que ela substitui) e os documentos afetados.
- Mudou uma rota ou uma tabela? Atualize [06-api.md](06-api.md) ou [05-modelo-de-dados.md](05-modelo-de-dados.md) **no mesmo commit** da mudança no código.
- Mudou ou criou um teste automatizado que muda o que é coberto? Atualize a tabela do serviço em [13-testes-automatizados.md](13-testes-automatizados.md).
- Os diagramas são Mermaid, desenhados pelo próprio GitHub a partir do texto.

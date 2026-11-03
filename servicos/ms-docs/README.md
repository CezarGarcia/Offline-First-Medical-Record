# ms-docs — Documentos e e-mail

**Linguagem:** Python 3.13 (FastAPI) · **Situação:** a implementar (etapa 4)

## Responsabilidades

- Gerar o PDF da Ficha de Atendimento (padrão Builder), buscando os dados no ms-clinico com o token de quem pediu.
- Enviar a ficha por e-mail ao paciente, a um familiar ou a outro endereço (padrão Adapter: SMTP do Gmail), com idempotência pelo ID do pedido.
- Histórico de envios.
- Middleware de log de acesso.

## Referências

- Rotas: [docs/06-api.md, seção 6.10](../../docs/06-api.md#610-ms-docs)
- Tabela: schema `documentos` em [docs/05-modelo-de-dados.md](../../docs/05-modelo-de-dados.md)
- Conteúdo do PDF e do e-mail: [docs/09-ficha-e-dominio.md](../../docs/09-ficha-e-dominio.md#95-o-pdf-da-ficha)
- Configuração do Gmail: [docs/12-implantacao.md](../../docs/12-implantacao.md#128-e-mail-gmail)

## Tecnologias previstas

Python 3.13, FastAPI, Uvicorn, SQLAlchemy + Alembic, PyJWT, httpx, WeasyPrint, smtplib. Porta interna 8000. Usuário do banco `ms_docs`.

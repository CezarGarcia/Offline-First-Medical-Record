# 13. Testes automatizados

O que cada serviço testa sozinho, como rodar e o que fica para o roteiro manual. Os testes automatizados conferem as regras por dentro: rotas, banco, erros e casos de borda. O [roteiro de testes](11-roteiro-de-testes.md) confere o sistema inteiro funcionando junto, como na apresentação.

---

## 13.1 Visão geral

| Serviço | Ferramenta | Testes | Onde ficam | Contra o quê |
|---|---|---|---|---|
| ms-auth | Vitest | 26 | [`servicos/ms-auth/test/`](../servicos/ms-auth/test) | O app Fastify de verdade (em memória) e o PostgreSQL do `infra/` |
| ms-clinico | JUnit 6 + Spring Boot Test | 34 | [`servicos/ms-clinico/src/test/java/`](../servicos/ms-clinico/src/test/java) | O serviço numa porta aleatória e o PostgreSQL do `infra/`. O `Mesclador` e o CPF também têm testes unitários |
| ms-docs | pytest | 46 | [`servicos/ms-docs/testes/`](../servicos/ms-docs/testes) | O app FastAPI (`TestClient`), o PostgreSQL do `infra/`, um servidor SMTP de teste local e um ms-clinico falso |
| Portal Admin | Vitest + Testing Library | 27 | [`apps/portal/testes/`](../apps/portal/testes) | As telas de verdade, num navegador simulado (jsdom), com uma API falsa no lugar do `fetch`. Não precisa de banco nem de serviço no ar |

**Regras comuns às suítes dos três serviços** (o portal não usa banco: a API é falsa):

- **Banco de verdade**, não um banco falso: idempotência, travas e auditoria dependem do Postgres (`ON CONFLICT`, `FOR UPDATE`, travas de transação, gatilhos).
- **Chaves JWT geradas na hora:** cada suíte cria um par de chaves e assina os tokens como o ms-auth faria. Por isso ms-clinico e ms-docs não precisam do ms-auth no ar.
- **Dados próprios:** cada teste cria os dados de que precisa, com IDs novos, e a suíte apaga no fim o que criou. **Os logs de acesso ficam**, porque a auditoria não aceita exclusão (D-04), e um teste confere justamente isso.
- **Permissões reais:** cada serviço conecta com o próprio usuário de banco, com as mesmas permissões da produção. Para conferir a auditoria (onde ms-clinico e ms-docs só podem inserir), os testes leem com o usuário do ms-auth.

---

## 13.2 Como rodar

Primeiro, o banco do `infra/` no ar, com as migrations do ms-auth aplicadas (as tabelas de auditoria são dele):

```bash
cd infra
docker compose up -d db ms-auth
```

Depois, dentro da pasta de cada serviço. Os valores entre `< >` são as senhas do `infra/.env`.

**ms-auth** (Node.js 24; antes, `npm ci`):

```bash
DB_HOST=127.0.0.1 DB_PORTA=5433 DB_SENHA=<MS_AUTH_DB_PASSWORD> MS_CLINICO_DB_SENHA=<MS_CLINICO_DB_PASSWORD> npx vitest run
```

**ms-clinico** (Java 21 e Maven):

```bash
DB_HOST=127.0.0.1 DB_PORTA=5433 DB_SENHA=<MS_CLINICO_DB_PASSWORD> MS_AUTH_DB_SENHA=<MS_AUTH_DB_PASSWORD> mvn test
```

**ms-docs** (Python 3.13 e as bibliotecas de sistema do WeasyPrint; ver o [README do serviço](../servicos/ms-docs/README.md)):

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
DB_HOST=127.0.0.1 DB_PORTA=5433 DB_SENHA=<MS_DOCS_DB_PASSWORD> MS_AUTH_DB_SENHA=<MS_AUTH_DB_PASSWORD> .venv/bin/pytest
```

O ms-docs também roda os testes **dentro da mesma imagem da produção** (mesmas fontes e bibliotecas do PDF), sem instalar Python na máquina. O comando sai da pasta do repositório e usa a rede do Docker Compose:

```bash
docker build --target testes -t ms-docs-testes servicos/ms-docs
docker run --rm --network medicalfield_interna -e DB_HOST=db -e DB_PORTA=5432 -e DB_SENHA=<MS_DOCS_DB_PASSWORD> -e MS_AUTH_DB_SENHA=<MS_AUTH_DB_PASSWORD> ms-docs-testes
```

**Portal Admin** (Node.js 22.22 ou mais novo; não precisa de banco nem de serviço no ar):

```bash
npm ci
npm test
```

Resultado da última rodada (etapa 5): **133 testes, todos passando** (26 + 34 + 46 + 27).

---

## 13.3 O que cada suíte cobre

### ms-auth (26 testes)

| Área | O que é conferido |
|---|---|
| Login | Entra com tipo + registro + senha criada no SQL com `crypt` (D-30). Não diferencia maiúsculas, minúsculas nem espaços no registro. Responde igual para senha errada e para registro inexistente. Bloqueia na 5ª senha errada seguida (`423`), mesmo com a senha certa depois. Um login certo zera a contagem. "Inativo" só aparece depois de a senha conferir. O corpo inválido explica o campo com problema |
| Token | Sem token, com outro esquema, adulterado, de outra chave ou vencido: `401`. `GET /api/auth/me` devolve quem está logado |
| Sessão | O refresh renova o token sem trocar o refresh token nem o fim da sessão. Depois do logout, o refresh token não vale. Sessão vencida não renova. O token renovado nunca passa do fim da sessão. Profissional desativado não renova e perde a sessão. Refresh token desconhecido é recusado |
| Auditoria | O middleware grava todos os campos do enunciado. Um `X-Dispositivo-Id` que não é UUID é ignorado. Os logs não podem ser alterados nem apagados, nem pelo dono das tabelas. `POST /api/log` ignora IDs repetidos, grava quem enviou e recusa lote grande demais ou ação fora do padrão. Consultas com filtros e paginação |
| Admin e geral | `GET /api/profissional`: só admin, e sem a senha. A especificação OpenAPI exige token. Rota inexistente |

### ms-clinico (34 testes)

| Área | O que é conferido |
|---|---|
| Autenticação | Sem token ou com token ruim: `401`. Token válido acessa. Rota de admin confere o perfil. A especificação OpenAPI exige token. Rota inexistente |
| Pessoa | Grava a origem do aparelho e quem sincronizou (D-25). Reenvio do mesmo ID não duplica, e o primeiro envio vale. Sem ID e sem origem, o servidor preenche com o token. Validação campo a campo. Data no futuro além da folga é recusada (D-34). JSON quebrado e ID mal formado. CPF repetido é unificado com `MAIS_RECENTE_VENCE` |
| Prontuário | Cadastro e consulta pelo ID da pessoa. Pessoa inexistente ou sem prontuário. Segundo prontuário da mesma pessoa é unificado. Prontuário enviado com o ID de uma pessoa descartada vai para a pessoa mantida |
| Atendimento | Ficha completa com medicamentos, e consulta. Referências inexistentes (`422`). Regras entre campos (cor × protocolo, Glasgow completo, destino quando encaminhado). Atendimento com prontuário descartado vai para o mantido |
| Receber dados (pull) | Sem cursor traz tudo. Com cursor traz só o que mudou, inclusive o que foi inserido ou alterado direto no SQL. A unificação aparece com o apelido e com a pessoa mantida atualizada. Cursor inválido |
| Unificação (unitário) | Complemento de campo vazio. Campo preenchido só no existente não muda. `MAIS_RECENTE_VENCE` nos dois sentidos. `SERVIDOR_VENCE` (que ainda complementa). `DESCONHECIDO` e `NAO_INFORMADO` contam como vazios. Carimbos por campo mantêm a regra certa num terceiro duplicado |
| CPF (unitário) | Dígitos verificadores certos; tamanho, pontuação e repetição errados |
| Auditoria | Cada requisição gravada com os campos do enunciado |

### ms-docs (46 testes)

| Área | O que é conferido |
|---|---|
| Autenticação | Toda rota exige token, inclusive a OpenAPI. Token vencido, de outro emissor ou público, de outra chave, sem os dados do profissional ou com tipo de registro desconhecido: `401`. Esquema diferente de Bearer. Histórico só para admin (`403`). A especificação documenta o `400` de validação (não o `422` padrão do FastAPI), e as rotas padrão `/docs` e `/openapi.json` ficam desligadas. Rota inexistente e método errado: `404` |
| PDF | Ficha completa numa página só, com cada campo no formato certo: CPF, idade, horário de Brasília, cor e significado da triagem, Glasgow, sinais vitais, medicamentos, desfecho, rastreabilidade, aviso de LGPD e número da ficha. Ficha só com os obrigatórios (os vazios aparecem como "não informado"). Ficha longa continua na 2ª página ("página 2 de 2"). O ms-docs repassa ao ms-clinico o token, o IP e o dispositivo de quem pediu. Atendimento inexistente (`404`), ID inválido (`400`), ms-clinico fora do ar (`503`) |
| E-mail | Envio ao paciente, conferido na caixa do servidor SMTP de teste: assunto, remetente, texto e PDF anexado. Repetir o pedido com o mesmo ID responde `200` e não manda um segundo e-mail, mesmo com outro corpo. Envio para outro endereço. Sem ID, o servidor gera um UUID v7. Paciente ou familiar sem e-mail: `422`, e nada fica gravado. Sete casos de validação do corpo. JSON quebrado. Atendimento inexistente não grava nada. Falha no SMTP: `502`, registrada como `ERRO`; a nova tentativa com o mesmo ID dá certo, com o destinatário da primeira vez. Dois pedidos iguais ao mesmo tempo: um `201`, um `200` e só um e-mail. Adaptador SMTP: servidor fora do ar e montagem da mensagem |
| Histórico | Do mais recente para o mais antigo, filtro por atendimento, paginação e campos. Parâmetros inválidos |
| Auditoria | A requisição autenticada grava todos os campos: rota sem a query string, IP do `X-Real-IP`, profissional, dispositivo. `401`, `403` e `404` também são gravados. Erro inesperado é gravado com status `500`. O usuário do ms-docs não consegue alterar nem apagar log |
| Unitários | CPF, telefone, números com vírgula, horário de Brasília, idade, número da ficha, gravidade do Glasgow, rótulos, UUID v7, configuração do SMTP (segurança pela porta, senha de app com espaços, remetente com nome) e mensagens de validação em português |
| Banco | As migrations rodam de novo sem erro, e a tabela pertence ao usuário do ms-docs |

### Portal Admin (27 testes)

| Área | O que é conferido |
|---|---|
| Formatação compartilhada | Datas no horário de Brasília (inclusive perto da meia-noite), início e fim do dia para os filtros, CPF, telefone, números com vírgula, idade, número da ficha, Glasgow, busca sem acento, UUID v7 em ordem, rótulos e o resumo do user-agent |
| Cliente da API | Manda o token e a consulta sem os filtros vazios. Com `401`, renova o token uma vez e repete com o token novo, mantendo o mesmo refresh token. Três `401` ao mesmo tempo fazem uma renovação só. Renovação recusada encerra a sessão com aviso. Renova antes de mandar quando o token está para vencer. Erro da API com código e detalhes; rede fora. Logout com e sem rede. Nome do arquivo do PDF. Sessão vencida guardada no navegador é descartada; quem ouve a sessão é avisado |
| Login | Sem sessão, qualquer página leva ao login. Administrador entra e vê os atendimentos. Perfil operacional é recusado, e a sessão criada no servidor é encerrada com o token dele. Senha errada e conta bloqueada (com a hora em Brasília) |
| Telas | Atendimentos: cor da triagem, data em Brasília, filtro por paciente, mensagem de erro da API. Detalhe: a ficha completa, como no PDF. PDF baixado com o token e o nome que o servidor mandou. E-mail: familiar sem e-mail fica desabilitado, e-mail inválido não deixa enviar, e a nova tentativa depois de um `502` usa o mesmo ID do pedido. Rota desconhecida e botão Sair |

Além dos testes automáticos, as telas foram conferidas num navegador de verdade (Chromium, pelo Playwright) contra a stack inteira no Docker, passando pelo Nginx: login (inclusive a recusa do perfil operacional), todas as páginas, PDF baixado, e-mail recebido pelo servidor SMTP de teste e as três especificações no Swagger, sem nenhum erro no console. Também em tamanho de celular.

---

## 13.4 Como os testes isolam cada serviço

| Dependência | No teste | Por quê |
|---|---|---|
| ms-auth (tokens) | Chaves RSA geradas pela própria suíte | Testar o serviço sem depender de outro no ar. A conferência do token é a mesma da produção |
| ms-clinico (para o ms-docs) | Falso (`httpx.MockTransport`), devolvendo atendimentos no formato real, copiado de uma resposta de verdade ([`testes/dados/atendimento_completo.json`](../servicos/ms-docs/testes/dados/atendimento_completo.json)) | Testar cada caso do PDF (completo, mínimo, longo) e simular o ms-clinico fora do ar |
| Servidor de e-mail | Servidor SMTP de verdade, rodando dentro do teste (`aiosmtpd`), que guarda as mensagens e pode recusar ou demorar | O adaptador SMTP da produção é testado de ponta a ponta, sem mandar e-mail para ninguém |
| Banco | O PostgreSQL de verdade do `infra/` | As regras centrais estão no banco |

A integração de verdade entre os serviços (Nginx → ms-docs → ms-clinico, tokens do ms-auth, logs dos três no mesmo lugar) foi conferida rodando a stack inteira no Docker durante o desenvolvimento. Na etapa 7, a coleção do Postman passa a fazer isso de forma repetível.

---

## 13.5 O que não é automatizado (ainda)

- **O sistema inteiro junto:** roteiro manual ([11](11-roteiro-de-testes.md)) e, na etapa 7, a coleção do Postman rodando sozinha (D-28).
- **O envio pelo Gmail de verdade:** só na VM, com a conta do projeto ([12.8](12-implantacao.md#128-e-mail-gmail)). O teste automático usa o mesmo adaptador, contra um servidor SMTP local.
- **App cliente:** testes na etapa 6.
- **Execução automática a cada push:** na etapa 7, o GitHub Actions roda as suítes (com um Postgres de serviço) e gera o `.exe` do cliente.

# 6. API

Contrato das rotas dos três microsserviços. É a base para implementar os serviços, o portal, o cliente e a coleção do Postman.

---

## 6.1 Visão geral

- **Endereço base:** `http://<IP-DA-VM>/api`. Tudo passa pelo Nginx (porta 80), que encaminha cada rota para o serviço dono dela, sem mudar o caminho.
- **Formato:** JSON em UTF-8, nomes em `camelCase`.
- **Autenticação:** todas as rotas exigem token, **exceto `POST /api/auth/login`** (ver [6.2](#62-autenticação)).
- **Serviços:**

| Prefixo da rota | Serviço | Linguagem |
|---|---|---|
| `/api/auth`, `/api/profissional`, `/api/log`, `/api/docs/ms-auth` | ms-auth | TypeScript (Node.js) |
| `/api/pessoa`, `/api/prontuario`, `/api/atendimento`, `/api/medicamento`, `/api/sync`, `/api/conflito`, `/api/docs/ms-clinico` | ms-clinico | Java (Spring Boot) |
| `/api/documentos`, `/api/docs/ms-docs` | ms-docs | Python (FastAPI) |

Uma rota que não existe recebe `404 NAO_ENCONTRADO`. Se o serviço dono estiver fora do ar, o Nginx responde `503 SERVICO_INDISPONIVEL`.

---

## 6.2 Autenticação

1. `POST /api/auth/login` devolve um **token de acesso** (JWT, 15 min) e um **refresh token** (7 dias).
2. As demais rotas recebem o token no cabeçalho `Authorization: Bearer <tokenDeAcesso>`.
3. Quando o token vence, o cliente chama `POST /api/auth/refresh` com o refresh token e recebe um token de acesso novo.

Sem token, ou com token inválido ou vencido, a resposta é `401 NAO_AUTENTICADO`. Detalhes (conteúdo do token, chaves, login offline) em [08-seguranca-e-auditoria.md](08-seguranca-e-auditoria.md).

Rotas marcadas **(admin)** exigem perfil `ADMIN`; com perfil `OPERACIONAL` a resposta é `403 PROIBIDO`. As outras aceitam qualquer profissional autenticado.

---

## 6.3 Cabeçalhos

| Cabeçalho | Quem envia | Para quê |
|---|---|---|
| `Authorization: Bearer ...` | cliente, portal, Postman | Autenticação |
| `X-Dispositivo-Id` | app cliente | Vai para o log de acesso (de qual aparelho veio) |
| `X-Dispositivo-Nome` | app cliente | O nome do aparelho (ex.: `Ambulância 01`). O ms-clinico usa na origem de um cadastro que chega sem o bloco `origem` no corpo (o app sempre manda o bloco). Vai codificado como num endereço (`Ambul%C3%A2ncia%2001`), porque cabeçalho HTTP só aceita ASCII, e o ms-clinico decodifica |
| `X-Real-IP`, `X-Forwarded-For` | **Nginx** (nunca o cliente) | IP real de quem chamou, usado no log de acesso |

---

## 6.4 Formatos comuns

- **Datas e horas:** ISO 8601 em UTC com `Z` (ex.: `2026-11-03T13:05:00Z`). Datas sem hora: `2026-11-03`.
- **IDs:** UUID em texto.
- **Listas fixas:** em maiúsculas, iguais às do banco ([05-modelo-de-dados.md](05-modelo-de-dados.md)).
- **Campos opcionais** sem valor vêm como `null`.

### Objetos `origem` e `sincronizacao`

Todo registro clínico (pessoa, prontuário, atendimento) carrega a rastreabilidade em dois objetos:

```json
"origem": {
  "criadoPorId": "0193f2a0-1111-7000-8000-000000000002",
  "criadoPorNome": "Dra. Ana Souza",
  "criadoPorRegistro": "CRM 12345-RS",
  "criadoEm": "2026-11-03T13:02:11Z",
  "dispositivoId": "0193f2a0-2222-7000-8000-000000000001",
  "dispositivoNome": "Ambulância 01",
  "modo": "OFFLINE"
},
"sincronizacao": {
  "sincronizadoPorId": "0193f2a0-1111-7000-8000-000000000002",
  "recebidoEm": "2026-11-03T13:40:57Z",
  "atualizadoEm": "2026-11-03T13:40:57Z"
}
```

- `origem` é **enviado pelo cliente**. Nos cadastros (`POST`) ele é **opcional**: se não vier (ex.: teste pelo Postman), o servidor preenche com o profissional do token, a hora atual e `modo = ONLINE`.
- `sincronizacao` é **preenchido pelo servidor** e só aparece nas respostas.

### Pessoa

```json
{
  "id": "0193f3c2-7c1e-7b5a-9f00-2b6c1d9e4a11",
  "nome": "João da Silva",
  "cpf": "52998224725",
  "dataNascimento": "1980-05-10",
  "sexo": "MASCULINO",
  "telefone": "51999990000",
  "email": "joao@exemplo.com",
  "contato": {
    "nome": "Maria da Silva",
    "parentesco": "Esposa",
    "telefone": "51988880000",
    "email": "maria@exemplo.com"
  },
  "origem": { "...": "..." },
  "sincronizacao": { "...": "..." }
}
```

Obrigatório no cadastro: `nome`. O `cpf` vai só com números e precisa ter dígitos verificadores válidos.

### Prontuário

```json
{
  "id": "0193f3c2-8a00-7c3d-8e11-44a2b0c9d001",
  "pessoaId": "0193f3c2-7c1e-7b5a-9f00-2b6c1d9e4a11",
  "tipoSanguineo": "O+",
  "alergias": "Dipirona",
  "comorbidades": "Hipertensão",
  "medicamentosUsoContinuo": "Losartana 50 mg",
  "observacoes": null,
  "origem": { "...": "..." },
  "sincronizacao": { "...": "..." }
}
```

Obrigatório no cadastro: `pessoaId`. Nas respostas de consulta, o prontuário vem com a pessoa junto (`"pessoa": { ... }`).

### Atendimento (Ficha de Atendimento)

```json
{
  "id": "0193f3c3-0b00-7d10-9a22-77c1e0f3b002",
  "prontuarioId": "0193f3c2-8a00-7c3d-8e11-44a2b0c9d001",
  "dataHora": "2026-11-03T13:05:00Z",
  "localOcorrencia": "BR-386, km 350",
  "tipoOcorrencia": "TRAUMA",
  "queixaPrincipal": "Dor torácica após colisão",
  "triagem": { "protocolo": "MANCHESTER", "cor": "LARANJA" },
  "glasgow": { "ocular": 4, "verbal": 5, "motora": 6, "total": 15 },
  "sinaisVitais": {
    "paSistolica": 130, "paDiastolica": 85,
    "frequenciaCardiaca": 98, "frequenciaRespiratoria": 20,
    "spo2": 96, "temperatura": 36.8, "glicemia": 110
  },
  "medicamentos": [
    {
      "id": "0193f3c3-0b01-7000-8000-000000000001",
      "medicamentoId": "0193f2a0-3333-7000-8000-000000000007",
      "nome": "Dipirona",
      "dose": 1,
      "unidade": "G",
      "via": "INTRAVENOSA",
      "horario": "2026-11-03T13:10:00Z",
      "observacao": null
    }
  ],
  "procedimentos": "Imobilização cervical; oxigênio 3 L/min",
  "desfecho": { "tipo": "ENCAMINHADO_HOSPITAL", "destino": "Hospital Regional" },
  "observacoes": null,
  "origem": { "...": "..." },
  "sincronizacao": { "...": "..." }
}
```

Obrigatórios no cadastro: `prontuarioId`, `dataHora`, `tipoOcorrencia`, `queixaPrincipal`, `triagem` e `desfecho.tipo` (e `desfecho.destino` quando o tipo é `ENCAMINHADO_HOSPITAL`). `glasgow` vai completo (os três) ou não vai. `glasgow.total` e `medicamentos[].nome` só aparecem nas respostas.

---

## 6.5 Erros

Todos os serviços respondem erros no mesmo formato:

```json
{
  "erro": "VALIDACAO",
  "mensagem": "Há campos inválidos.",
  "detalhes": [ { "campo": "cpf", "mensagem": "CPF inválido" } ]
}
```

| HTTP | `erro` | Quando |
|---|---|---|
| 400 | `VALIDACAO` | Campo obrigatório faltando, formato ou valor inválido |
| 401 | `NAO_AUTENTICADO` | Sem token, ou token inválido/vencido |
| 401 | `CREDENCIAIS_INVALIDAS` | Login com registro ou senha errados |
| 401 | `SESSAO_INVALIDA` | Refresh token vencido, revogado ou desconhecido |
| 403 | `PROIBIDO` | Rota (admin) chamada por perfil operacional |
| 403 | `PROFISSIONAL_INATIVO` | Profissional desativado (só informado depois de a senha conferir) |
| 404 | `NAO_ENCONTRADO` | Recurso do caminho não existe, ou rota inexistente |
| 422 | `PESSOA_NAO_ENCONTRADA`, `PRONTUARIO_NAO_ENCONTRADO`, `MEDICAMENTO_NAO_ENCONTRADO` | O corpo referencia algo que não existe |
| 422 | `PACIENTE_SEM_EMAIL`, `FAMILIAR_SEM_EMAIL` | Envio de e-mail para quem não tem e-mail cadastrado |
| 423 | `CONTA_BLOQUEADA` | 5 senhas erradas seguidas. A resposta inclui `bloqueadoAte` |
| 500 | `ERRO_INTERNO` | Falha inesperada |
| 502 | `FALHA_ENVIO_EMAIL` | O servidor de e-mail recusou, não respondeu, ou o envio não está configurado |
| 503 | `SERVICO_INDISPONIVEL` | Serviço fora do ar (resposta do Nginx), ou um serviço do qual a rota depende não respondeu (o ms-docs sem o ms-clinico) |

O app cliente usa esta tabela para decidir o que fazer com cada item da fila ([7.4](07-sincronizacao.md#74-envio-push)).

---

## 6.6 Idempotência e resultado dos cadastros

Os cadastros (`POST /pessoa`, `/prontuario`, `/atendimento`, `/log` e o envio de e-mail) podem ser **repetidos sem efeito colateral**. A chave é o `id` gerado por quem cria:

- O **primeiro envio** de um ID vale. Reenvios com o mesmo ID não criam nada de novo e devolvem o registro que já existe (mesmo que o corpo venha diferente).
- Se o `id` não vier, o servidor gera um (útil no Postman). Nesse caso não há proteção contra repetição.

Os três cadastros clínicos respondem neste formato:

```json
{
  "resultado": "CRIADO",
  "id": "0193f3c2-7c1e-7b5a-9f00-2b6c1d9e4a11",
  "idEnviado": "0193f3c2-7c1e-7b5a-9f00-2b6c1d9e4a11",
  "conflitoId": null,
  "dados": { "...registro como ficou no servidor..." }
}
```

| `resultado` | HTTP | Significado |
|---|---|---|
| `CRIADO` | 201 | Registro novo gravado |
| `JA_EXISTIA` | 200 | Esse ID já tinha sido recebido (reenvio). Nada mudou |
| `UNIFICADO` | 200 | Era duplicado de um registro existente: o servidor juntou os dois. `id` é o registro mantido, `idEnviado` é o descartado e `conflitoId` aponta para o registro do conflito |

Um reenvio de um registro que já tinha sido unificado devolve `UNIFICADO` de novo, com os mesmos IDs.

**Tradução de IDs descartados:** qualquer rota que recebe um ID de pessoa ou de prontuário (no caminho ou no corpo) aceita também um ID descartado numa unificação e usa o registro mantido no lugar.

---

## 6.7 Resumo das rotas

| Serviço | Método | Rota | Autenticação | O que faz |
|---|---|---|---|---|
| ms-auth | POST | `/api/auth/login` | **não** | Login. Devolve os tokens e os dados do profissional |
| | POST | `/api/auth/refresh` | refresh token | Renova o token de acesso |
| | POST | `/api/auth/logout` | sim | Encerra a sessão |
| | GET | `/api/auth/me` | sim | Profissional logado |
| | GET | `/api/auth/credenciais-offline` | sim | Profissionais ativos com o hash da senha: a réplica do login offline (D-51) |
| | GET | `/api/profissional` | sim (admin) | Lista profissionais |
| | POST | `/api/log` | sim | Recebe um lote de logs do cliente (do modo offline) |
| | GET | `/api/log/acesso` | sim (admin) | Lista o log de acesso dos três serviços |
| | GET | `/api/log/cliente` | sim (admin) | Lista os logs enviados pelos clientes |
| | GET | `/api/docs/ms-auth` | sim | Especificação OpenAPI do ms-auth |
| ms-clinico | GET | `/api/medicamento` | sim | Lista medicamentos |
| | GET | `/api/pessoa` | sim | Lista pessoas |
| | POST | `/api/pessoa` | sim | Cadastra pessoa |
| | GET | `/api/prontuario` | sim | Lista todos os prontuários |
| | GET | `/api/prontuario/{id}` | sim | Prontuário de uma pessoa (`{id}` = **ID da pessoa**) |
| | POST | `/api/prontuario` | sim | Cadastra prontuário |
| | GET | `/api/atendimento` | sim | Lista todos os atendimentos (resumo) |
| | GET | `/api/atendimento/{id}` | sim | Atendimentos de uma pessoa (`{id}` = **ID da pessoa**) |
| | GET | `/api/atendimento/detalhe/{id}` | sim | Um atendimento completo (`{id}` = ID do atendimento) |
| | POST | `/api/atendimento` | sim | Cadastra atendimento (com os medicamentos administrados) |
| | GET | `/api/sync/pull` | sim | O que mudou desde a última sincronização |
| | GET | `/api/conflito` | sim (admin) | Lista os conflitos (unificações) |
| | GET | `/api/docs/ms-clinico` | sim | Especificação OpenAPI do ms-clinico |
| ms-docs | GET | `/api/documentos/ficha/{id}/pdf` | sim | Gera e baixa o PDF da ficha (`{id}` = ID do atendimento) |
| | POST | `/api/documentos/ficha/{id}/email` | sim | Envia a ficha em PDF por e-mail |
| | GET | `/api/documentos/email` | sim (admin) | Histórico de envios |
| | GET | `/api/docs/ms-docs` | sim | Especificação OpenAPI do ms-docs |

As rotas sugeridas no enunciado estão todas aqui, com o mesmo método e caminho. Em `/prontuario/{id}` e `/atendimento/{id}`, o `{id}` é o **da pessoa**, como na tabela do professor ("obtém o prontuário de uma pessoa", "obtém todos os atendimentos de uma pessoa"). Por isso o detalhe de um atendimento ganhou uma rota separada.

---

## 6.8 ms-auth

### `POST /api/auth/login` — sem autenticação

```json
{
  "tipoRegistro": "CRM",
  "registro": "12345-RS",
  "senha": "Senha@123",
  "dispositivo": { "id": "0193f2a0-2222-7000-8000-000000000001", "nome": "Ambulância 01" }
}
```

`dispositivo` é opcional (o portal envia `{ "nome": "Portal" }`). Resposta `200`:

```json
{
  "tokenDeAcesso": "eyJhbGciOiJSUzI1NiIs...",
  "tokenDeAcessoExpiraEm": "2026-11-03T13:15:00Z",
  "refreshToken": "kT3v9...base64url...",
  "sessaoExpiraEm": "2026-11-10T13:00:00Z",
  "profissional": {
    "id": "0193f2a0-1111-7000-8000-000000000002",
    "nome": "Dra. Ana Souza",
    "tipoRegistro": "CRM",
    "registro": "12345-RS",
    "perfil": "OPERACIONAL"
  }
}
```

Erros: `400 VALIDACAO`, `401 CREDENCIAIS_INVALIDAS`, `403 PROFISSIONAL_INATIVO`, `423 CONTA_BLOQUEADA` (com `bloqueadoAte`).

### `POST /api/auth/refresh` — autenticada pelo refresh token

Corpo: `{ "refreshToken": "kT3v9..." }`. Resposta `200`: `{ "tokenDeAcesso", "tokenDeAcessoExpiraEm", "sessaoExpiraEm" }`. O refresh token **não muda** (ver D-06). Erros: `401 SESSAO_INVALIDA`, `403 PROFISSIONAL_INATIVO`.

### `POST /api/auth/logout`

Revoga a sessão do token (`sid`). Sem corpo. Resposta `204`.

### `GET /api/auth/me`

Resposta `200`: o objeto `profissional` (igual ao do login).

### `GET /api/auth/credenciais-offline`

Qualquer perfil. Resposta `200`: `{ geradoEm, profissionais: [{ id, nome, tipoRegistro, registro, perfil, senhaHash }] }`, só os **ativos**. O `senhaHash` é o hash bcrypt de `auth.profissional` (nunca a senha). O app cliente busca a cada sincronização completa e guarda o hash cifrado pelo cofre do sistema, para conferir offline a senha de quem nunca entrou naquele aparelho (D-51, [08](08-seguranca-e-auditoria.md#85-login-offline)).

### `GET /api/profissional` (admin)

Lista todos, ordenados por nome: `[{ id, nome, tipoRegistro, registro, perfil, ativo, criadoEm }]`. Nunca devolve a senha.

### `POST /api/log`

Recebe um lote de até 500 logs locais do cliente. O `id` de cada log garante que reenviar não duplica.

```json
{
  "logs": [
    {
      "id": "0193f3c4-0000-7000-8000-00000000000a",
      "profissionalId": "0193f2a0-1111-7000-8000-000000000002",
      "dispositivoId": "0193f2a0-2222-7000-8000-000000000001",
      "dispositivoNome": "Ambulância 01",
      "dataHora": "2026-11-03T13:05:40Z",
      "acao": "ATENDIMENTO_CRIADO",
      "modo": "OFFLINE",
      "detalhes": { "atendimentoId": "0193f3c3-0b00-7d10-9a22-77c1e0f3b002" }
    }
  ]
}
```

Resposta `200`: `{ "recebidos": 1, "novos": 1, "repetidos": 0 }`.

### `GET /api/log/acesso` (admin)

Filtros opcionais na query: `servico`, `profissionalId`, `metodo`, `status`, `rota` (trecho), `de`, `ate`, `pagina` (começa em 1) e `tamanho` (padrão 50, máximo 200). Ordenado do mais recente para o mais antigo.

```json
{
  "itens": [
    {
      "id": "...", "dataHora": "2026-11-03T13:40:57Z", "servico": "ms-clinico",
      "ipCliente": "177.12.34.56", "profissionalId": "...", "metodo": "POST",
      "rota": "/api/atendimento", "statusCode": 201, "tempoMs": 38,
      "dispositivoId": "...", "userAgent": "MedicalField-Cliente/1.0"
    }
  ],
  "pagina": 1, "tamanho": 50, "total": 1234
}
```

### `GET /api/log/cliente` (admin)

Mesmo formato paginado. Filtros: `profissionalId`, `dispositivoId`, `acao`, `modo`, `de`, `ate`, `pagina`, `tamanho`.

---

## 6.9 ms-clinico

### `GET /api/medicamento`

Todos os medicamentos, ordenados por nome: `[{ id, nome, apresentacao, unidadePadrao, ativo, atualizadoEm }]`. Os inativos também vêm (`ativo: false`), porque atendimentos antigos podem usá-los; o cliente só oferece os ativos na hora de escolher.

### `GET /api/pessoa` e `POST /api/pessoa`

- `GET`: todas as pessoas, ordenadas por nome.
- `POST`: corpo no formato de [Pessoa](#pessoa). Resposta no formato de [6.6](#66-idempotência-e-resultado-dos-cadastros). Se já existe outra pessoa com o mesmo CPF, o resultado é `UNIFICADO` ([7.6](07-sincronizacao.md#76-unificação-de-duplicados-conflitos)).

### `GET /api/prontuario`, `GET /api/prontuario/{id}` e `POST /api/prontuario`

- `GET /api/prontuario`: todos os prontuários, cada um com um resumo da pessoa (`pessoa: { id, nome, cpf }`).
- `GET /api/prontuario/{id}`: prontuário da pessoa `{id}`, com os dados completos da pessoa. `404 NAO_ENCONTRADO` se a pessoa não tem prontuário.
- `POST /api/prontuario`: corpo no formato de [Prontuário](#prontuário). Se a pessoa já tem prontuário, o resultado é `UNIFICADO`. Se a pessoa não existe: `422 PESSOA_NAO_ENCONTRADA`.

### `GET /api/atendimento`, `GET /api/atendimento/{id}`, `GET /api/atendimento/detalhe/{id}` e `POST /api/atendimento`

- `GET /api/atendimento`: todos, do mais recente para o mais antigo, em formato resumido (`id`, `dataHora`, `pessoa { id, nome }`, `tipoOcorrencia`, `triagem`, `desfecho`, `origem`, `sincronizacao`).
- `GET /api/atendimento/{id}`: todos os atendimentos completos da pessoa `{id}`.
- `GET /api/atendimento/detalhe/{id}`: um atendimento completo, com `pessoa` e `prontuario` juntos. É o que o ms-docs usa para montar o PDF.
- `POST /api/atendimento`: corpo no formato de [Atendimento](#atendimento-ficha-de-atendimento). Atendimento nunca é unificado: o resultado é `CRIADO` ou `JA_EXISTIA`. Erros de referência: `422 PRONTUARIO_NAO_ENCONTRADO` ou `422 MEDICAMENTO_NAO_ENCONTRADO`.

### `GET /api/sync/pull?desde=<cursor>`

Usada pelo cliente no "receber dados". Sem `desde`, devolve tudo. Com `desde`, devolve o que mudou depois daquele marcador (com uma pequena margem de segurança, ver [7.7](07-sincronizacao.md#77-recebimento-pull)).

```json
{
  "cursor": "2026-11-03T14:30:00.123Z",
  "medicamentos": [ { "...": "..." } ],
  "pessoas": [ { "...": "..." } ],
  "prontuarios": [ { "...": "..." } ],
  "atendimentos": [ { "...atendimento completo..." } ],
  "unificacoes": [
    { "entidade": "PESSOA", "idDescartado": "...", "idMantido": "..." }
  ]
}
```

O cliente guarda o `cursor` (data/hora ISO 8601 do servidor) e manda na próxima vez. Um `desde` em formato inválido recebe `400 VALIDACAO`.

### `GET /api/conflito` (admin)

Lista as unificações, da mais recente para a mais antiga:

```json
[
  {
    "id": "...",
    "entidade": "PESSOA",
    "motivo": "CPF_DUPLICADO",
    "idMantido": "...",
    "idDescartado": "...",
    "estrategia": "MAIS_RECENTE_VENCE",
    "diferencas": [
      { "campo": "telefone", "tipo": "CONFLITO", "valorMantido": "51977770000", "valorDescartado": "51999990000", "origemDoValor": "RECEBIDO" },
      { "campo": "email", "tipo": "COMPLEMENTO", "valorMantido": "joao@exemplo.com", "valorDescartado": null, "origemDoValor": "RECEBIDO" }
    ],
    "detectadoEm": "2026-11-03T13:41:02Z",
    "sincronizadoPorId": "...",
    "dispositivoNome": "Ambulância 02"
  }
]
```

---

## 6.10 ms-docs

### `GET /api/documentos/ficha/{id}/pdf`

Gera o PDF da ficha do atendimento `{id}` e devolve como arquivo: `application/pdf`, nome `ficha-atendimento-<número>.pdf`, onde o número são os 8 últimos caracteres do ID em maiúsculas (D-37). A resposta vem com `Cache-Control: no-store`, para nenhum cache guardar dado de saúde. O conteúdo do PDF está em [9.5](09-ficha-e-dominio.md#95-o-pdf-da-ficha).

O ms-docs busca os dados no ms-clinico (`GET /api/atendimento/detalhe/{id}`) pela rede interna, repassando o token de quem pediu. A chamada interna leva também o IP (`X-Real-IP`) e o dispositivo (`X-Dispositivo-Id`) de quem pediu, com `User-Agent: ms-docs`. Assim, no log de acesso do ms-clinico, ela aparece com o mesmo profissional e o mesmo IP.

| Erro | Quando |
|---|---|
| `400 VALIDACAO` | `{id}` não é um UUID |
| `404 NAO_ENCONTRADO` | O atendimento não existe (ou ainda não foi sincronizado) |
| `503 SERVICO_INDISPONIVEL` | O ms-clinico não respondeu |

### `POST /api/documentos/ficha/{id}/email`

```json
{
  "id": "0193f3c5-0000-7000-8000-0000000000e1",
  "destinatario": { "tipo": "FAMILIAR" }
}
```

- `destinatario.tipo`:
  - `PACIENTE` usa o e-mail da pessoa;
  - `FAMILIAR` usa o e-mail do contato;
  - `OUTRO` exige `destinatario.email`, e esse campo só é aceito com `OUTRO`.
- `id`: chave de idempotência, gerada por quem pede (D-36).
  - Se esse pedido já foi enviado, a resposta repete o resultado (`200`) sem mandar outro e-mail.
  - Se da vez anterior deu erro, o servidor tenta de novo com o atendimento e o destinatário **da primeira vez**; o corpo novo é ignorado.
  - Sem `id`, o servidor gera um (sem proteção contra repetição).
- O e-mail leva a ficha em PDF anexada. Assunto e texto estão em [9.6](09-ficha-e-dominio.md#96-o-e-mail).

Resposta `201` (o e-mail saiu nesta requisição) ou `200` (repetição: já tinha saído antes, nada foi reenviado):

```json
{
  "id": "0193f3c5-0000-7000-8000-0000000000e1",
  "atendimentoId": "0193f3c3-0b00-7d10-9a22-77c1e0f3b002",
  "status": "ENVIADO",
  "destinatarioTipo": "FAMILIAR",
  "destinatarioEmail": "maria@exemplo.com",
  "erro": null,
  "tentativas": 1,
  "solicitadoPorId": "0193f2a0-1111-7000-8000-000000000002",
  "dispositivoId": "0193f2a0-2222-7000-8000-000000000001",
  "solicitadoEm": "2026-11-03T13:45:08.512Z",
  "ultimaTentativaEm": "2026-11-03T13:45:09.877Z",
  "enviadoEm": "2026-11-03T13:45:09.877Z"
}
```

| Erro | Quando | Fica registrado? |
|---|---|---|
| `400 VALIDACAO` | Corpo inválido: tipo desconhecido, `OUTRO` sem e-mail ou com e-mail inválido, e-mail informado com outro tipo, campo a mais | não |
| `404 NAO_ENCONTRADO` | O atendimento não existe (ou ainda não foi sincronizado) | não |
| `422 PACIENTE_SEM_EMAIL` / `FAMILIAR_SEM_EMAIL` | O destinatário escolhido não tem e-mail no cadastro | não |
| `502 FALHA_ENVIO_EMAIL` | O servidor de e-mail recusou, não respondeu, ou o envio não está configurado no servidor (D-38). A mensagem diz qual foi | **sim**, com `status: ERRO` e o motivo em `erro`. Repetir com o mesmo `id` tenta de novo |
| `503 SERVICO_INDISPONIVEL` | O ms-clinico não respondeu | não |

### `GET /api/documentos/email` (admin)

Histórico de envios, do pedido mais recente para o mais antigo.

| Parâmetro | Padrão | Descrição |
|---|---|---|
| `atendimentoId` | — | Só os envios de um atendimento |
| `pagina` | `1` | A partir de 1 |
| `tamanho` | `50` | De 1 a 200 |

Resposta: `{ "itens": [ ...envios, no formato acima... ], "pagina": 1, "tamanho": 50, "total": 3 }`, o mesmo formato de página das listagens de log do ms-auth.

---

## 6.11 Documentação interativa e Postman

- Cada serviço gera a própria especificação **OpenAPI** e a publica em `GET /api/docs/<serviço>` (autenticada, como todas as rotas). O Portal Admin tem uma página **API (Swagger)**, em `/documentacao`, que mostra as três especificações no Swagger UI, já usando o token de quem está logado. Assim nenhuma rota fica aberta além do login.
- A coleção do Postman (com variáveis de ambiente, login automático e testes em cada requisição) fica na pasta [`postman/`](../postman). Ela também roda pela linha de comando (Newman), e o GitHub Actions roda a cada push.

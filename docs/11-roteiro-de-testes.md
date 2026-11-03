# 11. Roteiro de testes

O roteiro do enunciado (17 passos), com a ação exata e o resultado esperado de cada passo, mais quatro roteiros extras: conflito entre duas ambulâncias, login offline, testes pelo Postman e auditoria. É o entregável "Roteiro de testes".

---

## 11.1 Preparação

Antes da apresentação:

1. Na VM, o sistema está no ar (`docker compose ps` mostra tudo `Up`) e os **dados de demonstração** estão carregados (`./infra/scripts/popular-demo.sh`).
2. No notebook, o **app cliente** está instalado, com o endereço da VM configurado e o dispositivo chamado `Ambulância 01`. Para o roteiro extra 11.4, a segunda instância (`Ambulância 02`) também está configurada.
3. No notebook, um navegador aberto no portal (`http://IP-DA-VM/`), o Postman com a coleção do projeto e acesso ao banco (DBeaver com túnel SSH, ou um terminal SSH na VM).
4. Uma **caixa de e-mail que possa ser aberta na hora**, cadastrada como e-mail do contato familiar de uma pessoa de demonstração, ou digitada na opção "Outro".
5. A chave do app em **Online**, e nenhum pendente na fila.

## 11.2 Contas e dados de demonstração

| Perfil | Nome | Tipo de registro | Registro | Senha |
|---|---|---|---|---|
| ADMIN | Dr. Ricardo Almeida (regulador) | CRM | `10001-RS` | a de `DEMO_SENHA` |
| OPERACIONAL | Dra. Ana Souza | CRM | `12345-RS` | a de `DEMO_SENHA` |
| OPERACIONAL | Enf. Bruno Lima | COREN | `543210-RS` | a de `DEMO_SENHA` |
| OPERACIONAL | Carlos Pereira | SOCORRISTA | `SOC-0001` | a de `DEMO_SENHA` |

A senha das quatro contas é a definida em `DEMO_SENHA`, no `infra/.env` da VM. Ela **não fica no repositório**, porque o repositório e a VM são públicos: quem lesse a senha aqui poderia entrar no sistema publicado (D-31). Os dados também incluem cerca de 10 medicamentos, 2 pessoas com prontuário e 2 atendimentos (etapa 3), para que os passos 2 a 4 já mostrem algo.

---

## 11.3 Roteiro do enunciado

| # | Onde | Ação | Resultado esperado |
|---|---|---|---|
| 1 | Portal | Abrir `http://IP-DA-VM/` e entrar com o **admin** | Entra na página de Atendimentos. (Com um profissional operacional: "Acesso restrito a administradores") |
| 2 | Portal | Abrir **Pessoas**, **Profissionais** e **Medicamentos** | Os cadastros de demonstração aparecem |
| 3 | Portal | Abrir **Prontuários** | Os 2 prontuários de demonstração |
| 4 | Portal | Abrir **Atendimentos** | Os 2 atendimentos de demonstração |
| 5 | Cliente | Abrir o app (Ambulância 01), chave em Online, entrar com **Dra. Ana** | Entra no app. A barra mostra o profissional e "Online" |
| 6 | Cliente | Clicar em **Sincronizar** (receber dados) | Pacientes e medicamentos de demonstração aparecem no app. "Última sincronização" é atualizada |
| 7 | Cliente | **Nova ocorrência** → escolher um paciente existente → preencher e salvar um atendimento | "Salvo no aparelho" e, em instantes, o selo passa para **Sincronizado**. Fila vazia |
| 8 | Portal | **Atendimentos** → Atualizar | O atendimento novo está no topo: dispositivo `Ambulância 01`, modo **Online** |
| 9 | Banco | Inserir um medicamento direto no banco (SQL abaixo) | `INSERT 0 1` |
| 10 | Portal | **Atendimentos** (e **Medicamentos**) | Atendimentos sem mudança. Em Medicamentos, o novo (Cetoprofeno) já aparece |
| 11 | Cliente | Clicar em **Sincronizar** | O Cetoprofeno passa a aparecer na lista de medicamentos do formulário de atendimento |
| 12 | Cliente | Chave em **Offline** → **Nova ocorrência** com **pessoa nova** (ex.: Maria Oliveira, CPF válido novo) → **prontuário** → **atendimento** usando o Cetoprofeno | Tudo salvo. A barra mostra **3 pendentes**; selos **Pendente**; a tela da fila mostra os 3 itens em ordem |
| 13 | Portal | **Prontuários** e **Atendimentos** → Atualizar | **Maria não aparece**: nada saiu do aparelho |
| 14 | Cliente | Chave em **Online** | A fila esvazia sozinha (Observer), sem clicar em nada. Pendentes: 0. (O botão Sincronizar faz o mesmo) |
| 15 | Portal | **Prontuários** e **Atendimentos** → Atualizar | **Maria aparece**. O atendimento mostra modo **Offline**, com o horário de registro anterior ao "recebido em" |
| 16 | Portal ou cliente | Abrir o atendimento de Maria → **Baixar PDF** | O navegador salva `ficha-atendimento-<número>.pdf`: paciente, prontuário, triagem, Glasgow, sinais vitais, medicamentos, desfecho e rastreabilidade |
| 17 | Portal ou cliente | **Enviar por e-mail** → Familiar (ou Outro) | Status **Enviado**. Abrir a caixa de e-mail: a mensagem chegou com o PDF anexado. A página **E-mails enviados** mostra o envio |

SQL do passo 9 (via `./infra/scripts/psql.sh` na VM, ou DBeaver):

```sql
INSERT INTO clinico.medicamento (nome, apresentacao, unidade_padrao)
VALUES ('Cetoprofeno', 'Frasco-ampola 100 mg', 'MG');
```

> **Passo 10:** o enunciado diz "listar atendimentos" logo depois de inserir um medicamento. Provavelmente queria dizer "listar medicamentos". Mostramos as duas listas, para cobrir as duas leituras (ambiguidade A7 em [01](01-enunciado.md#110-ambiguidades-e-como-interpretamos)).

---

## 11.4 Extra: o mesmo paciente em duas ambulâncias (conflito)

Mostra a **unificação de duplicados** com a estratégia `MAIS_RECENTE_VENCE` ([7.6](07-sincronizacao.md#76-unificação-de-duplicados-conflitos)).

| # | Onde | Ação | Resultado esperado |
|---|---|---|---|
| A1 | Cliente 02 | Abrir o atalho **Ambulância 02**, entrar online com **Enf. Bruno** e sincronizar | Segunda instância pronta, com banco próprio |
| A2 | Clientes | Pôr as **duas** em Offline | |
| A3 | Cliente 01 | Pessoa nova com CPF **X**, telefone `51911110000`, sem e-mail; prontuário com alergias `Dipirona`; um atendimento | 3 pendentes na 01 |
| A4 | Cliente 02 | Alguns minutos depois: **a mesma pessoa** (CPF **X**), telefone `51922220000`, com e-mail; prontuário com alergias `Penicilina` e tipo sanguíneo `O+`; um atendimento | 3 pendentes na 02 |
| A5 | Cliente 01 | Pôr em Online | Sincroniza normalmente (a pessoa ainda não existia no servidor) |
| A6 | Cliente 02 | Pôr em Online | Sincroniza: pessoa e prontuário **unificados**, atendimento criado. Na 02, a pessoa aparece **uma vez só** |
| A7 | Portal | **Pessoas** e **Prontuários** | Uma única pessoa com CPF X: telefone `51922220000` (o mais recente vence), o e-mail que veio da 02 (complemento), alergias `Penicilina` (mais recente) e tipo `O+` (complemento) |
| A8 | Portal | Prontuário da pessoa | **Dois atendimentos**, um de cada ambulância |
| A9 | Portal | **Conflitos** | Duas entradas (pessoa e prontuário), com cada diferença: valor mantido, valor descartado, estratégia e dispositivo de origem |

Variação: com `ESTRATEGIA_CONFLITO=SERVIDOR_VENCE` (e o ms-clinico reiniciado), o mesmo roteiro mantém os valores da Ambulância 01 nos campos em conflito.

---

## 11.5 Extra: login offline e sessão mantida

| # | Ação | Resultado esperado |
|---|---|---|
| B1 | Com a sessão aberta, fechar o app e abrir de novo | Continua logado (sessão mantida) |
| B2 | **Sair** → na tela de login, chave em Offline → entrar com **Dra. Ana** | Entra em **modo offline** (a credencial ficou guardada no passo 5) |
| B3 | Sair → tentar entrar offline com **Carlos** (nunca entrou neste aparelho) | "O primeiro acesso neste aparelho precisa de conexão" |
| B4 | Errar a senha da Dra. Ana 5 vezes offline | "Bloqueado até HH:MM" (5 minutos) |
| B5 | Depois do bloqueio, entrar offline, registrar um atendimento e pôr a chave em Online | O app faz o login online sozinho e sincroniza o pendente |
| B6 | Portal → **Logs dos clientes** | Aparecem `LOGIN_OFFLINE`, `LOGIN_FALHOU`, `CONECTIVIDADE_ALTERADA`, `ATENDIMENTO_CRIADO`… com o modo de cada um |

---

## 11.6 Extra: testes pelo Postman

A coleção e o ambiente estão em [`postman/`](../postman): importe os dois no Postman, escolha o ambiente **MedicalField** e preencha `baseUrl` (o endereço da VM), `senha` (a `DEMO_SENHA`) e, para os passos de e-mail, `emailDeTeste`. A pasta **1. Roteiro do Postman** tem os passos abaixo, na ordem, cada um com os testes do resultado esperado (aparecem na aba **Test Results**). O login é automático: depois do C2 e do C8, os tokens já ficam guardados ([README da coleção](../postman/README.md)).

| # | Requisição | Resultado esperado |
|---|---|---|
| C1 | `GET /api/medicamento` **sem token** | `401 NAO_AUTENTICADO` |
| C2 | `POST /api/auth/login` (Dra. Ana) | `200`, com os tokens. A coleção guarda o token sozinha |
| C3 | `GET /api/medicamento` com token | `200` e a lista |
| C4 | `POST /api/pessoa` com um `id` fixo e um CPF novo | `201`, `resultado: CRIADO` |
| C5 | Repetir exatamente a mesma requisição | `200`, `resultado: JA_EXISTIA` (**idempotência**) |
| C6 | `POST /api/pessoa` com **outro** `id` e o **mesmo** CPF | `200`, `resultado: UNIFICADO`, com `conflitoId` |
| C7 | `GET /api/log/acesso` com o token da Dra. Ana | `403 PROIBIDO` (rota de admin) |
| C8 | `POST /api/auth/login` (admin) → `GET /api/log/acesso` | `200`. As chamadas anteriores aparecem, inclusive a `401` do C1, com IP, profissional, método, rota, status e tempo |
| C9 | `GET /api/prontuario/{id da pessoa}` e `GET /api/atendimento/{id da pessoa}` | O prontuário e os atendimentos da pessoa |
| C10 | `GET /api/documentos/ficha/{id do atendimento}/pdf` | `200`, o PDF da ficha (no Postman: **Send and Download**) |
| C11 | `POST /api/documentos/ficha/{id do atendimento}/email` com um `id` fixo e `{"tipo": "OUTRO", "email": "<seu e-mail>"}` em `destinatario` | `201`, `status: ENVIADO`. O e-mail chega com o PDF anexado |
| C12 | Repetir exatamente a mesma requisição | `200`, o mesmo registro, e **nenhum e-mail novo** (idempotência) |
| C13 | `GET /api/documentos/email` com o token do admin | `200`, com o envio do C11 no topo |

---

## 11.7 Extra: auditoria

1. No portal, **Logs de acesso**, filtrar pelo serviço `ms-clinico` e pela rota `/api/atendimento`: aparecem os envios do passo 14, com o IP do notebook, o ID da Dra. Ana, `POST`, `201` e o tempo em ms.
   Filtrando pelo serviço `ms-docs`, aparecem o PDF e o e-mail dos passos 16 e 17. Sem o filtro de serviço, cada um aparece junto de uma linha do `ms-clinico` no mesmo instante (`GET /api/atendimento/detalhe/...`, user-agent `ms-docs`): é o ms-docs buscando a ficha em nome de quem pediu, com o mesmo profissional e o mesmo IP.
2. No banco, tentar alterar um log:
   ```sql
   UPDATE auditoria.log_acesso SET status_code = 200;
   ```
   Resultado esperado: **erro**. Os logs não podem ser alterados nem apagados.

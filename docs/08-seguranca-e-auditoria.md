# 8. Segurança e auditoria

Autenticação (online e offline), sessão, autorização, proteção de rede e os logs de auditoria exigidos pelo enunciado.

---

## 8.1 Visão geral

| Camada | Como é protegida |
|---|---|
| Identidade | Login com tipo de registro (CRM, COREN ou ID de Socorrista) + registro + senha. Senha guardada em bcrypt |
| Requisições | Token de acesso JWT assinado (RS256) em **todas** as rotas, menos o login |
| Dispositivo | Login offline por verificador local (scrypt). Tokens guardados criptografados pelo cofre do Windows |
| Rede | Só o Nginx fica exposto. Banco e serviços ficam fechados dentro da VM |
| Banco | Um usuário por serviço, cada um só no próprio schema. Auditoria só aceita inserção |
| Auditoria | Log de toda requisição nos três serviços + log das ações feitas no aparelho |

---

## 8.2 Profissionais e perfis

- **Tipo de registro:** `CRM` (médico), `COREN` (enfermagem) ou `SOCORRISTA` (ID de socorrista). O login é feito com tipo + registro (maiúsculas e minúsculas não importam) + senha.
- **Perfil:** `OPERACIONAL` (usa o app cliente) ou `ADMIN` (pode entrar no portal, ex.: o médico regulador da central). Qualquer perfil usa o app cliente; o portal só aceita `ADMIN`.
- **Cadastro:** direto no banco, como o enunciado permite. A senha é gerada no próprio SQL com `crypt('senha', gen_salt('bf', 10))` (exemplo em [05-modelo-de-dados.md](05-modelo-de-dados.md#authprofissional)).

---

## 8.3 Tokens

### Token de acesso (JWT)

- Assinado pelo **ms-auth** com a **chave privada** RSA (algoritmo RS256). Vale **15 minutos**.
- Os outros serviços conferem com a **chave pública**: assinatura, emissor, público e validade. Só quem tem a chave privada (o ms-auth) consegue emitir token. Cada serviço valida sozinho, sem consultar o ms-auth.

| Campo (claim) | Conteúdo |
|---|---|
| `sub` | ID do profissional |
| `sid` | ID da sessão (`auth.sessao`) |
| `nome`, `tipoRegistro`, `registro`, `perfil` | Dados do profissional, para os serviços não precisarem consultar |
| `iss` | `medicalfield-auth` |
| `aud` | `medicalfield` |
| `iat`, `exp` | Emissão e validade |

### Refresh token

- 32 bytes aleatórios (texto base64url), sem significado. O servidor guarda **só o hash** (SHA-256).
- Vale até o fim da sessão: **7 dias depois do login**, sem prorrogação.
- **Não muda a cada renovação** (D-06). Se mudasse e a resposta da renovação se perdesse numa rede instável, o aparelho ficaria com um token já invalidado e perderia a sessão. Em troca, ele é guardado criptografado no aparelho e é revogado no logout.
- A cada renovação, o servidor confere: sessão não revogada, dentro da validade e profissional ativo.

### Onde ficam

| Onde | Token de acesso | Refresh token |
|---|---|---|
| App cliente | Só na memória | No SQLite, criptografado pelo cofre do Windows (`safeStorage` do Electron) |
| Portal | `sessionStorage` (some ao fechar a aba) | `sessionStorage` |

### Chaves

Geradas pelo [`infra/scripts/instalar.sh`](../infra/scripts/instalar.sh) (com o `openssl`) e guardadas em `infra/secrets/` (fora do Git). A privada vai só para o ms-auth; a pública vai para os três. Gerar chaves novas invalida todos os tokens: todo mundo precisa entrar de novo.

---

## 8.4 Login online

1. Busca o profissional por tipo + registro.
2. Se está bloqueado, responde `423 CONTA_BLOQUEADA` (com `bloqueadoAte`).
3. Confere a senha (bcrypt). Se estiver errada, conta a tentativa e responde `401 CREDENCIAIS_INVALIDAS`. Na **5ª errada seguida, bloqueia por 5 minutos** e já responde `423 CONTA_BLOQUEADA`. Para um registro inexistente, a resposta é igual à da senha errada (e demora o mesmo tempo), para não revelar quem existe.
4. Se a senha confere: zera as tentativas. Se o profissional estiver inativo, responde `403 PROFISSIONAL_INATIVO`.
5. Cria a sessão e devolve os tokens e os dados do profissional.

---

## 8.5 Login offline

O professor pediu que o login funcione sem conexão. O app confere a senha com uma de duas fontes, guardadas no SQLite:

| Fonte | De onde vem | Como confere |
|---|---|---|
| **Credencial do aparelho** (`credencial_offline`) | A cada login online **neste aparelho**: o app calcula um verificador da senha digitada | scrypt com sal aleatório (N=2¹⁵, r=8, p=1, 32 bytes). Lento de propósito: testar senhas no chute a partir de uma cópia do banco fica muito caro |
| **Réplica de credenciais** (`credencial_servidor`, D-51) | A cada sincronização completa: `GET /api/auth/credenciais-offline` traz todos os profissionais **ativos**, com o hash bcrypt da senha (o mesmo de `auth.profissional`) | bcrypt, como o ms-auth faz no login online. O hash fica no disco **cifrado pelo cofre do sistema** (DPAPI no Windows, pelo `safeStorage`): um `.db` copiado para outro PC ou outro usuário não serve para nada |

A réplica é o que deixa entrar offline **quem nunca entrou online naquele aparelho** (ex.: o socorrista que assumiu o plantão sem sinal). A senha em si nunca é gravada.

**Pré-requisito:** o aparelho precisa ter **sincronizado pelo menos uma vez**, com qualquer profissional. Num aparelho que nunca falou com o servidor, aparece "O primeiro acesso neste aparelho precisa de conexão".

**Validade:** cada fonte vale **7 dias** desde a última vez que o servidor a confirmou: um login online ou uma renovação de sessão (credencial do aparelho), ou a última sincronização (réplica). Se as duas valem, vale a confirmada mais recentemente; assim, uma senha trocada no servidor passa a valer offline na próxima sincronização. Passado o prazo, o app pede conexão.

```mermaid
flowchart TD
    A[Profissional informa registro e senha] --> B{Chave em Online?}
    B -- sim --> C[POST /api/auth/login]
    C -- 200 --> D[Atualiza a credencial do aparelho e abre sessão ONLINE]
    C -- 401, 403 ou 423 --> E[Mostra o erro. Não tenta offline]
    C -- sem resposta --> F[Avisa que o servidor está inacessível]
    B -- não --> G
    F --> G{O aparelho conhece esse registro? credencial do aparelho ou réplica}
    G -- não, e nunca sincronizou --> H[Primeiro acesso neste aparelho precisa de conexão]
    G -- não, mas já sincronizou --> H2[Registro ou senha incorretos: não revela quem existe]
    G -- sim --> I{Bloqueada ou vencida?}
    I -- sim --> J[Mostra o motivo]
    I -- não --> K{A senha confere? scrypt ou bcrypt}
    K -- não --> L[Conta a tentativa. Na 5ª seguida, bloqueia por 5 min]
    K -- sim --> M[Abre sessão OFFLINE e guarda a senha só na memória]
```

Regras complementares:

- **Login automático ao voltar a conexão.** Depois de um login offline, a senha fica **só na memória** do app (nunca em disco). Quando a conexão volta, o app faz o login online sozinho para conseguir os tokens e sincronizar. Se o app for fechado antes disso, ele pede a senha de novo na hora de sincronizar.
- **Vários profissionais por aparelho** (a equipe da ambulância): com a réplica, qualquer profissional ativo entra. Trocar de usuário é sair e entrar com outro registro.
- **Senha trocada no servidor:** vale offline depois da próxima sincronização (a réplica traz o hash novo). Até lá, no máximo 7 dias, a senha antiga ainda funciona offline.
- **Profissional desativado:** sai da réplica na próxima sincronização, e o app apaga também a credencial do aparelho dele (e encerra a sessão, se for quem está logado). O `403 PROFISSIONAL_INATIVO` no login ou na renovação faz o mesmo na hora.
- **Sem cofre no sistema** (acontece em alguns Linux): a réplica não é guardada, porque o hash não pode ir para o disco sem cifra. Vale só a credencial do aparelho.
- **O que a réplica expõe:** cada aparelho guarda o hash bcrypt de todos os profissionais ativos, e qualquer profissional logado consegue baixar a lista pela API (cada download fica no log de acesso). É a troca para permitir o login offline de quem nunca usou o aparelho (D-51).
- Todo login, online ou offline, bem-sucedido ou não, vira log local (`LOGIN_ONLINE`, `LOGIN_OFFLINE`, `LOGIN_FALHOU`).

---

## 8.6 Sessão mantida

- Fechar e abrir o app **mantém o profissional logado**. A sessão só acaba se ele clicar em **Sair**, se a sessão local vencer (fim da sessão do servidor ou da validade offline) ou se o servidor disser que o profissional foi **desativado**.
- Ao abrir o app com a chave em Online, ele renova o token de acesso em silêncio, pelo refresh token. Com a chave em Offline, segue na sessão local.
- **O servidor recusou a renovação** (`401`: sessão vencida no servidor, encerrada em outro lugar, ou outro servidor configurado): o app **continua aberto** e o profissional segue registrando no aparelho. A barra mostra "Faça login online para sincronizar", com o botão **Entrar online**, que pede só a senha. Até lá, só o que precisa do servidor fica parado: sincronizar e baixar o PDF (D-46).
- **Profissional desativado** (`403 PROFISSIONAL_INATIVO` na renovação ou no login): a sessão acaba e a credencial offline é apagada. Os pendentes continuam guardados no aparelho, para quem entrar em seguida.
- **Onde fica o refresh token:** cifrado pelo cofre do sistema (no Windows, o DPAPI, pela API `safeStorage` do Electron), na tabela `sessao`. O token de acesso (15 min) fica só na memória. Num sistema sem cofre (acontece em alguns Linux), o refresh token não vai para o disco: a senha fica na memória até o app fechar, e depois disso o app pede a senha de novo para sincronizar.
- **Sair** apaga a sessão local e o refresh token e, se estiver online, avisa o servidor (`POST /api/auth/logout`). A credencial offline **continua**, então o profissional pode entrar offline depois. Se houver pendentes, o app avisa que eles continuam guardados e serão enviados por quem entrar em seguida.
- Sair estando offline: a sessão no servidor vence sozinha. Ninguém mais consegue usá-la, porque o aparelho já apagou o refresh token.

**No Portal Admin:**

- A sessão fica no `sessionStorage`: recarregar a página mantém o login; fechar a aba encerra.
- O portal renova o token de acesso sozinho, quando faltam 30 segundos para vencer ou quando o servidor responde `401`. Várias requisições ao mesmo tempo esperam uma renovação só.
- Se a renovação for recusada (sessão vencida ou encerrada), o portal volta ao login com o aviso "Sua sessão terminou" e esquece os dados que tinha carregado.
- **Sair** chama `POST /api/auth/logout` (o refresh token deixa de valer) e apaga a sessão do navegador.
- Um profissional operacional que tenta entrar no portal recebe "Acesso restrito a administradores", e a sessão que o servidor acabou de criar é encerrada na hora.

---

## 8.7 Autorização

- **Toda rota exige token, exceto `POST /api/auth/login`** (D-19). Não existem rotas abertas "de infraestrutura": o Docker confere se os serviços estão de pé testando a porta (não uma rota HTTP), e a documentação OpenAPI também exige token.
- **Rotas (admin):** `GET /api/profissional`, `GET /api/log/acesso`, `GET /api/log/cliente`, `GET /api/conflito` e `GET /api/documentos/email`. Com perfil operacional a resposta é `403 PROIBIDO`.
- **Portal:** só entra quem tem perfil `ADMIN`. O portal confere o perfil depois do login, e o servidor confere de novo nas rotas de admin.
- **App cliente:** aceita qualquer perfil.

---

## 8.8 Rede e segredos

- **Portas públicas na VM:** só a do Nginx (80) e a do SSH (22), que é para administração.
- **Banco:** publicado só em `127.0.0.1:5433`. É acessado pela própria VM ou por um túnel SSH ([12-implantacao.md](12-implantacao.md)). Os serviços não publicam porta nenhuma: só o Nginx fala com eles, pela rede interna do Docker.
- **Cabeçalhos do portal (Nginx):** `X-Content-Type-Options: nosniff` (o navegador não "adivinha" o tipo de um arquivo), `Referrer-Policy: no-referrer` (um link externo não fica sabendo de que página do portal veio), `X-Frame-Options: DENY` (ninguém abre o portal dentro de outro site) e uma **política de conteúdo (CSP)**: a página só carrega scripts, fontes e dados do próprio servidor, e não roda script embutido. Se um XSS conseguisse injetar HTML, o script não rodaria e o token do `sessionStorage` não teria para onde ir (`connect-src 'self'`). Por isso o script do tema fica num arquivo (`apps/portal/public/tema.js`), e não dentro do `index.html`. O app cliente tem a sua CSP na própria página.
- **Sem CORS:** o portal e a API estão no mesmo endereço; o app cliente faz as requisições pelo processo principal do Electron (que não é um navegador); o Postman não usa CORS.
- **HTTP sem criptografia**, por enquanto: a VM não tem domínio. HTTPS é opcional ([D-24](03-decisoes.md), [12-implantacao.md](12-implantacao.md)).
- **Segredos:** a senha das contas de demonstração (`DEMO_SENHA`) e a do e-mail ficam em `infra/.env`; as chaves JWT, em `infra/secrets/`. Os dois ficam fora do Git (`.gitignore`). O modelo está em `infra/.env.example`. As senhas do banco são simples e estão no próprio modelo, porque o banco só aceita conexões de dentro da VM (D-49).
- **Firewall recomendado na VM (ufw):** liberar 22 e 80 (e 443, se houver HTTPS). As portas do banco e dos serviços já estão presas a `127.0.0.1` ou à rede interna do Docker.

---

## 8.9 Log de acesso (servidor)

O enunciado exige um middleware/interceptor em **todos os serviços backend** que registre, em cada requisição HTTP: **data/hora, IP do cliente, ID do profissional autenticado, método HTTP, rota, status code e tempo de processamento (ms)**.

| Serviço | Como é feito |
|---|---|
| ms-auth (TypeScript, Fastify) | Ganchos `onRequest` (marca o início) e `onResponse` (grava) |
| ms-clinico (Java, Spring Boot) | Filtro de servlet (`OncePerRequestFilter`) em volta de toda a cadeia, incluindo a segurança |
| ms-docs (Python, FastAPI) | Middleware ASGI em volta de todo o app (inclusive da autenticação e do tratamento de erros), que grava numa thread separada |

Funcionamento (igual nos três):

1. Marca a hora de início.
2. Deixa a requisição seguir normalmente.
3. No fim, junta: status da resposta, tempo gasto, ID do profissional (do token já validado; vazio se não havia token válido; no login bem-sucedido, o ID de quem entrou), IP (do cabeçalho `X-Real-IP`, preenchido pelo Nginx), método, rota, `X-Dispositivo-Id` e user-agent.
4. Grava em `auditoria.log_acesso` **sem atrasar a resposta**. Se a gravação do log falhar, o erro vai para o log técnico do container e a requisição não é afetada.

**Tudo é registrado**, inclusive `401`, `403`, `404` e erros internos. Só ficam de fora as requisições que o Nginx recusa sem chegar a nenhum serviço (rota inexistente ou serviço fora do ar); essas ficam no log técnico do Nginx.

**Imutável:** um gatilho no banco recusa `UPDATE` e `DELETE` nas tabelas de auditoria, e ms-clinico e ms-docs só têm permissão de `INSERT`.

**Consulta:** página **Logs de acesso** do portal (com filtros por serviço, profissional, rota, status e período) ou SQL direto.

---

## 8.10 Log do cliente

O app registra localmente (`log_local`) as ações feitas no aparelho, principalmente as feitas offline, que o servidor não teria como saber. Elas sobem em lote pelo `POST /api/log` no fim de cada sincronização e vão para `auditoria.log_cliente`.

| Ação | Quando |
|---|---|
| `LOGIN_ONLINE` / `LOGIN_OFFLINE` | Login bem-sucedido |
| `LOGIN_FALHOU` | Senha errada, bloqueio ou credencial vencida |
| `LOGOUT` | Saída |
| `CONECTIVIDADE_ALTERADA` | A chave Online/Offline mudou de posição |
| `PESSOA_CRIADA`, `PRONTUARIO_CRIADO`, `ATENDIMENTO_CRIADO` | Cadastros |
| `EMAIL_SOLICITADO`, `PDF_BAIXADO` | Ficha de atendimento |
| `SINCRONIZACAO_INICIADA`, `SINCRONIZACAO_CONCLUIDA`, `SINCRONIZACAO_FALHOU` | Ciclos de sincronização |
| `REGISTRO_UNIFICADO` | O servidor unificou um registro deste aparelho |
| `ITEM_COM_ERRO` | Um item da fila falhou de vez |

Cada log tem: ID próprio, profissional, dispositivo, data/hora (do aparelho), modo (`ONLINE`/`OFFLINE`) e detalhes (ex.: o ID do atendimento). O app mostra esses logs na tela **Logs locais**, e o portal na página **Logs dos clientes**.

---

## 8.11 LGPD: o que fazemos e o que fica de fora

Dado de saúde é **dado pessoal sensível** pela LGPD. O que o projeto faz:

- só profissionais autenticados acessam dados clínicos, e cada acesso fica registrado;
- logs não podem ser alterados nem apagados;
- senhas nunca são guardadas em texto (bcrypt no servidor, scrypt no aparelho);
- tokens ficam criptografados no aparelho;
- o banco não fica exposto na internet, e cada serviço só enxerga o próprio schema;
- registros clínicos não são apagados nem reescritos.

O que fica fora do escopo, de propósito (o foco é a arquitetura, D-20):

| Ponto | Num sistema real |
|---|---|
| HTTPS | Obrigatório. Aqui depende de a VM ter domínio (D-24) |
| Criptografia do arquivo SQLite | Usaríamos SQLCipher, com a chave guardada no cofre do sistema |
| Minimização de dados no aparelho | O aparelho receberia só os pacientes da sua região ou equipe. Aqui recebe todos (D-26) |
| Consentimento, termos e política de retenção | Necessários para operar de verdade |

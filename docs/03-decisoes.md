# 3. Registro de decisões

Cada decisão importante do projeto, com o motivo e as alternativas descartadas. Serve para quem chegar depois entender **por que** as coisas são como são, e não só **como** são.

Formato: **Decisão** · **Por quê** · **Alternativas descartadas** · **Consequências**. As decisões são numeradas (D-01, D-02…) e citadas assim nos outros documentos.

| # | Decisão (resumo) |
|---|---|
| [D-01](#d-01--cliente-desktop-com-electron-e-sqlite) | Cliente desktop com Electron e SQLite |
| [D-02](#d-02--três-microsserviços-em-três-linguagens) | Três microsserviços em três linguagens |
| [D-03](#d-03--postgresql-próprio-em-docker-com-um-schema-por-serviço) | PostgreSQL próprio em Docker, um schema por serviço |
| [D-04](#d-04--log-de-acesso-gravado-direto-no-banco-só-com-insert) | Log de acesso gravado direto no banco, só com INSERT |
| [D-05](#d-05--nginx-como-gateway-único) | Nginx como gateway único |
| [D-06](#d-06--jwt-rs256-de-15-min--refresh-token-de-7-dias-sem-rotação) | JWT RS256 de 15 min + refresh token de 7 dias sem rotação |
| [D-07](#d-07--login-offline-por-verificador-local) | Login offline por verificador local |
| [D-08](#d-08--registros-clínicos-imutáveis) | Registros clínicos imutáveis |
| [D-09](#d-09--id-gerado-por-quem-cria-idempotência-pelo-id) | ID gerado por quem cria; idempotência pelo ID |
| [D-10](#d-10--conflito--duplicidade-resolvida-por-unificação) | Conflito = duplicidade, resolvida por unificação |
| [D-11](#d-11--um-caminho-só-para-gravar) | Um caminho só para gravar |
| [D-12](#d-12--envio-em-ordem-um-item-por-vez) | Envio em ordem, um item por vez |
| [D-13](#d-13--recebimento-incremental-com-margem-de-segurança) | Recebimento incremental com margem de segurança |
| [D-14](#d-14--a-chave-onlineoffline-é-o-interruptor-geral) | A chave Online/Offline é o interruptor geral |
| [D-15](#d-15--pdf-gerado-só-no-servidor) | PDF gerado só no servidor |
| [D-16](#d-16--e-mail-real-pelo-gmail-atrás-de-um-adapter) | E-mail real pelo Gmail, atrás de um Adapter |
| [D-17](#d-17--portal-somente-leitura-só-para-admin) | Portal somente leitura, só para admin |
| [D-18](#d-18--rotas-do-enunciado-preservadas) | Rotas do enunciado preservadas |
| [D-19](#d-19--nenhuma-rota-aberta-além-do-login) | Nenhuma rota aberta além do login |
| [D-20](#d-20--domínio-clínico-simplificado) | Domínio clínico simplificado |
| [D-21](#d-21--react--typescript--mantine-nas-duas-interfaces) | React + TypeScript + Mantine nas duas interfaces |
| [D-22](#d-22--monorepo-em-português-com-fim-de-linha-lf) | Monorepo em português, com fim de linha LF |
| [D-23](#d-23--datas-em-utc) | Datas em UTC |
| [D-24](#d-24--http-por-enquanto-https-opcional) | HTTP por enquanto; HTTPS opcional |
| [D-25](#d-25--quem-criou--quem-sincronizou) | Quem criou ≠ quem sincronizou |
| [D-26](#d-26--o-cliente-recebe-todos-os-dados) | O cliente recebe todos os dados |
| [D-27](#d-27--seis-padrões-de-projeto) | Seis padrões de projeto |
| [D-28](#d-28--testes-coleção-do-postman-e-exe-automático) | Testes, coleção do Postman e .exe automático |
| [D-29](#d-29--duas-instâncias-do-cliente-no-mesmo-pc) | Duas instâncias do cliente no mesmo PC |
| [D-30](#d-30--senha-em-bcrypt-por-causa-do-cadastro-manual) | Senha em bcrypt por causa do cadastro manual |
| [D-31](#d-31--senha-das-contas-de-demonstração-fora-do-repositório) | Senha das contas de demonstração fora do repositório |
| [D-32](#d-32--no-ms-clinico-o-token-é-conferido-por-um-filtro-próprio) | No ms-clinico, o token é conferido por um filtro próprio |
| [D-33](#d-33--sql-explícito-no-ms-clinico-sem-jpa) | SQL explícito no ms-clinico, sem JPA |
| [D-34](#d-34--folga-de-1-hora-para-datas-no-futuro) | Folga de 1 hora para datas no futuro |

---

### D-01 — Cliente desktop com Electron e SQLite

- **Decisão:** o app cliente é um programa desktop para Windows, feito com Electron (React + TypeScript), com banco local SQLite.
- **Por quê:** o professor liberou celular, desktop ou web. O desktop dá um banco embarcado "de verdade" (um arquivo SQLite), funciona offline sem depender de nada (está instalado no PC), guarda tokens no cofre do Windows e é fácil de demonstrar num notebook. Usa TypeScript, que o aluno já conhece.
- **Alternativas descartadas:**
  - *Web/PWA:* o navegador só libera service worker e criptografia em HTTPS, e a VM não tem HTTPS. O "banco" seria o IndexedDB, mais difícil de apresentar como banco embarcado.
  - *Celular:* exige emulador ou aparelho, espelhar a tela e fazer o celular alcançar a VM. Muito trabalho sem cumprir nenhum requisito a mais.
  - *JavaFX ou Python desktop:* telas mais lentas de construir, e nada reaproveitado do portal.
- **Consequências:** é preciso gerar um instalador `.exe` (D-28). O Windows mostra um aviso na primeira execução, porque o `.exe` não tem assinatura digital.

### D-02 — Três microsserviços em três linguagens

- **Decisão:** **ms-clinico** em Java (Spring Boot), **ms-auth** em TypeScript (Node.js) e **ms-docs** em Python (FastAPI).
- **Por quê:** o enunciado exige no mínimo três serviços autônomos em linguagens diferentes. Java fica com a parte mais delicada (transações, sincronização, conflitos), onde o aluno tem mais experiência e o Spring Boot já traz muita coisa pronta. Python tem ótimas bibliotecas de PDF e o FastAPI gera OpenAPI sozinho. A autenticação é pequena e, em TypeScript, fica na mesma linguagem do cliente e do portal.
- **Alternativas descartadas:** um serviço de auditoria separado (quarto serviço): mais trabalho sem ganho de requisito. A auditoria ficou no ms-auth ("identidade e auditoria").
- **Consequências:** o middleware de log e a validação de JWT são feitos três vezes, uma em cada linguagem.

### D-03 — PostgreSQL próprio em Docker, com um schema por serviço

- **Decisão:** um container PostgreSQL 18 só do projeto, com um schema e um usuário de banco por serviço. Ele é publicado em `127.0.0.1:5433`.
- **Por quê:** fica isolado de qualquer Postgres que já exista na VM (sem risco de mexer em outros bancos), e o mesmo `docker compose` funciona igual na VM e no desenvolvimento. Um schema por serviço é o *database per service* possível com um servidor só: cada serviço só enxerga o que é seu.
- **Alternativas descartadas:** usar o Postgres já instalado na VM (mais configuração manual e diferença entre desenvolvimento e VM); um servidor de banco por serviço (pesado demais para a VM).
- **Consequências:** para entrar no banco usa-se `infra/scripts/psql.sh`, `psql -p 5433` na VM ou DBeaver com túnel SSH. Não há chave estrangeira entre schemas.

### D-04 — Log de acesso gravado direto no banco, só com INSERT

- **Decisão:** os três serviços gravam o log de acesso direto em `auditoria.log_acesso`. O schema é do ms-auth; ms-clinico e ms-docs só têm permissão de `INSERT`.
- **Por quê:** passar por uma API a cada requisição deixaria tudo mais lento, criaria dependência entre os serviços e geraria "logs dos logs". É uma exceção consciente ao "cada serviço só no seu schema", limitada a inserir.
- **Consequências:** um gatilho impede `UPDATE` e `DELETE` nas tabelas de auditoria. O ms-auth precisa ter criado as tabelas antes de os outros serviços subirem.

### D-05 — Nginx como gateway único

- **Decisão:** o Nginx é a única porta pública (80). Ele encaminha `/api/...` para o serviço dono da rota, sem reescrever o caminho, e entrega o portal no mesmo endereço.
- **Por quê:** é um endereço só para o cliente, o portal e o Postman. Os serviços ficam fechados, o IP real é repassado para o log e não é preciso CORS.
- **Consequências:** os serviços implementam as rotas já com o prefixo `/api`. Serviço fora do ar vira `503 SERVICO_INDISPONIVEL`.

### D-06 — JWT RS256 de 15 min + refresh token de 7 dias sem rotação

- **Decisão:** o token de acesso é um JWT assinado com RSA (RS256) que vale 15 min. O refresh token é opaco, vale 7 dias a partir do login e **não muda** a cada renovação.
- **Por quê:** com chave assimétrica, só o ms-auth emite tokens, e os outros validam sozinhos. O refresh token não roda porque, numa rede instável, uma resposta de renovação perdida derrubaria a sessão do aparelho.
- **Alternativas descartadas:** chave compartilhada (HS256): qualquer serviço poderia emitir token. Rotação do refresh token: mais segura, mas frágil sem conexão estável.
- **Consequências:** o refresh token precisa ser bem guardado (cofre do Windows) e é revogado no logout.

### D-07 — Login offline por verificador local

- **Decisão:** a cada login online, o app guarda um verificador scrypt da senha. Offline, ele confere a senha contra esse verificador. Validade de 7 dias desde a última validação online; 5 erros seguidos bloqueiam por 5 min; vários profissionais por aparelho; a senha fica só na memória até o login online automático.
- **Por quê:** o professor pediu login offline e sessão mantida. É o mesmo princípio de desbloquear o celular sem internet.
- **Consequências:** o primeiro acesso de cada profissional num aparelho precisa ser online. Uma senha trocada no servidor só é aprendida no próximo login online.

### D-08 — Registros clínicos imutáveis

- **Decisão:** pessoa, prontuário e atendimento não são editados nem apagados. O atendimento é registrado de uma vez, num formulário só.
- **Por quê:** as rotas do enunciado só criam e consultam. Editar aumentaria muito a complexidade (conflitos de edição) sem ser pedido. E combina com prontuário médico, que não se reescreve.
- **Consequências:** um conjunto de sinais vitais por atendimento. O único conflito possível passa a ser duplicidade (D-10).

### D-09 — ID gerado por quem cria; idempotência pelo ID

- **Decisão:** todo registro e todo pedido têm um UUID gerado por quem cria. O primeiro envio de um ID vale; reenvios devolvem o que já existe.
- **Por quê:** offline não há servidor para gerar ID. E é o jeito mais simples de reenviar com segurança.
- **Consequências:** pelo Postman o `id` pode ser omitido (o servidor gera), mas aí não há proteção contra repetição.

### D-10 — Conflito = duplicidade, resolvida por unificação

- **Decisão:** quando chega uma pessoa com CPF já cadastrado, ou um segundo prontuário para a mesma pessoa, o servidor junta os dois. O registro existente fica e os campos são mesclados por uma estratégia trocável: `MAIS_RECENTE_VENCE` (padrão) ou `SERVIDOR_VENCE`. Cada campo guarda o próprio carimbo de data/hora. O ID descartado vira apelido do mantido, e tudo é registrado em `conflito`.
- **Por quê:** sem edição (D-08), duplicidade é o conflito que existe de verdade num cenário offline com várias ambulâncias. O Strategy é o padrão sugerido pelo enunciado para isso.
- **Alternativas descartadas:** recusar o duplicado (o item ficaria preso na fila do aparelho); aceitar e deixar duplicado (dados do paciente espalhados).
- **Consequências:** o cliente precisa tratar a resposta `UNIFICADO` e trocar as referências locais. Pessoa sem CPF nunca é unificada.

### D-11 — Um caminho só para gravar

- **Decisão:** toda gravação no cliente vai para o SQLite e para a outbox, online ou offline. Online, a fila é enviada na hora.
- **Por quê:** um caminho só tem metade dos lugares para bug, e o modo offline é testado o tempo todo, até quando se está online.
- **Consequências:** no modo online, a tela mostra "Pendente" por um instante, até o envio terminar.

### D-12 — Envio em ordem, um item por vez

- **Decisão:** a fila sai na ordem de criação, um item por vez. Erro temporário para a fila e tenta de novo com espera crescente. Erro definitivo marca o item e segue para o próximo. Um `500` vira definitivo depois de 3 tentativas.
- **Por quê:** a ordem garante que pessoa chega antes do prontuário, e prontuário antes do atendimento. O limite do `500` evita que um item com problema trave a fila inteira.
- **Consequências:** o volume é pequeno, então ir um por vez não pesa.

### D-13 — Recebimento incremental com margem de segurança

- **Decisão:** `GET /api/sync/pull?desde=` devolve o que mudou desde o cursor menos 30 segundos, numa transação `REPEATABLE READ`. O cliente grava com upsert.
- **Por quê:** a margem cobre gravações que estavam em andamento durante a consulta anterior; o upsert torna as repetições inofensivas.
- **Consequências:** medicamentos inseridos à mão no SQL aparecem no próximo pull, porque `atualizado_em` tem valor padrão e gatilho.

### D-14 — A chave Online/Offline é o interruptor geral

- **Decisão:** com a chave em Offline, o app não faz nenhuma requisição; o bloqueio fica no cliente HTTP do núcleo. Com a chave em Online, uma queda real da rede é tratada como offline temporário, com novas tentativas.
- **Por quê:** é o simulador de rede exigido, e o passo 13 do roteiro só passa se o bloqueio for real. Tratar quedas reais deixa o app robusto fora da sala de aula também.

### D-15 — PDF gerado só no servidor

- **Decisão:** o PDF da Ficha de Atendimento é gerado pelo ms-docs. Portal e cliente só pedem e baixam.
- **Por quê:** há uma única versão "oficial" do documento e um código só para montá-lo.
- **Consequências:** o PDF só existe para atendimentos já sincronizados; no cliente, o botão fica desabilitado enquanto o atendimento estiver pendente.

### D-16 — E-mail real pelo Gmail, atrás de um Adapter

- **Decisão:** o ms-docs envia pelo SMTP do Gmail, com uma conta criada para o projeto e uma "senha de app". O envio fica atrás da interface `EnvioDeEmail` (padrão Adapter). Um pedido de e-mail feito offline entra na fila do cliente.
- **Por quê:** o e-mail precisa chegar numa caixa de verdade, e esse é o caminho gratuito mais simples. O Adapter permite trocar para um provedor por API (porta 443) se a VM bloquear SMTP.
- **Consequências:** o pedido tem ID próprio (idempotência), então repetir não manda dois e-mails.

### D-17 — Portal somente leitura, só para admin

- **Decisão:** o portal não cadastra nada (o enunciado permite inserir direto no banco). Só entra perfil `ADMIN`. Além do exigido, mostra logs, conflitos, e-mails enviados e a documentação da API. Os tokens ficam no `sessionStorage`.
- **Por quê:** menos código, sem perder nenhum requisito, e as telas extras ajudam a demonstrar auditoria e conflitos.

### D-18 — Rotas do enunciado preservadas

- **Decisão:** todas as rotas sugeridas existem com o mesmo método e caminho, no singular. Em `/prontuario/{id}` e `/atendimento/{id}`, o `{id}` é o da **pessoa**. O detalhe de um atendimento usa `/atendimento/detalhe/{id}`. Rotas extras foram adicionadas conforme a necessidade.
- **Por quê:** o professor vai testar pelo Postman a partir da tabela dele.

### D-19 — Nenhuma rota aberta além do login

- **Decisão:** não há rota HTTP de *health check* (o Docker testa a porta) e a especificação OpenAPI é servida por uma rota autenticada, exibida no portal.
- **Por quê:** o enunciado diz "todas as rotas (com exceção da rota de login) exigem autenticação". Assim, essa frase vale sem nenhuma exceção.

### D-20 — Domínio clínico simplificado

- **Decisão:** a triagem é só protocolo + cor (sem o assistente do START), e não há alertas de dose ou de alergia.
- **Por quê:** o objetivo é a arquitetura de software, não um sistema médico pronto para uso real (decisão do aluno).

### D-21 — React + TypeScript + Mantine nas duas interfaces

- **Decisão:** portal e cliente usam React, TypeScript, Vite e a biblioteca de componentes Mantine, e compartilham as definições de tipos.
- **Por quê:** formulários, tabelas e datas prontos, com bom visual e pouco esforço. A mesma base nas duas interfaces.

### D-22 — Monorepo em português, com fim de linha LF

- **Decisão:** um repositório com tudo. Documentação e nomes do domínio em português (como no enunciado); termos técnicos em inglês no código (`Controller`, `Repository`…). Fim de linha LF garantido pelo `.gitattributes`.
- **Por quê:** visão única do projeto; vocabulário igual ao do professor; o desenvolvimento acontece no Windows, e scripts com CRLF quebram no Linux.

### D-23 — Datas em UTC

- **Decisão:** gravar em UTC e mostrar no horário de Brasília.
- **Por quê:** evita confusão entre aparelho, servidor e banco.

### D-24 — HTTP por enquanto; HTTPS opcional

- **Decisão:** a VM responde em HTTP. HTTPS (subdomínio gratuito + Let's Encrypt) fica como melhoria, depois de verificar a VM ([12-implantacao.md](12-implantacao.md#123-verificações-iniciais-da-vm)).
- **Por quê:** sem domínio não há certificado válido.
- **Consequências:** senha e dados trafegam sem criptografia na rede. Esse risco está registrado em [8.11](08-seguranca-e-auditoria.md#811-lgpd-o-que-fazemos-e-o-que-fica-de-fora).

### D-25 — Quem criou ≠ quem sincronizou

- **Decisão:** quem estiver logado envia todos os pendentes do aparelho. O registro guarda `criado_por` (quem registrou) e `sincronizado_por` (dono do token que enviou).
- **Por quê:** dado de paciente não pode ficar preso no aparelho esperando um profissional específico voltar.

### D-26 — O cliente recebe todos os dados

- **Decisão:** o "receber dados" traz todos os medicamentos, pessoas, prontuários e atendimentos.
- **Por quê:** é a escala de uma demonstração. Num sistema real, o aparelho receberia só os pacientes da sua região ou equipe (minimização exigida pela LGPD).

### D-27 — Seis padrões de projeto

- **Decisão:** Repository, Strategy e Observer (sugeridos) + Command, Adapter e Builder (escolhidos). Onde cada um aparece: [4.5](04-arquitetura.md#45-padrões-de-projeto).
- **Por quê:** o título do enunciado diz "sugestão", mas o item 4 pede "outros 3 de livre escolha". Fazer os seis evita perder ponto. Os escolhidos são os que aparecem naturalmente no projeto.

### D-28 — Testes, coleção do Postman e .exe automático

- **Decisão:** testes automatizados nas partes críticas (sincronização, idempotência, unificação, login offline, middleware de log); coleção do Postman com login automático; o GitHub Actions gera o instalador `.exe` do cliente numa máquina Windows.
- **Por quê:** o projeto precisa funcionar perfeitamente na apresentação, e o `.exe` precisa ser gerado no Windows.

### D-29 — Duas instâncias do cliente no mesmo PC

- **Decisão:** o cliente aceita o parâmetro `--perfil=<nome>`, que usa outra pasta de dados (outro SQLite e outra configuração). Um segundo atalho abre a "Ambulância 02".
- **Por quê:** demonstrar a unificação de duplicados (dois aparelhos offline cadastrando o mesmo paciente) com um notebook só.

### D-30 — Senha em bcrypt por causa do cadastro manual

- **Decisão:** a senha do profissional é bcrypt (custo 10), e a extensão `pgcrypto` fica instalada no banco.
- **Por quê:** o enunciado permite inserir cadastros direto no banco. Com `crypt('senha', gen_salt('bf', 10))`, um profissional pode ser criado no SQL já com uma senha que o ms-auth sabe conferir.

### D-31 — Senha das contas de demonstração fora do repositório

- **Decisão:** a senha das contas de demonstração é definida em `DEMO_SENHA`, no `infra/.env` da VM, e usada pelo `infra/scripts/popular-demo.sh`. Ela não aparece em nenhum documento.
- **Por quê:** o repositório é público e a VM fica na internet. Com a senha publicada, qualquer pessoa poderia entrar no sistema como administrador e, por exemplo, usar o envio de e-mail do projeto.
- **Consequências:** na apresentação, usa-se a senha que foi definida no `.env`. O roteiro de testes cita "a de `DEMO_SENHA`".

### D-32 — No ms-clinico, o token é conferido por um filtro próprio

- **Decisão:** o ms-clinico confere o JWT com um filtro de servlet próprio, usando a biblioteca Nimbus JOSE + JWT (a mesma que o Spring Security usa por baixo), em vez de configurar o Spring Security inteiro.
- **Por quê:** o serviço não tem nenhuma rota pública, então a regra é simples: sem token válido, `401`. Com um filtro próprio, a ordem fica explícita (log de acesso por fora de tudo, depois a autenticação) e a resposta de erro sai no mesmo formato dos outros serviços sem adaptações.
- **Consequências:** as rotas de admin são marcadas com `@SomenteAdmin` e conferidas por um interceptor.

### D-33 — SQL explícito no ms-clinico, sem JPA

- **Decisão:** o acesso ao banco usa SQL escrito à mão, com o `JdbcClient` do Spring, dentro das classes `Repositorio*` (padrão Repository). As tabelas são criadas pelo Flyway.
- **Por quê:** as regras centrais dependem de recursos do Postgres que ficam mais claros em SQL: `INSERT ... ON CONFLICT DO NOTHING` (idempotência), `SELECT ... FOR UPDATE` (unificação sem corrida), `jsonb` (carimbos e diferenças) e transação `REPEATABLE READ` (receber dados).
- **Alternativas descartadas:** JPA/Hibernate, que esconderia exatamente essas partes.

### D-34 — Folga de 1 hora para datas no futuro

- **Decisão:** o servidor recusa datas (registro, atendimento, horário de medicamento) mais de 1 hora no futuro. O app cliente continua não deixando digitar data no futuro.
- **Por quê:** o relógio de um aparelho pode estar alguns minutos adiantado. Sem folga, um registro feito offline seria recusado de vez na sincronização e ficaria preso na fila.


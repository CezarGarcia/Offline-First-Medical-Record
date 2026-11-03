# 1. Enunciado do trabalho

Resumo organizado e fiel do que foi pedido no **Trabalho Final — MedicalField** da disciplina **4815206 – Arquiteturas de Software** (Univates, 2026/B, Prof. Fabrício). No fim estão as ambiguidades que encontramos e como decidimos interpretá-las. O PDF original não fica versionado no repositório.

> "A partir dos conceitos de microsserviços, arquitetura de sistemas e integração de serviços, vamos realizar uma implementação com base no tema a seguir. Primeiro, faremos o mapeamento da solução, em seguida, a implementação."

---

## 1.1 Tema

**Prontuário Médico de Emergência (MedicalField)**, para equipes de resgate e socorristas (SAMU, ambulâncias de rodovias, equipes em desastres naturais) que fazem atendimento pré-hospitalar em lugares com internet instável, lenta ou inexistente.

## 1.2 Contexto do problema

- Durante um atendimento crítico, é preciso registrar na hora **sinais vitais**, **nível de consciência (Escala de Glasgow)**, **protocolos de triagem (Manchester e START)** e **medicamentos administrados**. Isso evita erros de medicação (dose excessiva, reações adversas) e garante a continuidade do cuidado quando o paciente é entregue na emergência do hospital.
- Se o sistema dependesse só da nuvem, a perda de sinal impediria o registro. Por isso a arquitetura deve ser **Offline-First**: o dispositivo da ambulância ou do socorrista funciona localmente sem restrição e, quando o sinal volta (ou ao chegar ao Wi-Fi do hospital), **sincroniza as fichas de atendimento** com o servidor central, garantindo **idempotência, rastreabilidade auditável e tratamento de conflitos de dados**.
- O backend deve ter **pelo menos três microsserviços em linguagens de programação diferentes**, mais uma **interface gráfica administrativa** e uma **aplicação cliente**, também com interface gráfica.
- A plataforma deve **gerar a Ficha de Atendimento em PDF** para download e **enviá-la por e-mail**, como anexo, para o paciente ou um familiar.

## 1.3 Requisitos gerais e arquiteturais (seção 2.1)

| Requisito | O que diz |
|---|---|
| Multi-linguagem no backend | No mínimo **três serviços/APIs autônomos** em linguagens diferentes |
| Persistência dual | **Servidor central:** banco relacional ou NoSQL de livre escolha, para consolidar prontuários e auditorias. **Cliente:** banco **local embarcado**, para as gravações offline |
| Ambiente de implantação | Execução **obrigatória na VM da Univates**. Não é necessário usar contêineres |
| Segurança e autenticação | **Todas as rotas, exceto a de login**, exigem autenticação com as credenciais do profissional de saúde (**CRM, COREN ou ID de Socorrista**) |
| Auditoria e logs de acesso (LGPD) | **Todos os serviços** têm um middleware/interceptor que registra, a cada requisição HTTP: **data/hora, IP do cliente, ID do profissional autenticado, método HTTP, rota, status code e tempo de processamento (ms)** |
| Interface com simulador de rede | O cliente tem interface para preencher a ficha de atendimento e um botão/chave **"Simular Conectividade (Online / Offline)"**, para executar o roteiro de testes em sala |
| Interface administrativa | A aplicação do servidor tem interface para **autenticar, ver os registros de atendimento e ver os cadastros de apoio**. Inserções podem ser feitas **direto no banco** |

## 1.4 Padrões de projeto sugeridos (seção 2.2)

1. **Repository:** isolar a camada de dados local (banco embarcado) e remota (API REST) das regras da interface.
2. **Strategy:** encapsular os algoritmos de resolução de concorrência e mesclagem (*merge*) das fichas na sincronização (ex.: priorizar o dado com o carimbo de data/hora mais recente do profissional).
3. **Observer:** monitorar o simulador de rede para disparar sozinho a fila de sincronização pendente (**Outbox**) quando a conexão voltar.
4. **Outros 3 padrões de livre escolha.**

## 1.5 Endpoints sugeridos (seção 2.3)

| Método | Endpoint | Autenticada | Ação |
|---|---|---|---|
| POST | `/auth/login` | Não | Autentica o profissional e retorna um token válido |
| GET | `/medicamento` | Sim | Obtém todos os medicamentos |
| GET | `/prontuario` | Sim | Obtém todos os prontuários de todas as pessoas |
| GET | `/prontuario/{id}` | Sim | Obtém o prontuário de uma pessoa |
| POST | `/pessoa` | Sim | Cadastra nova pessoa |
| GET | `/atendimento/{id}` | Sim | Obtém todos os atendimentos de uma pessoa |
| POST | `/prontuario` | Sim | Cadastra um prontuário |
| POST | `/atendimento` | Sim | Cadastra um atendimento |
| POST | `/log` | Sim | Envia os logs locais do período offline |

"Contemplar rotas para envio do e-mail e geração do documento PDF, dentre outras rotas conforme a necessidade."

## 1.6 Checklist de entrega

No dia da apresentação, entregar e apresentar:

1. **Modelo de arquitetura:** desenho + tecnologias utilizadas → [04-arquitetura.md](04-arquitetura.md)
2. **Documentação das APIs, seus endpoints e modelagem dos bancos de dados** → [06-api.md](06-api.md) e [05-modelo-de-dados.md](05-modelo-de-dados.md)
3. **Roteiro de testes** → [11-roteiro-de-testes.md](11-roteiro-de-testes.md)

## 1.7 Roteiro de testes do enunciado

1. Portal: autenticar
2. Portal: listar cadastros
3. Portal: listar prontuários
4. Portal: listar atendimentos
5. Cliente: autenticar
6. Cliente: sincronizar dados a partir do portal (receber dados)
7. Cliente: online, registrar um atendimento
8. Portal: listar atendimentos e ver o atendimento registrado
9. Portal: inserir novos medicamentos via banco de dados
10. Portal: listar atendimentos
11. Cliente: sincronizar dados a partir do portal (receber dados)
12. Cliente: offline, registrar ocorrência de socorro: criar pessoa, criar prontuário, registrar atendimento
13. Portal: listar prontuários e atendimentos: o cadastro novo **não** deve aparecer
14. Cliente: online, sincronizar dados para o portal
15. Portal: listar prontuários e atendimentos: o cadastro novo **deve** aparecer
16. Demonstrar a geração da Ficha de Atendimento
17. Demonstrar o e-mail enviado com a Ficha de Atendimento em anexo

## 1.8 Requisitos técnicos

- Banco de dados: livre escolha.
- Linguagens de programação: livre escolha.
- Deve ser usada mais de uma linguagem de programação nos serviços (APIs).
- A solução deve ser executada na VM da Univates.
- As rotas devem ser autenticadas.
- Devem ser gerados logs dos acessos de cada rota.
- Deve ser possível validar as rotas via Postman, Insomnia ou similar.
- A aplicação deve ter interface gráfica para validar as ações do roteiro de testes.

## 1.9 Informações passadas pelo professor em aula

Relatadas pelo aluno durante o planejamento:

- O **login offline deve funcionar** no cliente, mesmo não estando no roteiro de testes, e a sessão deve ser mantida.
- O cliente pode ser **app de celular, desktop ou web**, à escolha do aluno.
- A ficha **não precisa ser igual à da vida real**: o foco é a arquitetura funcionar bem.
- O PDF do enunciado é um **guia**: podem existir rotas e funcionalidades a mais.

---

## 1.10 Ambiguidades e como interpretamos

| # | Ponto | O que o enunciado diz | Nossa interpretação | Ref. |
|---|---|---|---|---|
| A1 | Quantidade de linguagens | Seções 1 e 2.1: "no mínimo três". Requisitos técnicos: "mais de uma" | Três linguagens: atende às duas frases | D-02 |
| A2 | Tipo de cliente | O contexto fala em "dispositivo móvel"; o requisito, em "aplicação cliente com interface gráfica" | O professor liberou qualquer tipo. Escolhemos desktop (Windows) | D-01 |
| A3 | "Execução obrigatória na VM" | Não diz se vale para o cliente | Backend, banco e portal rodam na VM; o cliente roda no dispositivo do profissional, como no cenário real | D-01, D-03 |
| A4 | Contêineres | "Não é necessário utilizar contêineres" | É opcional, não proibido. Usamos Docker Compose | D-03 |
| A5 | `{id}` em `/prontuario/{id}` e `/atendimento/{id}` | "o prontuário de uma pessoa" / "todos os atendimentos de uma pessoa" | O `{id}` é o **da pessoa** nas duas. O detalhe de um atendimento ganhou uma rota própria | D-18 |
| A6 | Rotas que faltam | Não há rota para listar pessoas nem profissionais, mas o portal precisa "listar cadastros" | Rotas extras (`GET /pessoa`, `GET /profissional` etc.) | D-18 |
| A7 | Passo 10 | "Portal: listar atendimentos" logo depois de inserir medicamentos no banco | Provavelmente era "listar medicamentos". O portal mostra as duas listas, para cobrir as duas leituras | [11](11-roteiro-de-testes.md) |
| A8 | Padrões de projeto | O título diz "sugestão", mas o item 4 pede "outros 3 de livre escolha" | Seis padrões implementados | D-27 |
| A9 | PDF e e-mail | "A plataforma deve possibilitar…" sem dizer onde | Disponíveis no portal e no cliente; o PDF é gerado sempre no servidor | D-15, D-16 |
| A10 | Conflitos | Exigidos nos requisitos, mas ausentes do roteiro | Demonstração extra, com duas "ambulâncias" no mesmo PC | D-10, D-29 |
| A11 | "Consultar regras de segurança clínica" | Citado no contexto, sem virar requisito | Fora do escopo (foco na arquitetura) | D-20 |
| A12 | Login offline | Não está no roteiro | O professor pediu em aula: obrigatório | D-07 |
| A13 | Ficha de Atendimento | Usado como "o registro" e como "o PDF" | A ficha **é** o atendimento; o PDF é a versão impressa dela | [09](09-ficha-e-dominio.md) |

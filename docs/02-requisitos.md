# 2. Escopo e requisitos

O que o sistema faz, numerado para poder ser citado e conferido. Cada requisito indica de onde veio: do **enunciado** ([01](01-enunciado.md)) ou de uma **decisão** nossa ([03](03-decisoes.md)).

---

## 2.1 Objetivo

Permitir que profissionais de atendimento pré-hospitalar registrem ocorrências (paciente, prontuário e ficha de atendimento) **mesmo sem conexão**, e que esses registros cheguem ao servidor central **sem duplicar, sem perder a origem e resolvendo conflitos** quando a conexão volta. Os registros consolidados podem ser consultados no portal administrativo, exportados em PDF e enviados por e-mail.

## 2.2 Atores

| Ator | Quem é | Usa |
|---|---|---|
| Profissional operacional | Médico (CRM), enfermagem (COREN) ou socorrista (ID de Socorrista) em campo | App cliente |
| Administrador | Profissional com perfil `ADMIN`, ex.: médico regulador da central | Portal Admin (e o app cliente, se quiser) |
| Avaliador | Professor, testando as rotas | Postman / Insomnia |
| Destinatário | Paciente ou familiar | Recebe a ficha por e-mail |

---

## 2.3 Requisitos funcionais

### Autenticação e sessão

| ID | Requisito | Origem |
|---|---|---|
| RF-01 | O profissional entra com tipo de registro (CRM, COREN ou ID de Socorrista), registro e senha, e recebe um token | Enunciado |
| RF-02 | Todas as rotas exigem autenticação, exceto a de login | Enunciado |
| RF-03 | O cliente permite **login offline** para quem já entrou online ao menos uma vez no aparelho | Professor em aula, D-07 |
| RF-04 | O cliente **mantém a sessão** entre aberturas do app, até sair ou expirar | Professor em aula, D-07 |
| RF-05 | Senha errada 5 vezes seguidas bloqueia o login por 5 minutos (online e offline) | D-07 |

### App cliente

| ID | Requisito | Origem |
|---|---|---|
| RF-06 | Cadastrar pessoa, online ou offline | Enunciado (passo 12) |
| RF-07 | Cadastrar o prontuário da pessoa (um por pessoa), online ou offline | Enunciado (passo 12) |
| RF-08 | Registrar atendimento com sinais vitais, Glasgow, triagem (Manchester ou START) e medicamentos administrados, online ou offline | Enunciado |
| RF-09 | Chave **"Simular Conectividade (Online / Offline)"**. Em Offline, nada é enviado ao servidor | Enunciado, D-14 |
| RF-10 | Fila de pendentes, enviada sozinha quando a chave volta para Online e também por um botão "Sincronizar" | Enunciado (Observer/Outbox) |
| RF-11 | Receber dados do servidor (medicamentos, pessoas, prontuários, atendimentos), incluindo os inseridos direto no banco | Enunciado (passos 6, 9 e 11) |
| RF-12 | Consultar offline os pacientes, prontuários e atendimentos guardados no aparelho | Enunciado (offline-first) |
| RF-13 | Registrar as ações feitas no aparelho e enviá-las ao servidor (`POST /log`) | Enunciado |
| RF-14 | Mostrar a fila de pendentes (status, tentativas, erros) e os logs locais | D-11 |
| RF-15 | Baixar o PDF e pedir o envio por e-mail de um atendimento sincronizado; o pedido feito offline entra na fila | Enunciado, D-15, D-16 |
| RF-16 | Rodar duas instâncias no mesmo PC, como dispositivos diferentes ("Ambulância 01" e "02") | D-29 |

### Servidor

| ID | Requisito | Origem |
|---|---|---|
| RF-17 | **Idempotência:** reenviar um cadastro, um log ou um pedido de e-mail não duplica nada | Enunciado, D-09 |
| RF-18 | **Tratamento de conflitos:** unificar pessoa com CPF repetido e prontuário repetido, com estratégia configurável, e registrar cada conflito | Enunciado, D-10 |
| RF-19 | **Rastreabilidade:** todo registro clínico guarda quem criou, quando, de qual dispositivo, em que modo, quem sincronizou e quando chegou | Enunciado, D-25 |
| RF-20 | Gerar a Ficha de Atendimento em PDF | Enunciado |
| RF-21 | Enviar a ficha em PDF por e-mail, como anexo, ao paciente, a um familiar ou a outro endereço, chegando numa caixa real | Enunciado, D-16 |

### Portal Admin

| ID | Requisito | Origem |
|---|---|---|
| RF-22 | Login (só perfil `ADMIN`) | Enunciado, D-17 |
| RF-23 | Listar cadastros de apoio: pessoas, profissionais e medicamentos | Enunciado (passo 2) |
| RF-24 | Listar prontuários e ver um prontuário com os atendimentos da pessoa | Enunciado (passo 3) |
| RF-25 | Listar atendimentos e ver o detalhe, com PDF e envio por e-mail | Enunciado (passos 4, 8, 16, 17) |
| RF-26 | Ver logs de acesso, logs dos clientes, conflitos e e-mails enviados | D-17 |
| RF-27 | Ver a documentação interativa da API (Swagger UI) | D-19 |
| RF-28 | Cadastros de apoio (medicamentos, profissionais) inseridos direto no banco | Enunciado (passo 9) |

---

## 2.4 Requisitos não funcionais

| ID | Requisito | Origem |
|---|---|---|
| RNF-01 | Pelo menos três serviços backend autônomos em linguagens diferentes: Java, TypeScript e Python | Enunciado, D-02 |
| RNF-02 | Persistência dual: PostgreSQL central e SQLite embarcado no cliente | Enunciado, D-03 |
| RNF-03 | Backend, banco e portal executando na VM da Univates (Ubuntu), com Docker Compose | Enunciado, D-03 |
| RNF-04 | Middleware de log de acesso em todos os serviços, com data/hora, IP, ID do profissional, método, rota, status e tempo (ms) | Enunciado, D-04 |
| RNF-05 | Rotas testáveis via Postman/Insomnia (coleção entregue) | Enunciado, D-28 |
| RNF-06 | Seis padrões de projeto: Repository, Strategy, Observer, Command, Adapter, Builder | Enunciado, D-27 |
| RNF-07 | Senhas com hash (bcrypt/scrypt), tokens assinados (RS256), banco fechado para a internet, segredos fora do Git | D-06, D-30 |
| RNF-08 | Logs de auditoria imutáveis | D-04 |
| RNF-09 | Documentação: arquitetura, APIs, modelagem dos dois bancos e roteiro de testes | Enunciado |
| RNF-10 | Cliente instalável no Windows (`.exe`) | D-01, D-28 |
| RNF-11 | Datas em UTC, mostradas no horário de Brasília; interface em português | D-23 |
| RNF-12 | Testes automatizados nas partes críticas | D-28 |

---

## 2.5 Fora do escopo

| Item | Por quê |
|---|---|
| Editar ou apagar pessoa, prontuário e atendimento | Não é pedido; aumentaria muito a complexidade (D-08) |
| Alertas clínicos (dose, alergia) e o assistente do START | O foco é a arquitetura (D-20) |
| Cadastros pelo portal | O enunciado permite inserir direto no banco (D-17) |
| App de celular | O professor liberou qualquer tipo de cliente (D-01) |
| HTTPS | Depende de a VM ter domínio; fica como melhoria opcional (D-24) |
| Criptografia do banco local e minimização de dados no aparelho | Registrado como limitação ([8.11](08-seguranca-e-auditoria.md#811-lgpd-o-que-fazemos-e-o-que-fica-de-fora)) |
| Assinatura digital do `.exe` | O certificado é pago; o aviso do Windows é contornável |

---

## 2.6 Rastreabilidade: roteiro de testes × requisitos

| Passo do roteiro | Requisitos verificados |
|---|---|
| 1. Portal: autenticar | RF-01, RF-22 |
| 2. Portal: listar cadastros | RF-23 |
| 3. Portal: listar prontuários | RF-24 |
| 4. Portal: listar atendimentos | RF-25 |
| 5. Cliente: autenticar | RF-01, RF-04 |
| 6. Cliente: receber dados | RF-11 |
| 7. Cliente online: registrar atendimento | RF-08, RF-10, RF-17, RF-19 |
| 8. Portal: ver o atendimento registrado | RF-25 |
| 9. Inserir medicamentos via banco | RF-28 |
| 10. Portal: listar atendimentos (e medicamentos) | RF-23, RF-25 |
| 11. Cliente: receber dados | RF-11 |
| 12. Cliente offline: pessoa, prontuário e atendimento | RF-06, RF-07, RF-08, RF-09, RF-12 |
| 13. Portal: o cadastro novo **não** aparece | RF-09 |
| 14. Cliente online: sincronizar | RF-10, RF-13, RF-17 |
| 15. Portal: o cadastro novo aparece | RF-19, RF-24, RF-25 |
| 16. Gerar a ficha em PDF | RF-15, RF-20 |
| 17. E-mail com a ficha em anexo | RF-15, RF-21 |
| Extra: duas ambulâncias, mesmo paciente | RF-16, RF-18 |
| Extra: login offline e sessão mantida | RF-03, RF-04, RF-05 |
| Extra: Postman sem token, reenvio, logs | RF-02, RF-17, RNF-04, RNF-05 |

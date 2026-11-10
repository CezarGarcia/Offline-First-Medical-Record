# MedicalField · Guia de demonstração

Sequência da demonstração: preparação do ambiente, arquitetura, padrões de projeto, roteiro de testes do enunciado e cenários complementares. As imagens estão em [`diagramas/`](diagramas).

Convenções: `IP-DA-VM` é o endereço da VM; `<DEMO_SENHA>` é a senha das contas de demonstração, definida na instalação.

---

## 1. Aplicativo cliente

Instaladores disponíveis em <https://github.com/CezarGarcia/offline-first-medical-record/releases>. Um único aplicativo atende as duas ambulâncias: cada uma é uma instância com banco de dados próprio.

| Sistema | Arquivo | Instâncias |
|---|---|---|
| Windows | `MedicalField-Setup-1.0.0.exe` | Atalhos **MedicalField** (Ambulância 01) e **MedicalField (Ambulância 02)** |
| Linux | `MedicalField-1.0.0.AppImage` | Um comando por instância, cada um em um terminal |

No Linux:

```bash
chmod +x MedicalField-1.0.0.AppImage
```

```bash
APPIMAGE_EXTRACT_AND_RUN=1 ./MedicalField-1.0.0.AppImage --no-sandbox
```

```bash
APPIMAGE_EXTRACT_AND_RUN=1 ./MedicalField-1.0.0.AppImage --no-sandbox --perfil=ambulancia-02
```

Configuração inicial de cada instância: servidor `http://IP-DA-VM` e nome do dispositivo (`Ambulância 01` ou `Ambulância 02`), seguidos de um login online (Dra. Ana, CRM `12345-RS`, na 01; Enf. Bruno, COREN `543210-RS`, na 02).

---

## 2. Servidor na VM

```bash
ssh univates@IP-DA-VM
```

Instalação completa, a partir de uma VM sem o projeto (instala o Docker, o código, o banco e os dados de demonstração):

```bash
curl -fsSL https://raw.githubusercontent.com/CezarGarcia/offline-first-medical-record/main/infra/scripts/instalar.sh | bash
```

Ambiente já instalado: retorno ao estado inicial do roteiro e verificação.

```bash
cd ~/offline-first-medical-record
```

```bash
./infra/scripts/zerar.sh
```

```bash
./infra/scripts/verificar.sh
```

Acesso ao banco de dados (usado no passo 9):

```bash
cd ~/offline-first-medical-record/infra && sudo docker compose exec db psql -U postgres -d medicalfield
```

---

## 3. Arquitetura

Diagramas `01-arquitetura.png` e `09-rede-e-portas.png`.

- Aplicativo desktop **offline-first** (Electron + SQLite): grava localmente e sincroniza com o servidor.
- Três microsserviços em três linguagens: **ms-auth** (TypeScript), **ms-clinico** (Java) e **ms-docs** (Python).
- **Nginx** como proxy reverso e API Gateway: a única porta pública (80).
- **PostgreSQL** com um schema e um usuário por serviço.

---

## 4. Padrões de projeto

Caminhos relativos à raiz do repositório.

| Padrão | Origem | Como foi aplicado | Onde está implementado | Pontos do código |
|---|---|---|---|---|
| **Repository** | Enunciado | O acesso ao banco fica concentrado em classes próprias; telas e regras de negócio não conhecem a origem dos dados | `apps/cliente/src/main/nucleo/repositorios/` (um repositório por tabela); `servicos/ms-clinico/.../pessoa/RepositorioPessoas.java`; `servicos/ms-docs/ms_docs/envios/repositorio.py` | Todo o SQL está nas classes `Repositorio*`; o restante do código chama métodos como `buscar()` e `gravarDoServidor()` |
| **Strategy** | Enunciado | A regra de resolução de conflitos é intercambiável: "o mais recente vence" ou "o servidor vence", definida por configuração | `servicos/ms-clinico/.../unificacao/`: `EstrategiaDeMesclagem.java`, `MaisRecenteVence.java`, `ServidorVence.java` | Interface com o método `decidir(carimboDoExistente, carimboDoRecebido)`; o `Mesclador.java` aplica a estratégia campo a campo; a seleção ocorre em `config/ConfiguracaoGeral.java` (`ESTRATEGIA_CONFLITO`) |
| **Observer** | Enunciado | A chave Online/Offline notifica os componentes inscritos; ao retornar a conexão, a fila de envio é processada automaticamente | `apps/cliente/src/main/nucleo/conectividade.ts` (`EstadoConectividade`) | `mudar()` notifica os inscritos; `assinar()` registra um inscrito. Inscritos: `sincronizacao.ts` (sincroniza), `http.ts` (cancela requisições ao ficar offline) e `nucleo.ts` (persiste o estado e atualiza as telas) |
| **Command** | Escolhido | Cada item da fila de envio é um objeto que encapsula a requisição e o tratamento da resposta | `apps/cliente/src/main/nucleo/comandos.ts` | Interface `Comando` (`requisicao()`, `aplicar()`, `aoFalhar()`, `descrever()`) e as classes `CriarPessoa`, `CriarProntuario`, `CriarAtendimento` e `EnviarEmail`; o motor de sincronização obtém o comando por `comandoPara(item)` |
| **Adapter** | Escolhido | O envio de e-mail é feito por uma interface própria; o SMTP do Gmail é uma das implementações | `servicos/ms-docs/ms_docs/correio/`: `envio.py` (`EnvioDeEmail`, `EnvioDesativado`) e `smtp.py` (`EnvioPorSmtp`) | As rotas chamam apenas `enviar(mensagem)`; `EnvioPorSmtp` adapta o `smtplib`; a implementação é escolhida em `ms_docs/__main__.py` conforme a configuração de SMTP |
| **Builder** | Escolhido | O PDF da ficha de atendimento é construído por etapas, em ordem definida | `servicos/ms-docs/ms_docs/ficha/construtor.py` | `FichaPdfBuilder` com um método por seção (`cabecalho()`, `paciente()`...) e `construir()` ao final; `MontadorDaFicha.montar()` atua como diretor |

Padrões arquiteturais:

| Padrão | Onde está implementado |
|---|---|
| **API Gateway** | Nginx: `infra/nginx/conf.d/medicalfield.conf`, uma regra `location /api/...` por serviço |
| **Outbox** | Fila de envio do aplicativo: tabela `outbox` (`apps/cliente/src/main/nucleo/migracoes.ts`) e `repositorios/outbox.ts` |
| **Database per Service** | Um schema e um usuário por serviço: `infra/postgres/init/01-estrutura.sh` |
| **Offline-First** | Registro e item da fila gravados na mesma transação: `apps/cliente/src/main/nucleo/registros.ts` |

---

## 5. Roteiro de testes

| # | Onde | Ação | Resultado esperado |
|---|---|---|---|
| 1 | Portal `http://IP-DA-VM/` | Login com **Dr. Ricardo** (CRM `10001-RS`) | Acesso ao portal; perfil operacional recusado ("Acesso restrito a administradores") |
| 2 | Portal | Pessoas, Profissionais e Medicamentos | Cadastros de demonstração |
| 3 | Portal | Prontuários | 2 prontuários |
| 4 | Portal | Atendimentos | 2 atendimentos |
| 5 | Ambulância 01 | Chave **Online**; login com **Dra. Ana** | Profissional e modo Online na barra superior |
| 6 | Ambulância 01 | **Sincronizar** | Pacientes e medicamentos disponíveis no aplicativo |
| 7 | Ambulância 01 | Nova ocorrência → João da Silva → Selecionar → Usar este prontuário → Salvar | Atendimento com o status **Sincronizado** |
| 8 | Portal | Atendimentos → Atualizar | Novo atendimento no topo, modo **Online** |
| 9 | Banco de dados | Inserção do medicamento (SQL abaixo) | `INSERT 0 1` |
| 10 | Portal | Medicamentos e Atendimentos | **Cetoprofeno** na lista de medicamentos |
| 11 | Ambulância 01 | **Sincronizar** | Cetoprofeno disponível no formulário de atendimento |
| 12 | Ambulância 01 | Chave **Offline** → nova pessoa **Maria Oliveira** (CPF `935.411.347-80`, com e-mail do familiar) → prontuário → atendimento com Cetoprofeno | **3 pendentes** na fila de sincronização |
| 13 | Portal | Prontuários e Atendimentos → Atualizar | Maria Oliveira **não** aparece |
| 14 | Ambulância 01 | Chave **Online** | Fila esvaziada automaticamente |
| 15 | Portal | Prontuários e Atendimentos → Atualizar | Maria Oliveira aparece; atendimento em modo **Offline** |
| 16 | Portal | Atendimento de Maria Oliveira → **Baixar PDF** | Ficha de atendimento em PDF |
| 17 | Portal | **Enviar por e-mail** → Familiar | E-mail recebido com a ficha em PDF anexada |

Passo 9:

```sql
INSERT INTO medicamento (nome, apresentacao, unidade_padrao) VALUES ('Cetoprofeno', 'Frasco-ampola 100 mg', 'MG');
```

```sql
SELECT nome, criado_em FROM medicamento ORDER BY criado_em DESC LIMIT 3;
```

---

## 6. Cenários complementares

**Login offline sem acesso prévio ao dispositivo.** Sair → chave **Offline** → **Carlos**, ID de Socorrista `SOC-0001`. O login é validado pela réplica de credenciais recebida na sincronização.

**Conflito entre ambulâncias.** As duas instâncias em Offline; a mesma pessoa (CPF `286.255.878-87`) cadastrada em cada uma, com telefones diferentes; a Ambulância 01 volta a Online, depois a 02. Resultado: um único cadastro, com o telefone mais recente, e o registro na página **Conflitos** do portal (diagrama `06-conflito.png`).

**Auditoria imutável.** Consulta dos logs de acesso e tentativa de exclusão:

```sql
SELECT data_hora, servico, metodo, rota, status_code, tempo_ms FROM log_acesso ORDER BY data_hora DESC LIMIT 10;
```

```sql
DELETE FROM log_acesso;
```

Resultado esperado: erro "Registros de auditoria não podem ser alterados nem apagados".

**Indisponibilidade de um serviço.** Com o ms-docs parado, PDF e e-mail respondem `503` e o restante do sistema segue operando.

```bash
cd ~/offline-first-medical-record/infra && sudo docker compose stop ms-docs
```

```bash
sudo docker compose start ms-docs
```

**Estado e logs dos serviços:**

```bash
sudo docker compose ps
```

```bash
sudo docker compose logs --tail 30 ms-clinico
```

**Troca da estratégia de conflito (Strategy).** Em `infra/.env`, `ESTRATEGIA_CONFLITO=SERVIDOR_VENCE` (`nano .env`; salvar com `Ctrl+O`, `Enter`, `Ctrl+X`), seguido de:

```bash
sudo docker compose up -d ms-clinico
```

**Testes pelo Postman.** Coleção e ambiente em `postman/`; variáveis `baseUrl` = `http://IP-DA-VM` e `senha` = `<DEMO_SENHA>`; execução da pasta **1. Roteiro do Postman**.

---

## 7. Consultas no banco de dados

| Comando | Função |
|---|---|
| `\dt` | Lista as tabelas |
| `\d atendimento` | Estrutura de uma tabela |
| `\x` | Exibição de uma linha por bloco |
| `SET TIME ZONE 'America/Sao_Paulo';` | Horários de Brasília |
| `\q` | Encerra o psql |

```sql
SELECT p.nome, a.data_hora, a.modo_registro, a.dispositivo_nome
FROM atendimento a JOIN prontuario pr ON pr.id = a.prontuario_id JOIN pessoa p ON p.id = pr.pessoa_id
ORDER BY a.data_hora DESC LIMIT 5;
```

---

## 8. Solução de problemas

| Situação | Ação |
|---|---|
| Diagnóstico geral do ambiente | `./infra/scripts/verificar.sh` |
| Login das contas de demonstração recusado | `./infra/scripts/instalar.sh` (regrava as senhas; os dados são mantidos) |
| Registros de execuções anteriores | `./infra/scripts/zerar.sh` |
| `docker compose`: `no configuration file provided` | Executar a partir de `~/offline-first-medical-record/infra` |
| `permission denied ... docker.sock` | Executar o comando com `sudo` |
| Aplicativo: "Faça login online para sincronizar" | Botão **Entrar online** na barra superior |
| Aplicativo no Linux encerra ao abrir | Incluir a opção `--no-sandbox` |

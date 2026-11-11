# Roteiro da apresentação (cola rápida)

Só o que se usa na hora. A explicação completa do sistema está no [`GUIA-DE-DEMONSTRACAO.md`](GUIA-DE-DEMONSTRACAO.md).

**Ir direto para:** [VM do zero](#1-vm-do-zero-instalar-tudo) · [VM já instalada](#2-vm-já-instalada) · [Banco](#3-banco-de-dados) · [Docker](#4-docker) · [App](#5-app-no-notebook) · [Contas](#6-contas) · [Padrões de projeto](#7-padrões-de-projeto) · [17 passos](#8-os-17-passos) · [Extras](#9-extras) · [Deu errado](#10-deu-errado)

---

## 1. VM do zero (instalar tudo)

Entrar na VM:

```bash
ssh univates@IP-DA-VM
```

**Um comando só:** instala o Docker e o Git, clona o projeto em `~/offline-first-medical-record`, sobe tudo e carrega os dados de demonstração. Pergunta a `DEMO_SENHA` e o Gmail.

```bash
curl -fsSL https://raw.githubusercontent.com/CezarGarcia/offline-first-medical-record/main/infra/scripts/instalar.sh | bash
```

**Ou, passo a passo, com o clone à mão** (se a VM não tiver o Git: `sudo apt install -y git`):

```bash
git clone https://github.com/CezarGarcia/offline-first-medical-record.git ~/offline-first-medical-record
```

```bash
cd ~/offline-first-medical-record
```

```bash
./infra/scripts/instalar.sh
```

Termina em **"Tudo pronto"**. O portal fica em `http://IP-DA-VM/`.

---

## 2. VM já instalada

Sempre começar entrando na pasta do projeto:

```bash
cd ~/offline-first-medical-record
```

| Quero | Comando |
|---|---|
| Pegar a versão nova do código | `./infra/scripts/atualizar.sh` |
| **Voltar ao começo do roteiro** (apaga os ensaios; digitar `ZERAR`) | `./infra/scripts/zerar.sh` |
| Conferir se está tudo certo | `./infra/scripts/verificar.sh` |
| Regravar as senhas das contas (não apaga dados) | `./infra/scripts/instalar.sh` |

Os scripts vão **sem** `sudo`. Comandos `docker` à mão vão **com** `sudo`.

---

## 3. Banco de dados

**Entrar no banco** (deixe aberto num segundo terminal):

```bash
cd ~/offline-first-medical-record/infra && sudo docker compose exec db psql -U postgres -d medicalfield
```

O prompt vira `medicalfield=#`. Sair: `\q`.

**Passo 9: inserir o medicamento.** Responde `INSERT 0 1`.

```sql
INSERT INTO clinico.medicamento (nome, apresentacao, unidade_padrao) VALUES ('Cetoprofeno', 'Frasco-ampola 100 mg', 'MG');
```

**Mostrar que entrou:**

```sql
SELECT nome, apresentacao, criado_em FROM clinico.medicamento ORDER BY criado_em DESC LIMIT 3;
```

**Auditoria: ver os acessos:**

```sql
SELECT data_hora, servico, metodo, rota, status_code, tempo_ms FROM auditoria.log_acesso ORDER BY data_hora DESC LIMIT 10;
```

**Auditoria: tentar apagar.** Tem de dar erro: "Registros de auditoria não podem ser alterados nem apagados".

```sql
DELETE FROM auditoria.log_acesso;
```

**Últimos atendimentos:**

```sql
SELECT p.nome, a.data_hora, a.modo_registro, a.dispositivo_nome FROM clinico.atendimento a JOIN clinico.prontuario pr ON pr.id = a.prontuario_id JOIN clinico.pessoa p ON p.id = pr.pessoa_id ORDER BY a.data_hora DESC LIMIT 5;
```

| Atalho do psql | Para |
|---|---|
| `\dn` | Listar os schemas |
| `\dt clinico.*` | Tabelas de um schema (`auth`, `clinico`, `documentos`, `auditoria`) |
| `\d clinico.atendimento` | Colunas de uma tabela |
| `\x` | Ver uma linha "em pé" (liga e desliga) |
| `SET TIME ZONE 'America/Sao_Paulo';` | Horários de Brasília |

---

## 4. Docker

Sempre na pasta `infra/`:

```bash
cd ~/offline-first-medical-record/infra
```

| Quero | Comando |
|---|---|
| Ver o que está no ar | `sudo docker compose ps` |
| Ver os logs de um serviço | `sudo docker compose logs --tail 50 ms-clinico` |
| **Derrubar o ms-docs** (extra do serviço fora do ar) | `sudo docker compose stop ms-docs` |
| **Religar o ms-docs** | `sudo docker compose start ms-docs` |
| Reiniciar um serviço | `sudo docker compose restart ms-auth` |
| Testar uma rota (responde `401`) | `curl -i http://localhost/api/pessoa` |

Serviços: `db`, `ms-auth`, `ms-clinico`, `ms-docs`, `nginx`.

**Trocar a estratégia de conflito:** abrir o `.env`, mudar a linha `ESTRATEGIA_CONFLITO=SERVIDOR_VENCE` (salvar: `Ctrl+O`, `Enter`, `Ctrl+X`) e aplicar. Para voltar, `MAIS_RECENTE_VENCE`.

```bash
nano .env
```

```bash
sudo docker compose up -d ms-clinico
```

---

## 5. App no notebook

**Baixar:** <https://github.com/CezarGarcia/offline-first-medical-record/releases>

- **Windows:** `MedicalField-Setup-1.0.0.exe` ("Mais informações" → "Executar assim mesmo"). Atalhos **MedicalField** (Ambulância 01) e **MedicalField (Ambulância 02)**.
- **Linux:** `MedicalField-1.0.0.AppImage`, com os comandos abaixo.

```bash
chmod +x MedicalField-1.0.0.AppImage
```

Ambulância 01:

```bash
APPIMAGE_EXTRACT_AND_RUN=1 ./MedicalField-1.0.0.AppImage --no-sandbox
```

Ambulância 02 (em outro terminal):

```bash
APPIMAGE_EXTRACT_AND_RUN=1 ./MedicalField-1.0.0.AppImage --no-sandbox --perfil=ambulancia-02
```

**Configurar:** servidor `http://IP-DA-VM`, nome `Ambulância 01` (ou `02`), chave em **Online**, entrar uma vez online.

**Apagar os dados do app** (com o app fechado), depois do `zerar.sh`:

- Windows: rodar `apps/cliente/scripts/apagar-dados-locais.cmd` e digitar `APAGAR`.
- Linux:

```bash
rm -rf ~/.config/MedicalField
```

---

## 6. Contas

Todas com a `<DEMO_SENHA>`.

| Quem | Tipo | Registro | Onde |
|---|---|---|---|
| Dr. Ricardo (ADMIN) | CRM | `10001-RS` | Portal |
| Dra. Ana | CRM | `12345-RS` | App, Ambulância 01 |
| Enf. Bruno | COREN | `543210-RS` | App, Ambulância 02 |
| Carlos | ID de Socorrista | `SOC-0001` | Login offline sem nunca ter entrado |

**CPFs:** Maria Oliveira (passo 12) `935.411.347-80` · conflito `286.255.878-87` · reserva `390.533.447-05`, `718.263.954-82`, `604.872.139-04`

---

## 7. Padrões de projeto

Diagrama `diagramas/10-padroes-de-projeto.png`. Os links abrem o arquivo no GitHub já na linha. Para achar pelo nome: no GitHub, tecla `t`; no VS Code, `Ctrl+P`.

| Padrão | Como foi usado | Abrir primeiro |
|---|---|---|
| **Repository** (enunciado) | Só os repositórios têm SQL; telas e regras pedem os dados sem saber de onde vêm | [`pessoas.ts`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/apps/cliente/src/main/nucleo/repositorios/pessoas.ts#L84) |
| **Strategy** (enunciado) | Regra de conflito trocável pelo `.env`: "mais recente vence" ou "servidor vence" | [`EstrategiaDeMesclagem.java`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/servicos/ms-clinico/src/main/java/br/univates/medicalfield/clinico/unificacao/EstrategiaDeMesclagem.java#L10) |
| **Observer** (enunciado) | A chave Online/Offline avisa os inscritos; voltou a rede, a fila sai sozinha | [`conectividade.ts`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/apps/cliente/src/main/nucleo/conectividade.ts#L12) |
| **Command** (escolhido) | Cada item da fila é um objeto que sabe montar a requisição e tratar a resposta | [`comandos.ts`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/apps/cliente/src/main/nucleo/comandos.ts#L27) |
| **Adapter** (escolhido) | O e-mail passa por uma interface própria; o Gmail (SMTP) é só uma implementação | [`envio.py`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/servicos/ms-docs/ms_docs/correio/envio.py#L26) |
| **Builder** (escolhido) | O PDF da ficha é montado seção por seção, numa ordem fixa | [`construtor.py`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/servicos/ms-docs/ms_docs/ficha/construtor.py#L48) |

### Repository

- App, um repositório por tabela: [`repositorios/`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/apps/cliente/src/main/nucleo/repositorios/) → [`RepositorioPessoas`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/apps/cliente/src/main/nucleo/repositorios/pessoas.ts#L84) (o SQL fica aqui dentro, ex.: [`linha 102`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/apps/cliente/src/main/nucleo/repositorios/pessoas.ts#L102))
- ms-clinico: [`RepositorioPessoas.java`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/servicos/ms-clinico/src/main/java/br/univates/medicalfield/clinico/pessoa/RepositorioPessoas.java#L21) (e os outros `Repositorio*` de cada pacote)
- ms-docs: [`RepositorioEnvios`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/servicos/ms-docs/ms_docs/envios/repositorio.py#L75)

### Strategy

- A interface, com um método só, `decidir(...)`: [`EstrategiaDeMesclagem.java`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/servicos/ms-clinico/src/main/java/br/univates/medicalfield/clinico/unificacao/EstrategiaDeMesclagem.java#L10)
- As duas regras: [`MaisRecenteVence.java`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/servicos/ms-clinico/src/main/java/br/univates/medicalfield/clinico/unificacao/MaisRecenteVence.java#L6) e [`ServidorVence.java`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/servicos/ms-clinico/src/main/java/br/univates/medicalfield/clinico/unificacao/ServidorVence.java#L6)
- Quem usa sem saber qual é: [`Mesclador.java, linha 66`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/servicos/ms-clinico/src/main/java/br/univates/medicalfield/clinico/unificacao/Mesclador.java#L66) (`estrategia.decidir(...)` para cada campo)
- Onde a regra é escolhida pelo `ESTRATEGIA_CONFLITO`: [`ConfiguracaoGeral.java, linha 21`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/servicos/ms-clinico/src/main/java/br/univates/medicalfield/clinico/config/ConfiguracaoGeral.java#L21)

### Observer

- O sujeito, `EstadoConectividade`: [`mudar()`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/apps/cliente/src/main/nucleo/conectividade.ts#L25) avisa todos; [`assinar()`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/apps/cliente/src/main/nucleo/conectividade.ts#L38) inscreve um
- Os três inscritos:
  - [`sincronizacao.ts, linha 61`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/apps/cliente/src/main/nucleo/sincronizacao.ts#L61): Online → sincroniza tudo
  - [`http.ts, linha 68`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/apps/cliente/src/main/nucleo/http.ts#L68): Offline → cancela o que está saindo
  - [`nucleo.ts, linha 148`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/apps/cliente/src/main/nucleo/nucleo.ts#L148): grava a posição e avisa as telas

### Command

- A interface `Comando` (`requisicao()`, `aplicar()`, `aoFalhar()`, `descrever()`): [`comandos.ts`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/apps/cliente/src/main/nucleo/comandos.ts#L27)
- Os comandos: [`CriarPessoa`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/apps/cliente/src/main/nucleo/comandos.ts#L51), [`CriarProntuario`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/apps/cliente/src/main/nucleo/comandos.ts#L80), [`CriarAtendimento`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/apps/cliente/src/main/nucleo/comandos.ts#L110), [`EnviarEmail`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/apps/cliente/src/main/nucleo/comandos.ts#L138)
- A fábrica que transforma o item da fila em comando: [`comandoPara()`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/apps/cliente/src/main/nucleo/comandos.ts#L162)
- O motor tratando todos do mesmo jeito: [`sincronizacao.ts, linha 170`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/apps/cliente/src/main/nucleo/sincronizacao.ts#L170)

### Adapter

- A interface `EnvioDeEmail` e o `EnvioDesativado`: [`envio.py`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/servicos/ms-docs/ms_docs/correio/envio.py#L26)
- O adaptador do `smtplib` (Gmail): [`smtp.py, EnvioPorSmtp`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/servicos/ms-docs/ms_docs/correio/smtp.py#L15)
- Onde a implementação é escolhida: [`__main__.py, linha 33`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/servicos/ms-docs/ms_docs/__main__.py#L33)
- Quem usa só chama `enviar(...)`: [`servico.py, linha 101`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/servicos/ms-docs/ms_docs/envios/servico.py#L101)

### Builder

- O builder, um método por seção e o `construir()`: [`FichaPdfBuilder`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/servicos/ms-docs/ms_docs/ficha/construtor.py#L48)
- O diretor, encadeando as seções na ordem: [`MontadorDaFicha.montar()`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/servicos/ms-docs/ms_docs/ficha/construtor.py#L228)

### Padrões de arquitetura (se perguntarem)

| Padrão | Onde mostrar |
|---|---|
| API Gateway | [`medicalfield.conf`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/infra/nginx/conf.d/medicalfield.conf#L33): uma regra `location` por serviço |
| Outbox | Tabela `outbox`: [`migracoes.ts, linha 112`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/apps/cliente/src/main/nucleo/migracoes.ts#L112); repositório: [`outbox.ts`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/apps/cliente/src/main/nucleo/repositorios/outbox.ts#L30) |
| Offline-First | Registro + item da fila + log na mesma transação: [`registros.ts, linha 179`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/apps/cliente/src/main/nucleo/registros.ts#L179) |
| Database per Service | Um usuário e um schema por serviço: [`01-estrutura.sh`](https://github.com/CezarGarcia/offline-first-medical-record/blob/main/infra/postgres/init/01-estrutura.sh#L19) |

---

## 8. Os 17 passos

| # | Onde | Fazer | Tem de aparecer |
|---|---|---|---|
| 1 | Portal | Dra. Ana (recusada) → **Dr. Ricardo** | "Acesso restrito a administradores"; depois entra |
| 2 | Portal | Pessoas, Profissionais, Medicamentos | Dados de demonstração |
| 3 | Portal | Prontuários | 2 |
| 4 | Portal | Atendimentos | 2 |
| 5 | App 01 | Chave **Online** → login **Dra. Ana** | Nome e "Online" na barra |
| 6 | App 01 | **Sincronizar** | Pacientes e medicamentos |
| 7 | App 01 | Nova ocorrência → João da Silva → Usar este prontuário → preencher → **Salvar** | Selo **Sincronizado** |
| 8 | Portal | Atendimentos → Atualizar | O novo no topo, modo **Online** |
| 9 | Banco | [INSERT do Cetoprofeno](#3-banco-de-dados) | `INSERT 0 1` |
| 10 | Portal | Medicamentos (e Atendimentos) | Cetoprofeno na lista |
| 11 | App 01 | **Sincronizar** | Cetoprofeno no formulário |
| 12 | App 01 | Chave **Offline** → nova pessoa Maria Oliveira (com e-mail do familiar) → prontuário → atendimento com Cetoprofeno | **3 pendentes** na Fila |
| 13 | Portal | Prontuários e Atendimentos → Atualizar | Maria **não** aparece |
| 14 | App 01 | Chave **Online** (só isso) | Fila esvazia sozinha |
| 15 | Portal | Prontuários e Atendimentos → Atualizar | Maria aparece, modo **Offline** |
| 16 | Portal | Atendimento da Maria → **Baixar PDF** | `ficha-atendimento-....pdf` |
| 17 | Portal | **Enviar por e-mail** → Familiar | Status **Enviado**; e-mail no Gmail com o PDF |

---

## 9. Extras

**Conflito (duas ambulâncias):** as duas em **Offline** → a mesma pessoa (CPF `286.255.878-87`) nas duas, com telefones diferentes → 01 em **Online**, depois 02 em **Online** → portal: uma pessoa só, dois atendimentos e a página **Conflitos**.

**Login offline:** **Sair** → chave **Offline** → **Carlos** (`SOC-0001`) → entra em modo offline.

**Sessão mantida:** fechar e abrir o app → continua logado.

**Serviço fora do ar:** [derrubar o ms-docs](#4-docker) → **Baixar PDF** dá `503`, o resto funciona → religar.

**Postman:** importar os dois arquivos de `postman/`, `baseUrl` = `http://IP-DA-VM`, `senha` = `<DEMO_SENHA>` → rodar a pasta **1. Roteiro do Postman**.

---

## 10. Deu errado

| Problema | Fazer |
|---|---|
| Não sei o que é | `./infra/scripts/verificar.sh` |
| Login das contas recusado | `./infra/scripts/instalar.sh` |
| Dados a mais de ensaio | `./infra/scripts/zerar.sh` (e apagar os dados do app) |
| Um serviço não responde | `sudo docker compose restart ms-clinico` (na pasta `infra/`) |
| `no configuration file provided` | Faltou `cd ~/offline-first-medical-record/infra` |
| `permission denied ... docker.sock` | Faltou o `sudo` |
| `psql: command not found` | Usar o do container ([seção 3](#3-banco-de-dados)) |
| App: "Faça login online para sincronizar" | Botão **Entrar online** na barra |
| E-mail não chegou | Ver o spam; portal → **E-mails enviados** mostra o erro |
| App no Linux fecha ao abrir | Faltou o `--no-sandbox` |

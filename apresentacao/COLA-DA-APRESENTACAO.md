# Cola da apresentação

O essencial, na ordem do dia. O detalhe de cada passo está no [`ROTEIRO-DA-APRESENTACAO.md`](ROTEIRO-DA-APRESENTACAO.md); as imagens, em [`diagramas/`](diagramas).

`IP-DA-VM` = o endereço da VM · `<DEMO_SENHA>` = a senha das contas de demonstração.

---

## 1. Antes (em casa)

**Baixar o app** em <https://github.com/CezarGarcia/offline-first-medical-record/releases> (um arquivo serve para as duas ambulâncias):

| PC | Arquivo | Como abrir as duas ambulâncias |
|---|---|---|
| Windows | `MedicalField-Setup-1.0.0.exe` | Instalar ("Mais informações" → "Executar assim mesmo"). Atalhos **MedicalField** e **MedicalField (Ambulância 02)** |
| Linux | `MedicalField-1.0.0.AppImage` | Os comandos abaixo, um terminal para cada |

```bash
chmod +x MedicalField-1.0.0.AppImage
```

```bash
APPIMAGE_EXTRACT_AND_RUN=1 ./MedicalField-1.0.0.AppImage --no-sandbox
```

```bash
APPIMAGE_EXTRACT_AND_RUN=1 ./MedicalField-1.0.0.AppImage --no-sandbox --perfil=ambulancia-02
```

**Configurar o app:** servidor `http://IP-DA-VM`; nomes `Ambulância 01` e `Ambulância 02`; entrar **online** uma vez em cada: Dra. Ana (CRM `12345-RS`) na 01 e Enf. Bruno (COREN `543210-RS`) na 02.

---

## 2. Na VM (no começo da apresentação)

```bash
ssh univates@IP-DA-VM
```

**Se a VM estiver vazia** (instala tudo e pergunta a `DEMO_SENHA` e o Gmail):

```bash
curl -fsSL https://raw.githubusercontent.com/CezarGarcia/offline-first-medical-record/main/infra/scripts/instalar.sh | bash
```

**Se já estiver instalada** (volta ao começo do roteiro e confere):

```bash
cd ~/offline-first-medical-record
```

```bash
./infra/scripts/zerar.sh
```

```bash
./infra/scripts/verificar.sh
```

Abra um **segundo terminal** já no banco (vai usar no passo 9):

```bash
cd ~/offline-first-medical-record/infra && sudo docker compose exec db psql -U postgres -d medicalfield
```

---

## 3. Abertura (2 minutos)

Mostrar `diagramas/01-arquitetura.png` e `diagramas/10-padroes-de-projeto.png`: app desktop offline-first + 3 microsserviços em 3 linguagens (TypeScript, Java, Python) atrás do Nginx, um PostgreSQL com um schema por serviço.

---

## 4. Roteiro do enunciado

| # | Onde | Fazer | Mostrar |
|---|---|---|---|
| 1 | Portal `http://IP-DA-VM/` | Entrar com **Dr. Ricardo** (CRM `10001-RS`) | A Dra. Ana é recusada ("Acesso restrito a administradores") |
| 2 | Portal | Pessoas, Profissionais, Medicamentos | Os cadastros de demonstração |
| 3 | Portal | Prontuários | 2 prontuários |
| 4 | Portal | Atendimentos | 2 atendimentos |
| 5 | App 01 | Chave **Online**, entrar com a **Dra. Ana** | O nome na barra de cima |
| 6 | App 01 | **Sincronizar** | Pacientes e medicamentos no app |
| 7 | App 01 | Nova ocorrência → João da Silva → Selecionar → Usar este prontuário → salvar | Selo **Sincronizado** |
| 8 | Portal | Atendimentos → Atualizar | O novo no topo, modo **Online** |
| 9 | Banco (2º terminal) | O SQL abaixo | `INSERT 0 1` |
| 10 | Portal | Medicamentos (e Atendimentos) | O **Cetoprofeno** |
| 11 | App 01 | **Sincronizar** | O Cetoprofeno na lista do atendimento |
| 12 | App 01 | Chave **Offline** → nova pessoa **Maria Oliveira** (CPF `935.411.347-80`, e-mail do familiar = a sua caixa) → prontuário → atendimento com Cetoprofeno | **3 pendentes** na fila |
| 13 | Portal | Prontuários e Atendimentos → Atualizar | Maria **não** aparece |
| 14 | App 01 | Chave **Online** (sem clicar em mais nada) | A fila esvazia sozinha |
| 15 | Portal | Atualizar | Maria aparece, atendimento modo **Offline** |
| 16 | Portal | Atendimento da Maria → **Baixar PDF** | A ficha em PDF |
| 17 | Portal | **Enviar por e-mail** → Familiar | Abrir o Gmail: chegou com o PDF |

Passo 9, no psql:

```sql
INSERT INTO medicamento (nome, apresentacao, unidade_padrao) VALUES ('Cetoprofeno', 'Frasco-ampola 100 mg', 'MG');
```

```sql
SELECT nome, criado_em FROM medicamento ORDER BY criado_em DESC LIMIT 3;
```

---

## 5. Extras (se der tempo ou se pedirem)

**Login offline de quem nunca entrou no aparelho:** no app, Sair → chave Offline → **Carlos**, ID de Socorrista `SOC-0001`. Entra offline.

**Conflito (mesmo paciente em duas ambulâncias):** as duas em Offline; a mesma pessoa (CPF `286.255.878-87`) com telefones diferentes em cada uma; a 01 em Online, depois a 02. No portal: uma pessoa só (o telefone mais recente) e a página **Conflitos**. Imagem `06-conflito.png`.

**Auditoria** (no psql): os logs não podem ser apagados.

```sql
SELECT data_hora, servico, metodo, rota, status_code, tempo_ms FROM log_acesso ORDER BY data_hora DESC LIMIT 10;
```

```sql
DELETE FROM log_acesso;
```

(responde erro: "Registros de auditoria não podem ser alterados nem apagados")

**Um serviço fora do ar** (1º terminal, na pasta `infra/`): o PDF dá `503`, o resto continua.

```bash
cd ~/offline-first-medical-record/infra && sudo docker compose stop ms-docs
```

```bash
sudo docker compose start ms-docs
```

**Ver o que está no ar e os logs:**

```bash
sudo docker compose ps
```

```bash
sudo docker compose logs --tail 30 ms-clinico
```

**Trocar a regra de conflito** (Strategy): `nano .env` → `ESTRATEGIA_CONFLITO=SERVIDOR_VENCE`, salvar (`Ctrl+O`, `Enter`, `Ctrl+X`) e:

```bash
sudo docker compose up -d ms-clinico
```

**Postman:** importar `postman/MedicalField.postman_collection.json` e o ambiente; `baseUrl` = `http://IP-DA-VM`, `senha` = `<DEMO_SENHA>`; rodar a pasta **1. Roteiro do Postman**.

---

## 6. No banco: comandos úteis

| Para | No psql |
|---|---|
| Listar as tabelas | `\dt` |
| Colunas de uma tabela | `\d atendimento` |
| Ver uma linha em pé | `\x` |
| Horário de Brasília | `SET TIME ZONE 'America/Sao_Paulo';` |
| Sair | `\q` |

```sql
SELECT p.nome, a.data_hora, a.modo_registro, a.dispositivo_nome
FROM atendimento a JOIN prontuario pr ON pr.id = a.prontuario_id JOIN pessoa p ON p.id = pr.pessoa_id
ORDER BY a.data_hora DESC LIMIT 5;
```

---

## 7. Se algo der errado

| Problema | Comando |
|---|---|
| Não sei o que está errado | `./infra/scripts/verificar.sh` (diz o que falta e como resolver) |
| Login das contas recusado | `./infra/scripts/instalar.sh` (regrava a senha, não apaga dados) |
| Registros a mais dos ensaios | `./infra/scripts/zerar.sh` |
| `docker compose` diz `no configuration file` | `cd ~/offline-first-medical-record/infra` |
| `permission denied ... docker.sock` | Faltou o `sudo` na frente |
| App: "Faça login online para sincronizar" | Botão **Entrar online** na barra e a senha |
| App no Linux fecha ao abrir | Faltou o `--no-sandbox` |

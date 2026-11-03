# 9. Ficha de atendimento e domínio

Os formulários do sistema (pessoa, prontuário e atendimento), as regras de validação e os termos clínicos usados. A ficha não precisa ser idêntica à de um serviço real (orientação do professor). Ela deve ser **coerente** e cobrir o que o enunciado cita: sinais vitais, Glasgow, triagem (Manchester e START) e medicamentos administrados.

---

## 9.1 Os conceitos

| Conceito | O que é no sistema |
|---|---|
| **Pessoa** | O paciente: dados pessoais e contato de um familiar |
| **Prontuário** | O histórico clínico fixo da pessoa: tipo sanguíneo, alergias, doenças, remédios de uso contínuo. **Um por pessoa** |
| **Atendimento** | Uma ocorrência de socorro: o que aconteceu, a avaliação, a triagem, os medicamentos dados e o desfecho. Uma pessoa pode ter vários |
| **Ficha de Atendimento** | É o próprio atendimento. O **PDF** é a versão impressa dela |
| **Medicamento** | Item do catálogo (cadastro de apoio), escolhido ao registrar o que foi administrado |

O fluxo **"Nova ocorrência"** do app segue essa ordem: escolher ou criar a pessoa → criar o prontuário, se ela ainda não tiver → preencher o atendimento.

---

## 9.2 Formulário de pessoa

| Campo | Obrigatório | Regras |
|---|---|---|
| Nome | sim | Paciente sem identificação: escrever, por exemplo, `Desconhecido` |
| CPF | não | Só números; dígitos verificadores válidos; único no sistema. O app avisa se já existe alguém com esse CPF no aparelho |
| Data de nascimento | não | Não pode ser no futuro |
| Sexo | não | Masculino, Feminino, Outro, Não informado |
| Telefone | não | |
| E-mail | não | Formato de e-mail. Usado no envio "para o paciente" |
| Contato: nome, parentesco, telefone, e-mail | não | O e-mail do contato é usado no envio "para o familiar" |

## 9.3 Formulário de prontuário

| Campo | Obrigatório | Regras |
|---|---|---|
| Tipo sanguíneo | não | A+, A−, B+, B−, AB+, AB−, O+, O−, Desconhecido |
| Alergias | não | Texto livre |
| Comorbidades | não | Texto livre (ex.: hipertensão, diabetes) |
| Medicamentos de uso contínuo | não | Texto livre |
| Observações | não | Texto livre |

Se a pessoa já tem prontuário (no aparelho), o app mostra o existente em vez de criar outro.

---

## 9.4 Formulário de atendimento

### Ocorrência

| Campo | Obrigatório | Regras |
|---|---|---|
| Data/hora | sim | Já vem com a hora atual. Não pode estar no futuro |
| Local da ocorrência | não | Ex.: `BR-386, km 350` |
| Tipo de ocorrência | sim | Clínica, Trauma, Obstétrica, Psiquiátrica, Outro |
| Queixa principal | sim | O que o paciente relata ou o que se observa |

### Triagem

| Campo | Obrigatório | Regras |
|---|---|---|
| Protocolo | sim | Manchester ou START |
| Cor | sim | Só as cores do protocolo escolhido (tabela abaixo) |

**Protocolo de Manchester:** classificação de risco por cor, cada uma com um tempo máximo de espera.

| Cor | Prioridade | Tempo-alvo |
|---|---|---|
| Vermelho | Emergência | imediato |
| Laranja | Muito urgente | até 10 min |
| Amarelo | Urgente | até 60 min |
| Verde | Pouco urgente | até 120 min |
| Azul | Não urgente | até 240 min |

**START** (*Simple Triage and Rapid Treatment*): triagem rápida quando há **muitas vítimas** (acidente grande, desastre).

| Cor | Significado |
|---|---|
| Verde | Consegue andar; ferimentos leves; pode esperar |
| Amarelo | Não anda, mas respira até 30/min, tem boa perfusão e obedece a comandos; o atendimento pode ser adiado |
| Vermelho | Respiração acima de 30/min, perfusão ruim ou não obedece a comandos; atendimento imediato |
| Preto | Não respira nem depois de abrir a via aérea (óbito ou sem chance de sobrevida) |

No sistema, o profissional **escolhe** a cor; o app não calcula (D-20).

### Escala de Glasgow (nível de consciência)

Ou se preenche os três itens, ou nenhum. O total (3 a 15) é calculado sozinho: de 13 a 15 é leve, de 9 a 12 é moderado e de 3 a 8 é grave.

| Item | Pontos |
|---|---|
| Abertura ocular | 4 espontânea · 3 ao som · 2 à pressão · 1 ausente |
| Resposta verbal | 5 orientada · 4 confusa · 3 palavras · 2 sons · 1 ausente |
| Resposta motora | 6 obedece a comandos · 5 localiza · 4 flexão normal · 3 flexão anormal · 2 extensão · 1 ausente |

### Sinais vitais

Todos opcionais (no socorro nem sempre dá para medir tudo). As faixas aceitas só barram erros de digitação; não são alertas clínicos.

| Campo | Unidade | Faixa aceita |
|---|---|---|
| Pressão arterial sistólica / diastólica | mmHg | 0–300 / 0–200 |
| Frequência cardíaca | bpm | 0–300 |
| Frequência respiratória | irpm (incursões por minuto) | 0–80 |
| Saturação de oxigênio (SpO₂) | % | 0–100 |
| Temperatura | °C | 25,0–45,0 |
| Glicemia capilar | mg/dL | 0–1500 |

### Medicamentos administrados

Uma lista (pode ficar vazia). Cada item:

| Campo | Obrigatório | Regras |
|---|---|---|
| Medicamento | sim | Escolhido do catálogo (só os ativos) |
| Dose | sim | Maior que zero |
| Unidade | sim | mg, mcg, g, mL, UI, gota, comprimido, ampola, outra. Já vem com a unidade padrão do medicamento |
| Via | sim | Intravenosa, intramuscular, subcutânea, oral, sublingual, inalatória, intraóssea, tópica, outra |
| Horário | sim | Já vem com a hora atual |
| Observação | não | |

### Desfecho e complementos

| Campo | Obrigatório | Regras |
|---|---|---|
| Desfecho | sim | Encaminhado ao hospital, Liberado no local, Recusou atendimento, Óbito |
| Destino | quando encaminhado ao hospital | Nome do hospital |
| Procedimentos realizados | não | Texto livre (ex.: imobilização, oxigênio, acesso venoso) |
| Observações | não | Texto livre |

### Preenchidos automaticamente

Profissional logado (nome e registro), dispositivo, modo (online ou offline) e data/hora do registro. Ver o bloco de origem em [05-modelo-de-dados.md](05-modelo-de-dados.md#bloco-de-origem-rastreabilidade).

---

## 9.5 O PDF da ficha

Gerado pelo ms-docs (padrão Builder), em A4, nesta ordem:

1. **Cabeçalho:** "MedicalField — Ficha de Atendimento Pré-Hospitalar", número (início do ID) e data/hora do atendimento.
2. **Paciente:** nome, CPF, data de nascimento e idade, sexo, telefone e contato do familiar.
3. **Prontuário:** tipo sanguíneo, alergias, comorbidades, medicamentos de uso contínuo.
4. **Ocorrência:** tipo, local, queixa principal.
5. **Triagem:** protocolo e cor (com a cor destacada).
6. **Avaliação:** Glasgow (itens e total) e tabela de sinais vitais.
7. **Medicamentos administrados:** tabela com medicamento, dose, unidade, via e horário.
8. **Procedimentos, desfecho e destino, observações.**
9. **Rodapé:** profissional responsável (nome e registro), dispositivo, modo de registro, data de recebimento pelo servidor, data de geração do documento e o aviso "Documento com dados pessoais sensíveis (LGPD). Uso restrito."

## 9.6 O e-mail

- **Assunto:** `MedicalField — Ficha de Atendimento de <nome do paciente> (<data>)`
- **Corpo:** texto curto em português: que se trata da ficha do atendimento pré-hospitalar em anexo, quem atendeu, e o aviso de que contém dados sensíveis e não deve ser repassado.
- **Anexo:** o PDF da ficha.
- **Remetente:** a conta Gmail do projeto (D-16).

---

## 9.7 Glossário

| Termo | Significado |
|---|---|
| APH | Atendimento pré-hospitalar: o socorro antes de o paciente chegar ao hospital |
| SAMU | Serviço de Atendimento Móvel de Urgência |
| Médico regulador | Médico da central do SAMU que coordena os atendimentos. Aqui, é o exemplo de perfil `ADMIN` |
| CRM | Conselho Regional de Medicina: o registro do médico |
| COREN | Conselho Regional de Enfermagem: o registro de enfermeiros e técnicos |
| ID de Socorrista | Identificação do socorrista que não é médico nem de enfermagem |
| Comorbidade | Doença pré-existente (ex.: hipertensão, diabetes) |
| Perfusão | Circulação do sangue nos tecidos; no START, avaliada pelo enchimento capilar ou pelo pulso radial |
| LGPD | Lei Geral de Proteção de Dados. Dado de saúde é dado pessoal sensível |
| Offline-first | O app trabalha primeiro no banco local e sincroniza quando pode |
| Outbox | Fila de operações pendentes de envio, guardada no banco local |
| Idempotência | Repetir uma operação tem o mesmo efeito que fazê-la uma vez |
| Unificação | Juntar dois registros que são da mesma pessoa (ou do mesmo prontuário) |

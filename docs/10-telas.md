# 10. Telas

O que cada interface tem e como se comporta. Os campos dos formulários estão em [09-ficha-e-dominio.md](09-ficha-e-dominio.md).

---

## 10.1 App cliente (desktop, Windows)

### Estrutura

```
┌────────────────────────────────────────────────────────────────────────┐
│ Ambulância 01 - Dra. Ana Souza (CRM 12345-RS)                          │
│ [Online | Offline]   3 pendentes   Última: 13:40   [Sincronizar]       │
├──────────────────┬─────────────────────────────────────────────────────┤
│ Nova ocorrência  │                                                     │
│ Pacientes        │                                                     │
│ Atendimentos     │                   conteúdo da tela                  │
│ Fila de sincr.   │                                                     │
│ Logs locais      │                                                     │
│ Sobre            │                                                     │
│ Sair             │                                                     │
└──────────────────┴─────────────────────────────────────────────────────┘
```

**Barra superior (sempre visível):** nome do dispositivo, profissional logado, a **chave Online/Offline**, número de pendentes, última sincronização bem-sucedida e o botão **Sincronizar** (desabilitado em Offline). **Sair** fica no fim do menu.

**Avisos na barra**, quando for o caso:
- "Modo offline: tudo está sendo salvo neste aparelho."
- "Servidor inacessível: tentando de novo…" (chave em Online, mas sem resposta).
- "Faça login online para sincronizar" (sessão do servidor vencida ou login feito offline e app reaberto).
- "N itens com erro na fila" (leva para a tela da fila).

### Telas

| Tela | O que tem |
|---|---|
| **Configuração inicial** (só na primeira vez) | Endereço do servidor (ex.: `http://IP-DA-VM`) e nome do dispositivo (ex.: `Ambulância 01`). O endereço é conferido no primeiro login. Dá para mudar depois em "Sobre" |
| **Login** | Tipo de registro (CRM, COREN, ID de Socorrista), registro, senha e a chave Online/Offline (também disponível aqui). Mensagens: credenciais inválidas; bloqueado até HH:MM; "primeiro acesso neste aparelho precisa de conexão"; "login offline vencido: conecte-se". Ao entrar offline, mostra "Entrou em modo offline" |
| **Nova ocorrência** | Assistente em 3 passos. 1) **Pessoa:** busca por nome ou CPF no aparelho, ou cadastro novo (avisa se o CPF já existe, com o botão "Usar esta pessoa"). 2) **Prontuário:** mostra o existente (com as alergias) ou abre o formulário. 3) **Atendimento:** a ficha completa, com as **alergias em destaque** no topo e a lista de medicamentos administrados. A ficha é conferida antes de salvar, com as mesmas regras do servidor: os campos com problema ficam em vermelho e a tela rola até o primeiro. Ao salvar: "Salvo no aparelho" e, se online, "enviado" logo depois. O botão **Novo atendimento** do detalhe do paciente abre o assistente já no passo 2 |
| **Pacientes** | Lista do aparelho (busca por nome ou CPF), com selo **Pendente** ou **Sincronizado**. Detalhe: dados da pessoa, prontuário e atendimentos dela |
| **Atendimentos** | Lista do aparelho, do mais recente para o mais antigo: data/hora, número da ficha, paciente, tipo, cor da triagem, desfecho, quem registrou (e em qual dispositivo), modo e selo de sincronização. Busca por paciente ou número da ficha e filtro Pendentes / Sincronizados / Com erro. Detalhe: a ficha completa, na ordem do PDF, + botões **Baixar PDF** e **Enviar por e-mail** e a lista **E-mails desta ficha** (para quem, situação na fila e resultado) |
| **Enviar por e-mail** (janela) | Escolher Paciente, Familiar (só aparecem se houver e-mail cadastrado) ou Outro (digitar o e-mail). Offline: "o envio vai para a fila e sai quando a conexão voltar" |
| **Fila de sincronização** | Cada item, na ordem de envio: tipo, registro (com link para ele), status (Pendente, Enviando, Concluído, Erro) com as tentativas, último erro e próxima tentativa, criado e concluído. Filtros Todos / A enviar / Concluídos / Com erro. Botão **Tentar de novo** nos itens com erro. Atualiza sozinha. É a melhor tela para mostrar o offline-first na apresentação |
| **Logs locais** | Ações registradas no aparelho: data/hora (com segundos), profissional, ação, modo, detalhes (IDs encurtados, o completo na dica) e se já foi enviado. Filtro por ação |
| **Sobre** | Versão do app, ID e nome do dispositivo, endereço do servidor, perfil em uso (`--perfil`), posição da chave e **caminho do arquivo do banco local**. A sessão (quem entrou, como entrou e se a sincronização está liberada). E o formulário para trocar o endereço do servidor e o nome do dispositivo |

### Comportamentos

- **Baixar PDF** só fica habilitado para atendimentos sincronizados (o PDF é gerado no servidor, D-15). Pendente: "disponível depois de sincronizar".
- As listas se atualizam sozinhas depois de cada sincronização.
- Salvar nunca depende da rede: qualquer formulário é salvo no aparelho, mesmo com a chave em Online e o servidor fora do ar.
- **Sair com pendentes:** "Existem N pendentes. Eles continuam guardados e serão enviados por quem entrar em seguida."
- Os avisos rápidos ("Salvo no aparelho", "PDF salvo"…) aparecem no canto de baixo, para não cobrir a chave nem o botão Sincronizar.
- Datas e horas, inclusive nos campos da ficha, ficam no horário de Brasília, qualquer que seja o fuso do computador (D-23).

---

## 10.2 Portal Admin (navegador)

Endereço: `http://IP-DA-VM/`. Só entra perfil `ADMIN`.

### Estrutura

Menu lateral fixo, com o administrador logado e o botão Sair no topo. Cada página tem botão **Atualizar** e recarrega os dados ao ser aberta (importante nos passos 8, 13 e 15 do roteiro).

### Páginas

| Página | O que tem |
|---|---|
| **Login** | Tipo de registro, registro e senha. Perfil operacional: "Acesso restrito a administradores" |
| **Atendimentos** | Tabela: data/hora, paciente, tipo, triagem (selo com a cor), desfecho, profissional, dispositivo, modo (online/offline), recebido em. Filtros por paciente e período |
| **Detalhe do atendimento** | A ficha completa, na ordem do PDF, a origem (quem, quando, onde, modo) e os botões **Ver prontuário**, **Baixar PDF** e **Enviar por e-mail**. Na janela do e-mail, Paciente e Familiar só ficam disponíveis se houver e-mail no cadastro; em caso de erro, **Tentar de novo** reaproveita o mesmo pedido (não manda dois e-mails) |
| **Prontuários** | Tabela: paciente, CPF, tipo sanguíneo, alergias, quantidade de atendimentos. Detalhe: pessoa + prontuário + atendimentos |
| **Pessoas** | Tabela: nome, CPF, nascimento, sexo, contatos, origem. Clicar abre o prontuário da pessoa |
| **Medicamentos** | Tabela: nome, apresentação, unidade padrão, ativo, atualizado em |
| **Profissionais** | Tabela: nome, tipo e número do registro, perfil, ativo |
| **Conflitos** | Cada unificação: entidade, motivo, registro mantido × descartado, dispositivo de origem, estratégia e a tabela de diferenças (campo, valor mantido, valor descartado) |
| **Logs de acesso** | Log dos três serviços, paginado, com filtros por serviço, profissional, método, status, rota e período. A coluna Origem resume o user-agent (navegador, Postman, app cliente, ms-docs interno); o texto completo aparece ao passar o mouse |
| **Logs dos clientes** | Ações enviadas pelos aparelhos, com filtros por profissional, dispositivo, ação e modo |
| **E-mails enviados** | Pedido, atendimento (abre a ficha), destinatário, status, tentativas, erro, quem pediu, quando |
| **API (Swagger)** | Swagger UI dos três serviços (ms-auth, ms-clinico, ms-docs), já autenticado com o token do administrador. Endereço `/documentacao` (não `/api`, que é o prefixo da própria API no Nginx) |

O portal **não cadastra nada** (D-17): cadastros de apoio são feitos direto no banco, como permite o enunciado.

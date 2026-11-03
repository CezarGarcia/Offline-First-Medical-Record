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
| **Nova ocorrência** | Assistente em 3 passos. 1) **Pessoa:** busca por nome ou CPF no aparelho, ou cadastro novo (avisa se o CPF já existe). 2) **Prontuário:** mostra o existente ou abre o formulário. 3) **Atendimento:** a ficha completa, com a lista de medicamentos administrados. Ao salvar: "Salvo no aparelho" e, se online, "enviado" logo depois |
| **Pacientes** | Lista do aparelho (busca por nome ou CPF), com selo **Pendente** ou **Sincronizado**. Detalhe: dados da pessoa, prontuário e atendimentos dela |
| **Atendimentos** | Lista do aparelho, do mais recente para o mais antigo: data/hora, paciente, tipo, cor da triagem, desfecho, selo de sincronização. Detalhe: a ficha completa + botões **Baixar PDF** e **Enviar por e-mail** |
| **Enviar por e-mail** (janela) | Escolher Paciente, Familiar (só aparecem se houver e-mail cadastrado) ou Outro (digitar o e-mail). Offline: "o envio vai para a fila e sai quando a conexão voltar" |
| **Fila de sincronização** | Cada item: tipo, registro, status (Pendente, Enviando, Concluído, Erro), tentativas, último erro e próxima tentativa. Botão **Tentar de novo** nos itens com erro. É a melhor tela para mostrar o offline-first na apresentação |
| **Logs locais** | Ações registradas no aparelho: data/hora, profissional, ação, modo e se já foi enviado |
| **Sobre** | Versão do app, ID e nome do dispositivo, endereço do servidor, perfil em uso (`--perfil`) e **caminho do arquivo do banco local** |

### Comportamentos

- **Baixar PDF** só fica habilitado para atendimentos sincronizados (o PDF é gerado no servidor, D-15). Pendente: "disponível depois de sincronizar".
- As listas se atualizam sozinhas depois de cada sincronização.
- Salvar nunca depende da rede: qualquer formulário é salvo no aparelho, mesmo com a chave em Online e o servidor fora do ar.
- **Sair com pendentes:** "Existem N pendentes. Eles continuam guardados e serão enviados por quem entrar em seguida."

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
| **Detalhe do atendimento** | A ficha completa, a origem (quem, quando, onde, modo) e os botões **Baixar PDF** e **Enviar por e-mail** |
| **Prontuários** | Tabela: paciente, CPF, tipo sanguíneo, alergias, quantidade de atendimentos. Detalhe: pessoa + prontuário + atendimentos |
| **Pessoas** | Tabela: nome, CPF, nascimento, sexo, contatos, origem |
| **Medicamentos** | Tabela: nome, apresentação, unidade padrão, ativo, atualizado em |
| **Profissionais** | Tabela: nome, tipo e número do registro, perfil, ativo |
| **Conflitos** | Cada unificação: entidade, motivo, registro mantido × descartado, dispositivo de origem, estratégia e a tabela de diferenças (campo, valor mantido, valor descartado) |
| **Logs de acesso** | Log dos três serviços, paginado, com filtros por serviço, profissional, método, status, rota e período |
| **Logs dos clientes** | Ações enviadas pelos aparelhos, com filtros por profissional, dispositivo, ação e modo |
| **E-mails enviados** | Pedido, atendimento, destinatário, status, erro, quem pediu, quando |
| **API** | Swagger UI dos três serviços (ms-auth, ms-clinico, ms-docs), já autenticado com o token do administrador |

O portal **não cadastra nada** (D-17): cadastros de apoio são feitos direto no banco, como permite o enunciado.

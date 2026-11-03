# App cliente

**Tecnologia:** Electron 45 + React 19 + TypeScript + Mantine 9 + SQLite (`node:sqlite`, do próprio Electron) · **Situação:** implementado (etapa 6)

Programa desktop para Windows, usado pelo profissional em campo (a "ambulância"). Funciona sem conexão (offline-first): tudo é salvo primeiro no banco local e sincroniza com o servidor quando a chave **Simular Conectividade** está em Online.

- Telas: [docs/10-telas.md, seção 10.1](../../docs/10-telas.md#101-app-cliente-desktop-windows)
- Banco local: [docs/05-modelo-de-dados.md, seção 5.3](../../docs/05-modelo-de-dados.md#53-banco-local-sqlite-no-app-cliente)
- Sincronização: [docs/07-sincronizacao.md](../../docs/07-sincronizacao.md)
- Login offline e sessão: [docs/08-seguranca-e-auditoria.md](../../docs/08-seguranca-e-auditoria.md#85-login-offline)
- Instalação no Windows e segunda ambulância (`--perfil`): [docs/12-implantacao.md](../../docs/12-implantacao.md#1210-app-cliente-no-windows)
- Testes: [docs/13-testes-automatizados.md](../../docs/13-testes-automatizados.md)
- Decisões: D-01, D-07, D-11 a D-14, D-29, D-39 e D-45 a D-47 em [docs/03-decisoes.md](../../docs/03-decisoes.md)

## Como funciona

O Electron tem duas partes, e as telas nunca acessam o banco nem a rede:

- **Núcleo local** (processo principal, `src/main/nucleo/`): banco SQLite, repositórios, fila de pendentes (outbox), cliente HTTP, motor de sincronização, chave Online/Offline, sessão e login offline, logs locais. Não depende do Electron (o cofre, a janela "Salvar como" e a rede chegam de fora), então os testes rodam no Node.js puro.
- **Telas** (React, `src/renderer/`): falam com o núcleo só pelo contrato `ApiDoNucleo` (`src/comum/contrato.ts`), pelo IPC. O *preload* expõe duas funções em `window.medicalfield`: chamar um método e ouvir os avisos ("o estado mudou", "os dados mudaram"). As telas rodam com `contextIsolation` e `sandbox`, e a CSP não deixa a página falar com a rede.

O caminho de uma ficha:

1. **Salvar** (`registros.ts`): numa transação do SQLite, o registro entra como `PENDENTE`, a fila ganha o item com o JSON exato da requisição e o log local registra a ação. Online ou offline, o caminho é o mesmo (D-11).
2. **Enviar** (`sincronizacao.ts`): o motor envia a fila em ordem, um item por vez. Cada item é um comando (`comandos.ts`: `CriarPessoa`, `CriarProntuario`, `CriarAtendimento`, `EnviarEmail`) que sabe montar a requisição e aplicar a resposta, inclusive a unificação de duplicados. Erros definitivos não travam a fila; erros temporários param e agendam nova tentativa (5 s, 10 s, 20 s… até 5 min).
3. **Receber** ("receber dados"): o pull traz o que mudou no servidor desde o último cursor, com as unificações. No fim, os logs locais sobem em lote.

A chave Online/Offline (`conectividade.ts`) é o interruptor geral (D-14): em Offline, o cliente HTTP recusa qualquer requisição. Quando ela volta para Online, o motor sincroniza sozinho (padrão Observer).

## Estrutura

```
src/
  main/
    index.ts             janela, perfil (--perfil), cofre (safeStorage), "Salvar como" do PDF e o IPC
    perfil.ts            uma pasta de dados por perfil (D-29)
    nucleo/
      nucleo.ts          a fachada que as telas usam (implementa o contrato)
      banco.ts           SQLite (node:sqlite) com transações e migrations
      migracoes.ts       as tabelas do banco local
      repositorios/      um repositório por tabela (os únicos com SQL)
      conectividade.ts   a chave Online/Offline (Observer)
      http.ts            o cliente HTTP (bloqueado em Offline, cancela ao virar para Offline)
      sessao.ts          login online e offline, sessão mantida, renovação do token
      credencial.ts      o verificador da senha para o login offline (scrypt)
      registros.ts       gravação local (registro + item da fila + log, numa transação)
      comandos.ts        os comandos da fila (Command)
      sincronizacao.ts   o motor: envio, recebimento e logs
      auditoria.ts       os logs locais
  preload/index.ts       a ponte window.medicalfield
  comum/contrato.ts      o contrato entre as telas e o núcleo
  renderer/
    index.html           com a CSP
    src/
      App.tsx            provedores, configuração inicial → login → app, e as rotas
      nucleo.ts          o cliente do contrato, o estado do app e os erros
      componentes/       Estrutura (barra, chave, menu, avisos), Ficha, JanelaEmail, JanelaSenhaOnline, Tabela...
      formularios/       FormPessoa, FormProntuario, FormAtendimento (+ dadosDoAtendimento.ts)
      paginas/           Configuracao, Login, NovaOcorrencia, Pacientes, Paciente, Atendimentos, Atendimento, Fila, Logs, Sobre
testes/                  núcleo (Node.js) e formulário; telas/ (jsdom, com o núcleo de verdade atrás de uma ponte falsa)
e2e/passeio.mjs          passeio pelo app real (Playwright + Electron)
recursos/                ícone e o script do instalador (atalho da Ambulância 02)
electron.vite.config.ts  build do processo principal, do preload (CommonJS) e das telas
electron-builder.yml     instalador do Windows (NSIS)
```

Tipos da API, rótulos em português, formatação e as regras dos formulários (as mesmas do servidor) ficam em [`apps/compartilhado`](../compartilhado), usados também pelo portal.

## Desenvolvimento

Pré-requisito: Node.js 22.22 ou mais novo (ou 24). Para usar o app de verdade, a stack do `infra/` no ar.

```bash
npm ci
npm run dev
```

Abre a janela do app, com recarga automática das telas. Na primeira vez, ele pede o endereço do servidor (o Nginx do `infra/`, por exemplo `http://localhost`, ou com a porta do `HTTP_PORTA`) e o nome do dispositivo. Para abrir uma segunda "ambulância", com banco próprio: `npm run dev -- -- --perfil=ambulancia-02`.

| Comando | O que faz |
|---|---|
| `npm test` | Testes do núcleo, do formulário e das telas (sem servidor: ele é falso) |
| `npm run typecheck` | Confere os tipos do processo principal, das telas e dos testes |
| `npm run build` | Gera o app em `out/` |
| `npm start` | Gera o app e abre, como ele fica no instalador (sem recarga automática) |
| `npm run test:integracao` | Integração com o servidor de verdade (precisa de `MEDICALFIELD_URL` e `MEDICALFIELD_SENHA`) |
| `npm run e2e` | Passeio pelo app real, com fotos das telas em `e2e/telas/` (mesmas variáveis; antes, `npm run build`) |
| `npm run instalador` | Gera o instalador do Windows em `release/` (no Windows; antes, `npm run build`) |

A integração e o passeio criam registros de teste no servidor: use a pilha local, não a VM da apresentação. Os detalhes estão em [docs/13, seção 13.2](../../docs/13-testes-automatizados.md#132-como-rodar).

## Onde ficam os dados

- **Banco local:** `%APPDATA%\MedicalField\<perfil>\medicalfield.db` no Windows (`~/.config/MedicalField/<perfil>/` no Linux). O perfil padrão é `padrao`; o caminho exato aparece na tela **Sobre**.
- **Refresh token:** cifrado pelo cofre do sistema (no Windows, o DPAPI, pelo `safeStorage`). O token de acesso fica só na memória.
- **Senha:** nunca é gravada. O login offline usa um verificador scrypt (D-07).

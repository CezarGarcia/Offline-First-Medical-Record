# Apresentação

Material para apresentar o MedicalField: o passo a passo do dia e os diagramas.

| Arquivo | O que é |
|---|---|
| [`GUIA-DE-DEMONSTRACAO.md`](GUIA-DE-DEMONSTRACAO.md) | **O documento da apresentação**, em duas partes. **I · O sistema:** cada peça (app, portal, Nginx, ms-auth, ms-clinico, ms-docs, PostgreSQL e SQLite), como funciona e onde fica no código; os fluxos (login e tokens, login offline, outbox, chave Online/Offline, envio, idempotência, conflitos, pull, PDF, e-mail, auditoria); padrões de projeto, segurança e testes. **II · A demonstração:** preparação, os 17 passos com o que acontece por trás de cada um, cenários complementares, comandos do banco e do Docker e solução de problemas |
| [`ROTEIRO-DA-APRESENTACAO.md`](ROTEIRO-DA-APRESENTACAO.md) | **A cola para a hora:** curta e direta. Instalar a VM do zero (um comando, ou o clone à mão), atualizar, zerar e verificar, entrar no banco e o SQL dos passos, os comandos do Docker, o app no Windows e no Linux, as contas, os 17 passos numa tabela, os extras e o que fazer se algo der errado |
| [`diagramas/`](diagramas) | As imagens, no formato de slide (16:9, PNG em alta resolução), feitas para ler de longe: poucas palavras e uma cor por parte do sistema |

## Diagramas

As cores são as mesmas em todas: **azul** = app e TypeScript (ms-auth), **laranja** = Java (ms-clinico), **verde** = Python (ms-docs), **verde-água** = Nginx, **roxo** = bancos, **amarelo** = chaves e tokens.

| Imagem | Mostra | Use para |
|---|---|---|
| [`01-arquitetura`](diagramas/01-arquitetura.png) | As partes, a linguagem de cada serviço e o caminho de uma requisição | Abrir a apresentação |
| [`02-banco-servidor`](diagramas/02-banco-servidor.png) | O PostgreSQL: um schema por serviço e as tabelas de cada um | "Como é o banco?" |
| [`03-banco-local-sqlite`](diagramas/03-banco-local-sqlite.png) | O SQLite do app: a cópia dos dados e o que é só do aparelho | "O que o app guarda?" |
| [`04-offline-first`](diagramas/04-offline-first.png) | Salvar: SQLite + fila, e o envio quando há internet | Passos 7, 12 e 14 |
| [`05-sincronizacao`](diagramas/05-sincronizacao.png) | Enviar a fila em ordem e receber o que mudou | Passos 6, 11 e 14 |
| [`06-conflito`](diagramas/06-conflito.png) | O mesmo paciente em duas ambulâncias: o servidor junta | Extra do conflito (11.4) |
| [`07-login-e-tokens`](diagramas/07-login-e-tokens.png) | Login, JWT, refresh token e as chaves privada e pública | Passos 1 e 5 |
| [`08-login-offline`](diagramas/08-login-offline.png) | Como o app deixa entrar sem internet | Extra do login offline (11.5) |
| [`09-rede-e-portas`](diagramas/09-rede-e-portas.png) | O que fica aberto na VM (80 e 22) e o que fica fechado | Segurança e o papel do Nginx |
| [`10-padroes-de-projeto`](diagramas/10-padroes-de-projeto.png) | Os seis padrões de projeto, com onde estão e para quê | A pergunta dos padrões |
| [`11-app-por-dentro`](diagramas/11-app-por-dentro.png) | As telas e o núcleo do app, e o IPC entre eles | "O que é o IPC e o núcleo local?" |

## Mudar uma imagem

Cada imagem é uma página HTML em `diagramas/fontes/` (as caixas e os textos ficam no próprio arquivo; as setas são desenhadas pelo `fontes/base/base.js`). Para ver uma mudança, abra o `.html` no navegador. Para gerar os PNG de novo (Node.js 22 ou mais novo):

```bash
cd apresentacao/diagramas
npm ci
npx playwright-core install chromium
npm run gerar
```

`npm run gerar -- 06` gera só as que têm `06` no nome.

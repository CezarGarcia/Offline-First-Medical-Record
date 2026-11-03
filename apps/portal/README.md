# Portal Admin

**Tecnologia:** React 19 + TypeScript + Vite + Mantine 9 · **Situação:** implementado (etapa 5)

Interface web administrativa, servida pelo Nginx em `http://IP-DA-VM/`. Só entra perfil `ADMIN`. É somente leitura (os cadastros de apoio são inseridos direto no banco), com PDF e envio da ficha por e-mail.

- Páginas: [docs/10-telas.md, seção 10.2](../../docs/10-telas.md#102-portal-admin-navegador)
- Rotas da API usadas: [docs/06-api.md](../../docs/06-api.md)
- Tokens e sessão: [docs/08-seguranca-e-auditoria.md](../../docs/08-seguranca-e-auditoria.md#86-sessão-mantida)
- Decisões: D-17, D-21 e D-40 a D-42 em [docs/03-decisoes.md](../../docs/03-decisoes.md)

## Como funciona

- **Mesmo endereço da API:** o portal chama `/api/...` no próprio Nginx que o serve. Por isso não há CORS nem endereço de servidor para configurar.
- **Token:** o `ClienteApi` (`src/api/cliente.ts`) coloca o token em cada requisição e o renova sozinho com o refresh token, quando faltam 30 segundos para vencer ou quando o servidor responde `401`. Várias requisições recebendo `401` ao mesmo tempo esperam uma renovação só. Se a renovação for recusada, o portal volta ao login com o aviso "Sua sessão terminou".
- **Sessão:** fica no `sessionStorage` (some ao fechar a aba). O `ArmazemDaSessao` avisa a tela quando ela muda (entrou, renovou, saiu).
- **Perfil operacional:** o servidor aceita o login, mas o portal recusa ("Acesso restrito a administradores") e encerra na hora a sessão criada.
- **Dados:** TanStack Query. Cada página busca os dados de novo ao abrir e tem o botão **Atualizar** (os dados mudam por fora: sincronização dos aparelhos, SQL direto no banco). As listas do ms-clinico vêm inteiras e são filtradas e paginadas no navegador; os logs e os e-mails são paginados no servidor (D-42).
- **PDF:** a rota exige token, então o portal baixa o arquivo pela API e entrega ao navegador para salvar.
- **E-mail:** o ID do pedido é gerado quando a janela abre e reaproveitado em cada tentativa. Clicar duas vezes, ou "Tentar de novo" depois de um erro, nunca manda dois e-mails (D-36).
- **API (Swagger):** a página `/documentacao` mostra as especificações dos três serviços. O "Try it out" usa o token de quem está logado. A página não se chama `/api` porque esse prefixo é da API no Nginx.

## Estrutura

```
src/
  main.tsx, App.tsx      provedores (Mantine, datas em pt-BR, avisos, TanStack Query) e o roteador
  rotas.tsx              as rotas do portal (os testes usam as mesmas, em memória)
  tema.ts                cores e fonte
  api/                   cliente.ts (fetch + token), sessao.ts, erros.ts, consultas.ts (uma consulta por rota)
  componentes/           Layout (menu), RotaProtegida, Pagina, Tabela, Campos, Selos, FichaDoAtendimento, JanelaEmail
  paginas/               uma por tela (Atendimentos, DetalheAtendimento, Prontuarios, ..., Api, Login)
  util/                  baixarArquivo.ts
testes/                  Vitest + Testing Library (ver docs/13-testes-automatizados.md)
Dockerfile               imagem do Nginx com o portal dentro (contexto: a pasta apps/)
```

Tipos da API, rótulos em português e formatação (datas no horário de Brasília, CPF, telefone) ficam em [`apps/compartilhado`](../compartilhado), usados também pelo app cliente.

## Desenvolvimento

Pré-requisito: Node.js 22.22 ou mais novo (ou 24). Com a stack do `infra/` no ar:

```bash
npm ci
MEDICALFIELD_API=http://localhost npm run dev
```

O Vite abre em `http://localhost:5173` e repassa `/api` para o endereço de `MEDICALFIELD_API` (o Nginx do `infra/`; troque a porta se o `HTTP_PORTA` não for 80).

| Comando | O que faz |
|---|---|
| `npm test` | Testes (Vitest + Testing Library, sem servidor: a API é falsa) |
| `npm run typecheck` | Confere os tipos (inclusive dos testes e de `apps/compartilhado`) |
| `npm run build` | Confere os tipos e gera os arquivos estáticos em `dist/` |

## Na VM

O `docker compose up -d --build` do `infra/` constrói a imagem `medicalfield/nginx` a partir deste `Dockerfile`: um estágio com Node.js faz o build, e a imagem final é o Nginx com os arquivos do portal. A configuração do Nginx continua em `infra/nginx/` e entra como volume.

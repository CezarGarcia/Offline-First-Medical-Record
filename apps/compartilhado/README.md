# Código compartilhado (portal e app cliente)

O que as duas interfaces usam igual (D-21), sem nenhuma dependência de biblioteca:

| Arquivo | O que tem |
|---|---|
| [`src/tipos.ts`](src/tipos.ts) | Os formatos das respostas da API (docs/06-api.md) |
| [`src/rotulos.ts`](src/rotulos.ts) | Como cada valor das listas fixas aparece na tela (os mesmos rótulos do PDF) |
| [`src/formatos.ts`](src/formatos.ts) | Datas no horário de Brasília, CPF, telefone, números com vírgula, idade, número da ficha |

Cada app importa com o atalho `@compartilhado/...` (configurado no `tsconfig.json` e no `vite.config.ts` do app). Não é um pacote npm: é só uma pasta de código-fonte, compilada junto com o app que a usa.

# Scripts de operação

São só quatro. Rodam de qualquer pasta do repositório e **sem `sudo` na frente**: quando o Docker só responde com `sudo` (como na VM do projeto), eles chamam `sudo docker` sozinhos (D-50). Cada um mostra, numa linha que começa com `$`, o comando que roda por baixo.

| Script | Quando | O que faz |
|---|---|---|
| `instalar.sh` | VM nova, ou para deixar tudo no ar de novo | Do zero até o portal no ar: Docker (se faltar), o código, o `.env` (pergunta a `DEMO_SENHA` e o Gmail), as chaves dos tokens, as imagens, o banco com os dados de demonstração e a conferência. Pode rodar de novo: não apaga dados |
| `atualizar.sh` | Depois de uma mudança no código | `git pull`, reconstrói as imagens e sobe a versão nova. Os dados ficam |
| `zerar.sh` | Antes da apresentação e entre ensaios | Apaga **todos** os dados e recarrega os de demonstração (o começo do roteiro). Pede para digitar `ZERAR` |
| `verificar.sh` | Antes de começar, ou se algo parecer errado | Confere containers, rotas, login das contas, dados, e-mail, disco e memória. Não muda nada |

O `_comum.sh` só guarda as funções que os quatro usam.

Numa VM nova, sem nada, o `instalar.sh` roda direto pela URL (ele clona o repositório em `~/offline-first-medical-record`):

```bash
curl -fsSL https://raw.githubusercontent.com/CezarGarcia/offline-first-medical-record/main/infra/scripts/instalar.sh | bash
```

O resto (logs, derrubar um serviço, entrar no banco, o SQL do passo 9) se faz à mão: [docs/12, seção 12.15](../../docs/12-implantacao.md#1215-fazendo-à-mão-sem-os-scripts).

No Windows (Docker Desktop, sem bash), o `gerar-chaves-jwt.ps1` gera as chaves dos tokens; o resto do passo a passo está em [docs/12, seção 12.11](../../docs/12-implantacao.md#1211-desenvolvimento-local).

No notebook (Windows), o [`apps/cliente/scripts/apagar-dados-locais.cmd`](../../apps/cliente/scripts/apagar-dados-locais.cmd) apaga os dados do app cliente. Rode depois do `zerar.sh`, senão o app continua com os registros do ensaio.

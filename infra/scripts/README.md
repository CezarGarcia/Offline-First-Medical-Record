# Scripts de operação

Para instalar, conferir, preparar a apresentação e mostrar o sistema funcionando, sem decorar comandos do Docker. Rodam de qualquer pasta do repositório (ex.: `./infra/scripts/verificar.sh`) e usam o `infra/.env`. Os que apagam dados pedem confirmação. Detalhes em [docs/12, seções 12.13 e 12.14](../../docs/12-implantacao.md#1213-scripts-de-operação).

| Script | Para quê | Quando |
|---|---|---|
| `instalar.sh` | Primeira instalação: cria o `.env` (com senhas novas para o banco), as chaves dos tokens, constrói as imagens uma de cada vez, sobe tudo, carrega os dados de demonstração e confere | Uma vez, na VM |
| `atualizar.sh` | Baixa a versão nova do repositório, reconstrói, sobe de novo e confere. Os dados ficam | Depois de cada mudança no código |
| `verificar.sh` | Checklist: containers, rotas pelo Nginx, login das contas de demonstração, dados, e-mail, disco e memória. Não muda nada | Antes da apresentação, e sempre que algo parecer errado |
| `zerar.sh` | Apaga todos os dados e recarrega os de demonstração: volta ao começo do roteiro (com backup antes) | Antes da apresentação e entre ensaios |
| `popular-demo.sh` | Carrega os dados de demonstração; também regrava a senha das contas, desbloqueia e reativa | Depois de trocar a `DEMO_SENHA`, ou com uma conta bloqueada |
| `testar-email.sh <e-mail>` | Manda de verdade uma ficha para o endereço, pelo mesmo caminho do portal | Depois de configurar o Gmail, antes da apresentação |
| `medicamento.sh` | Passo 9 do roteiro: insere o Cetoprofeno direto no banco (mostra o `INSERT 0 1`) | Na apresentação |
| `estrategia.sh [SERVIDOR_VENCE]` | Mostra ou troca a estratégia de unificação e reinicia o ms-clinico | Na variação do roteiro do conflito (11.4) |
| `servico.sh parar\|iniciar\|logs <serviço>` | Derruba e religa um serviço, ou mostra os logs | Para mostrar o sistema com uma parte fora do ar (11.8) |
| `backup.sh [nome]` / `restaurar.sh <arquivo>` | Guarda o banco inteiro em `infra/backups/` e volta para ele | Depois de um ensaio que deu certo |
| `psql.sh` | Abre o banco central no psql (`-c "..."` para um comando só) | Para mostrar tabelas e o passo 9 à mão |
| `gerar-chaves-jwt.sh` | Gera as chaves dos tokens (o `instalar.sh` já roda) | Uma vez |

No notebook da apresentação (Windows), o [`apps/cliente/scripts/apagar-dados-locais.cmd`](../../apps/cliente/scripts/apagar-dados-locais.cmd) apaga os dados do app cliente (os dois perfis). Rode depois do `zerar.sh`, senão o app continua com os registros do ensaio.

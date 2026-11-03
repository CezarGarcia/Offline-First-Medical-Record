# App cliente

**Tecnologia:** Electron + React + TypeScript + Mantine + SQLite (better-sqlite3) · **Situação:** a implementar (etapa 6)

Programa desktop para Windows, usado pelo profissional em campo. Funciona sem conexão (offline-first) e sincroniza com o servidor quando a chave "Simular Conectividade" está em Online.

## Partes

- **Telas** (React): login, nova ocorrência, pacientes, atendimentos, fila de sincronização, logs locais e sobre. Nunca acessam o banco nem a rede diretamente.
- **Núcleo local** (processo principal do Electron): repositórios local e remoto (Repository), estado da conectividade (Observer), fila de pendentes com comandos (Outbox + Command), motor de sincronização, sessão e login offline, logs locais.

## Referências

- Telas: [docs/10-telas.md, seção 10.1](../../docs/10-telas.md#101-app-cliente-desktop-windows)
- Banco local: [docs/05-modelo-de-dados.md, seção 5.3](../../docs/05-modelo-de-dados.md#53-banco-local-sqlite-no-app-cliente)
- Sincronização: [docs/07-sincronizacao.md](../../docs/07-sincronizacao.md)
- Login offline e sessão: [docs/08-seguranca-e-auditoria.md](../../docs/08-seguranca-e-auditoria.md#85-login-offline)
- Instalação no Windows e segunda instância (`--perfil`): [docs/12-implantacao.md](../../docs/12-implantacao.md#1210-app-cliente-no-windows)

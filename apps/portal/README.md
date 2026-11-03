# Portal Admin

**Tecnologia:** React + TypeScript + Vite + Mantine · **Situação:** a implementar (etapa 5)

Interface web administrativa, servida pelo Nginx em `http://IP-DA-VM/`. Só entra perfil `ADMIN`. É somente leitura (os cadastros de apoio são inseridos direto no banco), com PDF e envio da ficha por e-mail.

- Páginas: [docs/10-telas.md, seção 10.2](../../docs/10-telas.md#102-portal-admin-navegador)
- Rotas usadas: [docs/06-api.md](../../docs/06-api.md)
- Decisões: D-17 e D-21 em [docs/03-decisoes.md](../../docs/03-decisoes.md)

O build (arquivos estáticos) substitui a página provisória de `infra/nginx/html/`.

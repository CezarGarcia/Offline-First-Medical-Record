# Coleção do Postman

As rotas dos três serviços (docs/06-api.md), com **login automático** e **testes em cada requisição** (D-28). A pasta 1 é o roteiro do Postman da apresentação, passo a passo ([docs/11, seção 11.6](../docs/11-roteiro-de-testes.md#116-extra-testes-pelo-postman)).

| Arquivo | O que é |
|---|---|
| `MedicalField.postman_collection.json` | A coleção: 50 requisições em 5 pastas |
| `MedicalField.postman_environment.json` | O ambiente: endereço do servidor, contas e senha |

## Como usar no Postman

1. **Import** → escolha os dois arquivos desta pasta.
2. No canto de cima, à direita, escolha o ambiente **MedicalField** e preencha:

   | Variável | O que pôr |
   |---|---|
   | `baseUrl` | O endereço da VM, como no navegador (ex.: `http://IP-DA-VM`). Na pilha local, `http://localhost` (ou com a porta do `HTTP_PORTA`) |
   | `senha` | A senha das contas de demonstração (a `DEMO_SENHA` do `infra/.env`). Fica só no seu Postman: ela não vai para o repositório (D-31) |
   | `emailDeTeste` | Opcional: uma caixa de e-mail sua. Os passos C11 a C13 mandam a ficha para ela. Vazia, esses passos são pulados |

   As contas já vêm preenchidas: a Dra. Ana (`CRM 12345-RS`, perfil operacional) e o Dr. Ricardo (`CRM 10001-RS`, administrador).
3. Rode a **coleção inteira** (botão **Run**), ou uma requisição de cada vez, na ordem. A pasta 1 cria a pessoa, o prontuário e o atendimento que as outras pastas usam.

**Login automático:** cada requisição diz de qual perfil precisa (`{{tokenOperacional}}` ou `{{tokenAdmin}}`, na aba **Authorization**). Antes de enviar, a coleção confere se já tem um token válido desse perfil; se não tiver, ou se ele estiver para vencer (15 min), entra sozinha e guarda o token. Os passos C2 e C8 fazem o login às claras, como no roteiro, e também guardam o token.

## As pastas

| Pasta | O que tem |
|---|---|
| 1. Roteiro do Postman | C1 a C13 do roteiro: sem token (`401`), login, idempotência (`CRIADO` → `JA_EXISTIA`), unificação pelo CPF (`UNIFICADO`), rota de admin (`403`), log de acesso com o `401` do C1, prontuário e atendimento da pessoa, PDF e e-mail (com a repetição que não manda outro) |
| 2. ms-auth | `me`, login inválido, a sessão inteira (login → refresh → logout → refresh recusado), profissionais, logs dos clientes (com a repetição ignorada) e a OpenAPI |
| 3. ms-clinico | Listas, validação campo a campo, prontuário enviado com o ID descartado (tradução de IDs e unificação), referência inexistente (`422`), detalhe do atendimento, "receber dados" (`/sync/pull`, com e sem cursor), conflitos e a OpenAPI |
| 4. ms-docs | Os erros do PDF e do e-mail (`404`, `400`, `422`, `403`) e a OpenAPI |
| 5. Gateway | Rota desconhecida (`404` do Nginx) e os cabeçalhos de segurança |

Cada execução cria registros novos (uma pessoa com um CPF novo, o prontuário e o atendimento dela, e um log de teste). Por isso a coleção pode rodar quantas vezes quiser, mas deixa esses registros no banco. Na apresentação, rode só a pasta 1, ou só os passos que for mostrar.

## Pela linha de comando (Newman)

O mesmo teste, sem abrir o Postman. É o que o GitHub Actions roda a cada push ([docs/13](../docs/13-testes-automatizados.md)):

```bash
npx newman run postman/MedicalField.postman_collection.json -e postman/MedicalField.postman_environment.json --env-var baseUrl=http://localhost --env-var senha=<DEMO_SENHA> --env-var emailDeTeste=<um e-mail>
```

No fim, o Newman mostra quantas requisições e verificações passaram; qualquer falha aparece com o nome do passo e o motivo.

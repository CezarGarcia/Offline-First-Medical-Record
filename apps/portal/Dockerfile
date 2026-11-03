# syntax=docker/dockerfile:1
#
# Gateway do MedicalField: o Nginx com o Portal Admin dentro.
# O contexto do build é a pasta apps/ (o portal usa o código de apps/compartilhado):
#   docker build -f portal/Dockerfile -t medicalfield/nginx apps
# A configuração do Nginx (infra/nginx) entra pelo docker-compose.yml, como volume.

FROM node:24-slim AS build
# O swagger-ui depende de um pacote que manda estatísticas de instalação; aqui fica desligado
ENV SCARF_ANALYTICS=false
WORKDIR /apps/portal
COPY portal/package.json portal/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY compartilhado /apps/compartilhado
COPY portal ./
# Confere os tipos (inclusive dos testes) e gera os arquivos estáticos em dist/
RUN npm run build

FROM nginx:1.29-alpine
COPY --from=build /apps/portal/dist /usr/share/nginx/html

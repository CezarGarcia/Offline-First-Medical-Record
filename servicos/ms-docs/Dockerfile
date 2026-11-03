# syntax=docker/dockerfile:1

# Base: Python + as bibliotecas de sistema que o WeasyPrint usa para gerar o PDF (Pango, HarfBuzz) e as fontes
FROM python:3.13-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz-subset0 \
      fonts-liberation fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

# Testes no mesmo ambiente da produção (opcional): docker build --target testes -t ms-docs-testes .
FROM base AS testes
COPY requirements-dev.txt .
RUN pip install -r requirements-dev.txt
COPY . .
CMD ["pytest", "-q"]

# Imagem final (a que o docker compose usa)
FROM base AS final
COPY alembic.ini ./
COPY migracoes ./migracoes
COPY ms_docs ./ms_docs
# Com pasta pessoal: o fontconfig (usado pelo WeasyPrint) guarda o cache das fontes em ~/.cache
RUN useradd --system --uid 10001 --create-home app
USER app
EXPOSE 8000
CMD ["python", "-m", "ms_docs"]

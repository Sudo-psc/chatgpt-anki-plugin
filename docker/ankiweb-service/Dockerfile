# syntax=docker/dockerfile:1
#
# Microsserviço "AnkiWeb como API": Anki headless (syncado à conta AnkiWeb)
# + AnkiConnect (somente 127.0.0.1) + o servidor MCP do chatgpt-anki-plugin,
# TUDO em uma máquina/imagem. Um processo de sync roda periodicamente.
#
# Por que assim (ADR-0009): o AnkiWeb não expõe API de dados; a forma suportada
# de ser independente de um Anki local é rodar o próprio cliente Anki (build
# oficial Linux) em headless, sincronizando com a conta AnkiWeb como qualquer
# outro dispositivo.
#
# Build (a partir da raiz do repo):
#   docker build -f docker/ankiweb-service/Dockerfile -t chatgpt-ankiweb-service .
# Run (dados do Anki persistem no volume /data):
#   docker run --rm -p 8080:8080 -v anki-data:/data \
#     -e TOKEN_SECRET="$(openssl rand -base64 48)" \
#     -e OWNER_PASSWORD="<mín. 12 caracteres>" \
#     -e ANKI_PROFILE="<seu perfil Anki>" \
#     chatgpt-ankiweb-service
#
# O perfil Anki (com a sessão AnkiWeb já autenticada) deve ser enviado para o
# volume antes do primeiro boot — ver README.md desta pasta.

# ---------- estágio 1: build do app TypeScript ----------
FROM node:22-bookworm-slim AS app-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---------- estágio 2: dependências de runtime do app ----------
FROM node:22-bookworm-slim AS app-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# ---------- estágio 3: runtime (Anki headless + node) ----------
FROM debian:bookworm-slim AS runtime
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl xz-utils zstd xvfb tini \
      libasound2 libdbus-1-3 libegl1 libfontconfig1 libfreetype6 libgbm1 libgl1 \
      libglib2.0-0 libnss3 libpulse0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 \
      libxcb-cursor0 libxcb-icccm4 libxcb-image0 libxcb-keysyms1 libxcb-randr0 \
      libxcb-render-util0 libxcb-shape0 libxcb-shm0 libxcb-sync1 libxcb-util1 \
      libxcb-xfixes0 libxcb-xinerama0 libxcb-xkb1 libxcomposite1 libxdamage1 \
      libxkbcommon0 libxkbcommon-x11-0 libxrandr2 libxrender1 libxi6 libxtst6 \
      fonts-noto-core fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

# Anki oficial (tar self-contained com Qt6). Arquitetura detectada via TARGETARCH.
ARG ANKI_VERSION=26.09.3
ARG TARGETARCH
RUN set -eu; \
    ARCH="${TARGETARCH:-$(dpkg --print-architecture)}"; \
    case "$ARCH" in \
      amd64) ANKI_ARCH=x86_64 ;; \
      arm64) ANKI_ARCH=aarch64 ;; \
      *) echo "Arquitetura não suportada: $ARCH" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/anki.tar.zst \
      "https://github.com/ankitects/anki/releases/download/${ANKI_VERSION}/anki-${ANKI_VERSION}-linux-${ANKI_ARCH}.tar.zst"; \
    mkdir -p /opt/anki; \
    tar --zstd -xf /tmp/anki.tar.zst -C /opt/anki --strip-components=1; \
    rm /tmp/anki.tar.zst; \
    test -x /opt/anki/anki

# AnkiConnect (FooSoft) pinado por commit — copiado para o volume no boot.
ARG ANKI_CONNECT_COMMIT=4064fa142785975255457abd6a496015f5b71f38
RUN mkdir -p /opt/anki-connect && \
    curl -fsSL "https://github.com/FooSoft/anki-connect/archive/${ANKI_CONNECT_COMMIT}.tar.gz" \
      | tar -xz -C /opt/anki-connect --strip-components=1 && \
    test -f /opt/anki-connect/plugin/__init__.py

# App (node + build + deps de produção)
COPY --from=app-build /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY --from=app-deps /app/node_modules ./node_modules
COPY --from=app-build /app/dist ./dist
COPY package.json ./package.json
COPY docker/ankiweb-service/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY docker/ankiweb-service/sync-once.sh /usr/local/bin/sync-once.sh
RUN chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/sync-once.sh

ENV ANKI_BASE=/data \
    ANKI_BACKEND=connect \
    ANKI_CONNECT_URL=http://127.0.0.1:8765 \
    PORT=8080 \
    HOST=0.0.0.0 \
    NODE_ENV=production \
    PYTHONUNBUFFERED=1

VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=5 \
  CMD curl -fsS http://127.0.0.1:8080/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]

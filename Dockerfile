FROM node:20-alpine

LABEL org.opencontainers.image.title="Wubu Unblocker" \
      org.opencontainers.image.description="Science for Kids - Web Proxy Service" \
      org.opencontainers.image.version="1.0.0"

WORKDIR /workspace

# Runtime/build deps for HF + Puppeteer.
RUN apk add --no-cache \
    bash \
    dos2unix \
    unzip \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Resolve Chromium path reliably across Alpine variants.
RUN CHROME_BIN="$(command -v chromium-browser || command -v chromium || true)" && \
    test -n "$CHROME_BIN" && \
    ln -sf "$CHROME_BIN" /usr/local/bin/chromium

ENV NODE_ENV=production \
    PORT=7860 \
    BLOOKET_PREWARM=false \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/local/bin/chromium

# HF zip deploy support:
# If app.zip exists, extract it; otherwise use repository contents directly.
COPY . /workspace
RUN if [ -f /workspace/app.zip ]; then \
      mkdir -p /app ; \
      unzip -q /workspace/app.zip -d /app ; \
      rc=$$? ; \
      if [ $$rc -ne 0 ] && [ $$rc -ne 1 ]; then exit $$rc; fi ; \
    else \
      mkdir -p /app && cp -a /workspace/. /app ; \
    fi

WORKDIR /app

# Normalize shell scripts copied from Windows environments.
RUN find . -name "*.sh" -type f -exec dos2unix {} \; 2>/dev/null || true

# Install deps, build dist assets, then drop dev deps.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
RUN npm run build
RUN npm prune --omit=dev && npm cache clean --force

EXPOSE 7860

CMD ["node", "src/server.mjs"]

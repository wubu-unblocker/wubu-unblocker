FROM node:20-alpine

LABEL org.opencontainers.image.title="Wubu Unblocker" \
      org.opencontainers.image.description="Educational web app" \
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

# Copy only files required for build/runtime.
COPY package.json package-lock.json ./
COPY src ./src
COPY views ./views
COPY scripts ./scripts
COPY YouTube-Clone ./YouTube-Clone
COPY run-command.mjs ./
COPY config.json ./
COPY ecosystem.config.js ./

WORKDIR /workspace

# Normalize shell scripts copied from Windows environments.
RUN find . -name "*.sh" -type f -exec dos2unix {} \; 2>/dev/null || true

# Install deps, build dist assets, then drop dev deps.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
RUN npm run build
RUN if [ -f YouTube-Clone/package-lock.json ]; then npm --prefix YouTube-Clone ci --include=dev; else npm --prefix YouTube-Clone install --include=dev; fi
RUN npm --prefix YouTube-Clone run build
RUN rm -rf YouTube-Clone/node_modules
RUN npm prune --omit=dev && npm cache clean --force

EXPOSE 7860

CMD ["node", "src/server.mjs"]
# HF refresh marker: 2026-03-12 WuTube backend update

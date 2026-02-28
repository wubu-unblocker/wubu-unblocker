FROM node:20-alpine

WORKDIR /app

LABEL org.opencontainers.image.title="Wubu Unblocker" \
      org.opencontainers.image.description="Science for Kids - Web Proxy Service" \
      org.opencontainers.image.version="1.0.0"

# Install required dependencies including Chromium for Puppeteer
RUN apk add --no-cache \
    tor \
    bash \
    dos2unix \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Tell Puppeteer to skip installing Chrome. We'll be using the installed package.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copy project directly (no app.zip extraction flow)
COPY . /app

# Fix Windows line endings in shell scripts
RUN find . -name "*.sh" -type f -exec dos2unix {} \; 2>/dev/null || true

# Install deps + build (requires dev deps like esbuild), then prune to reduce image size.
# Note: lib/rammerhead is a nested package with its own dependencies used during build.
RUN npm ci
RUN cd lib/rammerhead && npm ci
RUN npm run build
RUN npm prune --omit=dev
RUN cd lib/rammerhead && npm prune --omit=dev

# HuggingFace Spaces requires port 7860
ENV PORT=7860
EXPOSE 7860 9050 9051

# Start the server directly
CMD ["/bin/sh", "-c", "tor & exec node src/server.mjs"]

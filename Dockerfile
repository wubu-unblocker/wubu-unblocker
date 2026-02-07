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

COPY . .

# Fix Windows line endings in shell scripts
RUN find . -name "*.sh" -type f -exec dos2unix {} \; 2>/dev/null || true

RUN npm run fresh-install
RUN npm run build

# HuggingFace Spaces requires port 7860
ENV PORT=7860
EXPOSE 7860 9050 9051

# Start the server directly
CMD ["/bin/sh", "-c", "tor & exec node src/server.mjs"]

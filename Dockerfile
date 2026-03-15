FROM node:20-alpine

# Puppeteer için Chromium ve bağımlılıkları
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto-cjk \
    curl

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /root

COPY package*.json ./
RUN npm install

COPY . .

CMD ["node", "index.js"]

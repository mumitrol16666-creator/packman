# Один образ на всё: сервис статистики и отчётов, админка и сборка сайта.
# Сайт собирается при старте контейнера и после каждой публикации из админки,
# поэтому в образе лежат исходники и зависимости (Astro, sharp), а не готовый dist.
FROM node:24-bookworm-slim

ENV NODE_ENV=production \
    ASTRO_TELEMETRY_DISABLED=1 \
    PORT=8787 \
    DB_PATH=/app/data/analytics.db \
    BUILD_ON_START=1 \
    TRUST_PROXY=1

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

COPY . .
# Контент, фото, база и собранный сайт лежат в томах. Папки создаются заранее и принадлежат
# непривилегированному пользователю, чтобы тома унаследовали правильного владельца.
RUN mkdir -p data dist src/assets/events && chown -R node:node /app
USER node

EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]

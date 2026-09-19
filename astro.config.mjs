import { defineConfig } from 'astro/config';

// Боевой сайт собирается без переменных: домен pacman.kz, корень сайта.
// Превью на GitHub Pages задаёт SITE_URL и SITE_BASE в .github/workflows/preview.yml.
export default defineConfig({
  site: process.env.SITE_URL || 'https://pacman.kz',
  base: process.env.SITE_BASE || '/',
  trailingSlash: 'always',
  server: { port: 4321 },
});

import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://pacman.kz',
  trailingSlash: 'always',
  server: { port: 4321 },
});

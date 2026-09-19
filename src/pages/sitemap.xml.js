import branches from '../data/branches.json';
import { LANGS, langPrefix } from '../i18n/index.js';

export function GET({ site }) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const paths = ['/', ...branches.filter((b) => !b.hidden).map((b) => `/clubs/${b.slug}/`), '/privacy/'];
  const urls = paths
    .flatMap((path) =>
      LANGS.map((lang) => {
        const alternates = LANGS.map((code) => `<xhtml:link rel="alternate" hreflang="${code}" href="${new URL(base + langPrefix(code) + path, site)}"/>`).join('');
        return `  <url><loc>${new URL(base + langPrefix(lang) + path, site)}</loc>${alternates}</url>`;
      }),
    )
    .join('\n');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
}

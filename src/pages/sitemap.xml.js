import branches from '../data/branches.json';

export function GET({ site }) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const paths = ['/', ...branches.map((b) => `/clubs/${b.slug}/`)];
  const urls = paths.map((p) => `  <url><loc>${new URL(base + p, site)}</loc></url>`).join('\n');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}

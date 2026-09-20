// Картинка с прайсом клуба для сторис и постов (1080×1920) в стиле сайта.
// Запуск: node scripts/make-price-card.mjs batys   → price-cards/batys.png
// Данные берутся из src/data, поэтому картинка всегда совпадает с сайтом. Нужен установленный Google Chrome.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = new URL('..', import.meta.url).pathname;
const slug = process.argv[2];
const branches = JSON.parse(readFileSync(join(root, 'src/data/branches.json'), 'utf8'));
const site = JSON.parse(readFileSync(join(root, 'src/data/site.json'), 'utf8'));
const branch = branches.find((b) => b.slug === slug);
if (!branch) {
  console.error(`Укажите клуб: ${branches.map((b) => b.slug).join(', ')}`);
  process.exit(1);
}

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const outDir = join(root, 'price-cards');
mkdirSync(outDir, { recursive: true });

const fileUrl = (path) => pathToFileURL(join(root, path)).href;
const price = (n) => n.toLocaleString('ru-RU');
const photoDir = join(root, 'src/assets/photos', slug);
const photo = existsSync(photoDir) ? readdirSync(photoDir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort()[0] : null;
const short = (text) => text.replace('GeForce ', '').replace('Intel Core ', '').replace('AMD ', '');
// чем больше залов, тем плотнее вёрстка
const dense = branch.zones.length > 2;

const zoneHtml = (z) => `
  <section class="zone">
    <header>
      <div><h2>${z.name}</h2><p class="hz">${z.hz}</p></div>
      <p class="specs">${short(z.specs.gpu)}<br>${short(z.specs.cpu)} · ${z.specs.ram}</p>
    </header>
    <div class="hours">
      ${[['1 час', z.prices.h1], ['3 часа', z.prices.h3], ['5 часов', z.prices.h5]].map(([l, v]) => `<div><span>${l}</span><b>${price(v)}</b></div>`).join('')}
    </div>
    <ul>
      ${site.packages.map((p) => `<li><span class="pn">${p.name}</span><span class="pt">${p.from}–${p.to}</span><b>${price(z.prices[p.id])}</b></li>`).join('')}
    </ul>
  </section>`;

const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>
@font-face { font-family: Oswald; font-weight: 200 700; src: url('${fileUrl('node_modules/@fontsource-variable/oswald/files/oswald-cyrillic-wght-normal.woff2')}') format('woff2'); unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
@font-face { font-family: Oswald; font-weight: 200 700; src: url('${fileUrl('node_modules/@fontsource-variable/oswald/files/oswald-latin-wght-normal.woff2')}') format('woff2'); }
@font-face { font-family: Onest; font-weight: 100 900; src: url('${fileUrl('node_modules/@fontsource-variable/onest/files/onest-cyrillic-wght-normal.woff2')}') format('woff2'); unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
@font-face { font-family: Onest; font-weight: 100 900; src: url('${fileUrl('node_modules/@fontsource-variable/onest/files/onest-latin-wght-normal.woff2')}') format('woff2'); }
* { box-sizing: border-box; margin: 0; }
body { width: 1080px; height: 1920px; overflow: hidden; background: #07090c; color: #f7f7f4; font-family: Onest, sans-serif; --accent: ${branch.accent}; --accent-text: color-mix(in srgb, ${branch.accent} 68%, #fff); }
.hero { position: relative; height: ${dense ? 420 : 520}px; padding: 56px 64px 0; ${photo ? `background: url('${fileUrl(`src/assets/photos/${slug}/${photo}`)}') center/cover;` : `background: radial-gradient(circle, color-mix(in srgb, var(--accent) 50%, transparent) 3px, transparent 4px) 0 0 / 36px 36px, linear-gradient(135deg, color-mix(in srgb, var(--accent) 30%, #07090c), #07090c 70%);`} border-bottom: 6px solid var(--accent); }
.hero::before { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(7,9,12,.92), rgba(7,9,12,.55)), linear-gradient(180deg, transparent 40%, rgba(7,9,12,.9)); }
.hero > * { position: relative; }
.logo { width: 300px; display: block; }
.eyebrow { margin-top: ${dense ? 26 : 50}px; font: 500 30px Oswald; letter-spacing: .16em; text-transform: uppercase; color: #fff200; }
h1 { font: 700 ${dense ? 120 : 150}px/0.95 Oswald; text-transform: uppercase; color: var(--accent-text); }
h1 span { color: #f7f7f4; font-weight: 500; font-size: .5em; letter-spacing: .06em; display: block; margin-bottom: 6px; }
main { padding: ${dense ? 28 : 40}px 48px 0; display: grid; grid-template-columns: ${dense ? '1fr' : '1fr 1fr'}; gap: ${dense ? 20 : 24}px; }
.zone { position: relative; background: #111317; border: 2px solid rgba(247,247,244,.1); border-radius: 28px; padding: ${dense ? '20px 30px 16px' : '34px 30px 26px'}; overflow: hidden; ${dense ? 'display: grid; grid-template-columns: 260px 225px 1fr; gap: 0 28px; align-items: center;' : ''} }
.zone::before { content: ''; position: absolute; inset: 0 0 auto; height: 6px; background: var(--accent); }
.zone header { ${dense ? '' : 'display: flex; flex-direction: column; gap: 14px; min-height: 190px;'} }
h2 { font: 650 ${dense ? 46 : 54}px/1 Oswald; text-transform: uppercase; }
.hz { margin-top: 8px; font: 500 ${dense ? 30 : 34}px Oswald; letter-spacing: .04em; color: var(--accent-text); }
.specs { ${dense ? 'margin-top: 12px;' : ''} font-size: ${dense ? 22 : 25}px; line-height: 1.35; color: #9a9da3; }
.hours { display: grid; grid-template-columns: ${dense ? '1fr' : 'repeat(3, 1fr)'}; gap: 10px; ${dense ? '' : 'margin: 22px 0 8px;'} }
.hours div { background: #191c22; border-radius: 16px; padding: ${dense ? '6px 16px; display: flex; justify-content: space-between; align-items: baseline;' : '14px 12px 12px;'} }
.hours span { display: block; font-size: ${dense ? 24 : 22}px; color: #9a9da3; }
.hours b { font: 600 ${dense ? 34 : 46}px/1.1 Oswald; }
ul { list-style: none; padding: 0; }
li { display: grid; grid-template-columns: ${dense ? 'auto 1fr auto' : '1fr auto'}; column-gap: 14px; align-items: baseline; padding: ${dense ? 5 : 24}px 0; border-bottom: 2px solid rgba(247,247,244,.1); }
li:last-child { border-bottom: 0; }
.pn { white-space: nowrap; font-weight: 600; font-size: ${dense ? 27 : 31}px; }
.pt { grid-column: ${dense ? 2 : 1}; font-size: ${dense ? 20 : 23}px; white-space: nowrap; color: #9a9da3; font-variant-numeric: tabular-nums; }
li b { grid-column: ${dense ? 3 : 2}; grid-row: ${dense ? '1' : '1 / 3'}; align-self: center; font: 600 ${dense ? '34px/1.15' : '44px/1.3'} Oswald; }
.ps { margin: ${dense ? 20 : 24}px 48px 0; background: #111317; border: 2px solid rgba(247,247,244,.1); border-radius: 28px; padding: 22px 30px; display: grid; grid-template-columns: 1.2fr repeat(3, 1fr); gap: 8px 12px; align-items: baseline; }
.ps h2 { font-size: 40px; }
.ps .th { font-size: 22px; color: #9a9da3; text-align: right; }
.ps .name { font-size: 26px; }
.ps b { font: 600 40px Oswald; text-align: right; }
footer { position: absolute; left: 48px; right: 48px; bottom: 44px; display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; }
.addr { font-size: 28px; line-height: 1.35; }
.addr b { display: block; font: 600 40px Oswald; letter-spacing: .04em; text-transform: uppercase; color: #fff200; }
.note { max-width: 420px; text-align: right; font-size: 22px; line-height: 1.35; color: #9a9da3; }
.cur { font-family: Onest; font-weight: 500; font-size: .6em; opacity: .7; margin-left: 4px; }
</style></head><body>
<div class="hero">
  <img class="logo" src="${fileUrl('src/assets/logo/lockup.png')}" alt="">
  <p class="eyebrow">›› Прайс · цены в тенге</p>
  <h1><span>Pacman</span>${branch.name}</h1>
</div>
<main>${branch.zones.map(zoneHtml).join('')}</main>
${branch.consoles.length ? `<div class="ps"><h2>PlayStation 5</h2><span class="th">1 час</span><span class="th">3 часа</span><span class="th">5 часов</span>
  ${branch.consoles.map((c) => `<span class="name">${c.name.replace('PS5 · ', '').replace('PlayStation 5', 'Приставка')}</span><b>${price(c.prices.h1)}</b><b>${price(c.prices.h3)}</b><b>${price(c.prices.h5)}</b>`).join('')}</div>` : ''}
<footer>
  <p class="addr"><b>Круглосуточно</b>${branch.address}<br>WhatsApp +${branch.whatsapp.replace(/^(\d)(\d{3})(\d{3})(\d{2})(\d{2})$/, '$1 $2 $3 $4 $5')}</p>
  <p class="note">${site.packageNote}</p>
</footer>
</body></html>`;

const htmlPath = join(outDir, `${slug}.html`);
const pngPath = join(outDir, `${slug}.png`);
writeFileSync(htmlPath, html);
execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1080,1920', '--virtual-time-budget=4000', `--screenshot=${pngPath}`, pathToFileURL(htmlPath).href], { stdio: 'ignore' });
console.log(`✓ ${pngPath}`);

// Картинки для превью ссылок (WhatsApp, Telegram, Instagram): фото клуба, затемнение и логотип.
// Запуск: npm run og. Результат лежит в public/og/ и коммитится в репозиторий.
import { readdirSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const W = 1200;
const H = 630;
const root = new URL('..', import.meta.url).pathname;
const photosDir = join(root, 'src/assets/photos');
const outDir = join(root, 'public/og');
const logo = join(root, 'src/assets/logo/lockup.png');
const branches = JSON.parse(readFileSync(join(root, 'src/data/branches.json'), 'utf8'));

mkdirSync(outDir, { recursive: true });

const shade = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#07090c" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#07090c" stop-opacity="0.88"/>
    </linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
  </svg>`,
);

async function make(photo, out, accent) {
  const logoBuf = await sharp(logo).resize({ width: 640 }).toBuffer();
  const { height: logoH } = await sharp(logoBuf).metadata();
  const bar = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="10"><rect width="${W}" height="10" fill="${accent}"/></svg>`);
  await sharp(photo)
    .resize(W, H, { fit: 'cover', position: 'attention' })
    .composite([
      { input: shade },
      { input: logoBuf, left: Math.round((W - 640) / 2), top: Math.round((H - logoH) / 2) },
      { input: bar, left: 0, top: H - 10 },
    ])
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(out);
  console.log('✓', out.replace(root, ''));
}

const firstPhoto = (slug) => {
  const dir = join(photosDir, slug);
  if (!existsSync(dir)) return null;
  const file = readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort()[0];
  return file ? join(dir, file) : null;
};

await make(firstPhoto('batys') ?? branches.map((b) => firstPhoto(b.slug)).find(Boolean), join(outDir, 'home.jpg'), '#fff200');
for (const b of branches) {
  const photo = firstPhoto(b.slug);
  const out = join(outDir, `${b.slug}.jpg`);
  if (photo) await make(photo, out, b.accent);
  // у клуба удалили все фото: старая картинка превью больше не нужна, сайт возьмёт общую
  else rmSync(out, { force: true });
}

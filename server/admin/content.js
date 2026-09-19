import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FILES = { branches: 'src/data/branches.json', site: 'src/data/site.json', events: 'src/data/events.json' };
const KEEP_BACKUPS = 30;

/** Контент сайта — JSON-файлы в репозитории. Админка правит их на месте, а сайт собирается из них же. */
export function createContentStore(projectRoot, backupsDir) {
  const pathOf = (name) => {
    if (!FILES[name]) throw new Error(`Неизвестный раздел контента: ${name}`);
    return join(projectRoot, FILES[name]);
  };

  function read(name) {
    return JSON.parse(readFileSync(pathOf(name), 'utf8'));
  }

  /** Перед записью старая версия уходит в резервные копии; запись атомарная, чтобы сборка не увидела половину файла. */
  function write(name, data) {
    const target = pathOf(name);
    mkdirSync(backupsDir, { recursive: true });
    if (existsSync(target)) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      writeFileSync(join(backupsDir, `${name}-${stamp}.json`), readFileSync(target));
      const old = readdirSync(backupsDir).filter((f) => f.startsWith(`${name}-`)).sort();
      for (const file of old.slice(0, Math.max(0, old.length - KEEP_BACKUPS))) unlinkSync(join(backupsDir, file));
    }
    const temp = `${target}.tmp`;
    writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`);
    renameSync(temp, target);
  }

  return { read, write, names: Object.keys(FILES) };
}

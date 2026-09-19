import { spawn } from 'node:child_process';
import { cpSync, existsSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const BUILD_TIMEOUT_MS = 5 * 60 * 1000;

/** Все файлы папки относительными путями. */
function walk(dir, base = dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full, base) : [relative(base, full)];
  });
}

/**
 * Публикация изменений: сайт собирается в соседнюю папку и подменяет рабочую только при успешной сборке.
 * Если сборка упала, посетители продолжают видеть прежнюю версию, а админка показывает ошибку.
 */
export function createBuilder({ projectRoot, siteDir, run = runCommand, log = console.log }) {
  const nextDir = `${siteDir}.next`;
  const state = { status: 'idle', startedAt: null, finishedAt: null, error: null, pending: false, regenerateOg: false };

  function publish() {
    try {
      // быстрая подмена переименованием
      const oldDir = `${siteDir}.old`;
      rmSync(oldDir, { recursive: true, force: true });
      if (existsSync(siteDir)) renameSync(siteDir, oldDir);
      renameSync(nextDir, siteDir);
      rmSync(oldDir, { recursive: true, force: true });
    } catch {
      // папка сайта может быть точкой монтирования Docker: её нельзя переименовать, поэтому содержимое копируется поверх
      cpSync(nextDir, siteDir, { recursive: true, force: true });
      const fresh = new Set(walk(nextDir));
      for (const file of walk(siteDir)) if (!fresh.has(file)) rmSync(join(siteDir, file), { force: true });
      rmSync(nextDir, { recursive: true, force: true });
    }
  }

  async function build() {
    state.status = 'building';
    state.startedAt = Date.now();
    state.error = null;
    const withOg = state.regenerateOg;
    state.regenerateOg = false;
    try {
      rmSync(nextDir, { recursive: true, force: true });
      if (withOg) await run(process.execPath, ['scripts/make-og.mjs'], projectRoot);
      await run(process.execPath, [join('node_modules', 'astro', 'bin', 'astro.mjs'), 'build', '--outDir', nextDir], projectRoot);
      publish();
      state.status = 'idle';
      log(`[admin] сайт опубликован за ${((Date.now() - state.startedAt) / 1000).toFixed(1)} с`);
    } catch (error) {
      state.status = 'error';
      state.error = String(error.message || error).slice(-3000);
      log(`[admin] сборка не удалась: ${state.error.split('\n').slice(-3).join(' ')}`);
    }
    state.finishedAt = Date.now();
    if (state.pending) {
      state.pending = false;
      build();
    }
  }

  return {
    /** Изменения, пришедшие во время сборки, не теряются: после неё запускается ещё одна. */
    request({ photosChanged = false } = {}) {
      if (photosChanged) state.regenerateOg = true;
      if (state.status === 'building') state.pending = true;
      else build();
    },
    status() {
      return { status: state.status, startedAt: state.startedAt, finishedAt: state.finishedAt, error: state.error, pending: state.pending };
    },
  };
}

function runCommand(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', FORCE_COLOR: '0' } });
    let output = '';
    const collect = (chunk) => {
      output = (output + chunk).slice(-8000);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    const timer = setTimeout(() => child.kill('SIGKILL'), BUILD_TIMEOUT_MS);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolvePromise(output);
      else reject(new Error(output || `Команда завершилась с кодом ${code}`));
    });
  });
}

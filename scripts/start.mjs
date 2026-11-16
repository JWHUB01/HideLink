#!/usr/bin/env node
/**
 * One-command start: `pnpm start` or a double-click on `ЗАПУСТИТЬ.bat`.
 *
 * `pnpm dev` works, but it assumes the terminal is already in the repository root, that
 * the right Node.js is on `PATH`, and that the owner remembers where the project lives.
 * This script removes those three assumptions: it finds its own repository root, checks
 * the Node.js version the project asks for, warns when `.env` is missing, and then runs
 * `pnpm dev` in place, streaming its output.
 *
 * It deliberately does *not* run `pnpm setup`. Setup mutates the database and installs
 * dependencies; a launcher that does that silently would be a trap the first time it is
 * pressed by accident. When something is genuinely missing, the script says which command
 * to run instead of guessing.
 *
 * Stopping: close the window, or press Ctrl+C. `turbo` forwards both to the API and the
 * web server, so nothing is left listening on 3000/3001.
 *
 * Usage:
 *   ЗАПУСТИТЬ.bat            # double-click on Windows
 *   pnpm start               # from the repository root
 *   node scripts/start.mjs   # directly
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import process from 'node:process';

import { ENV_PATH, REPO_ROOT, compareVersions, parseMinimumVersion, readJson } from './lib/env.mjs';

const WEB_URL = 'http://localhost:3000';
const API_HEALTH_URL = 'http://127.0.0.1:3001/api/v1/health/ready';

/**
 * Keeps the window open after an error.
 *
 * A double-clicked `.bat` closes its console the moment the process exits, which turns
 * every failure into a flash of text nobody can read. The caller sets `PAUSE_ON_ERROR=1`
 * for that case; the terminal keeps its own scrollback, so it does not need it.
 */
function pauseOnError() {
  if (process.env.PAUSE_ON_ERROR !== '1') return;
  process.stdout.write('\nНажмите Enter, чтобы закрыть окно…');
  try {
    spawnSync('cmd', ['/c', 'pause'], { stdio: 'inherit' });
  } catch {
    // The window closing early is not worth an error of its own.
  }
}

function fail(message, hint) {
  console.error(`\nОШИБКА: ${message}`);
  if (hint) console.error(hint);
  console.error('\nПолная диагностика: pnpm diagnose');
  pauseOnError();
  process.exit(1);
}

console.log('AnonLink — запуск');
console.log(`Папка проекта: ${REPO_ROOT}`);

// --- 1. Node -----------------------------------------------------------------
const pkg = readJson('package.json');
const minimum = parseMinimumVersion(pkg.engines?.node);
const nodeVersion = process.versions.node;

if (
  minimum &&
  compareVersions(nodeVersion, `${minimum.major}.${minimum.minor}.${minimum.patch}`) < 0
) {
  fail(
    `нужен Node.js ${pkg.engines.node}, установлен ${nodeVersion}`,
    'Установите подходящую версию с https://nodejs.org и запустите файл снова.',
  );
}

// --- 2. Configuration and dependencies ---------------------------------------
if (!existsSync(ENV_PATH)) {
  fail(
    'файл .env не найден — без него приложение не узнает, к какой базе подключаться',
    'Создайте его командой: pnpm setup   (или скопируйте .env.example в .env)',
  );
}

if (!existsSync(`${REPO_ROOT}/node_modules`)) {
  fail(
    'зависимости не установлены (нет папки node_modules)',
    'Установите их командой: pnpm install   (или сразу pnpm setup)',
  );
}

// --- 3. Is something already running? ----------------------------------------
/*
 * Starting a second copy would fail with "port already in use", which reads like a
 * broken project rather than like "it is already running". Saying so, and printing the
 * address, is the whole fix.
 */
async function alreadyRunning() {
  try {
    const response = await fetch(API_HEALTH_URL, { signal: AbortSignal.timeout(1_500) });
    return response.ok;
  } catch {
    return false;
  }
}

if (await alreadyRunning()) {
  console.log('\nПриложение уже запущено.');
  console.log(`Откройте: ${WEB_URL}`);
  process.stdout.write(`\n${WEB_URL}\n`);
  pauseOnError();
  process.exit(0);
}

// --- 4. Start ----------------------------------------------------------------
console.log('\nЗапускаю API (:3001) и веб-интерфейс (:3000)…');
console.log(`Когда увидите «Ready», откройте: ${WEB_URL}`);
console.log('Остановить: Ctrl+C или закрыть это окно.\n');

/*
 * `pnpm` is a `.cmd` shim on Windows, so it needs a shell; `stdio: 'inherit'` keeps the
 * familiar turbo/nest/next output in this same window, and Ctrl+C reaches the child as it
 * would have without this script.
 */
const result = spawnSync('pnpm', ['dev'], {
  cwd: REPO_ROOT,
  stdio: 'inherit',
  shell: true,
});

if (result.error) {
  fail(
    `не удалось запустить pnpm: ${result.error.message}`,
    'Проверьте, что pnpm установлен: pnpm --version',
  );
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

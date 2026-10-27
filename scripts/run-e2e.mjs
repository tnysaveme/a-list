import { spawn } from 'node:child_process';
import { mkdtemp, cp, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
// Build from an explicit source allowlist: Next must never auto-load the checkout's .env.local.
const fixtureRoot = await mkdtemp(join(tmpdir(), 'alist-browser-'));
for (const dir of ['app', 'components', 'db', 'hooks', 'lib', 'public', 'tests', 'scripts'])
  await cp(dir, join(fixtureRoot, dir), { recursive: true });
for (const file of [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'next.config.ts',
  'postcss.config.mjs',
  'tokens.css',
  'eslint.config.mjs',
])
  await cp(file, join(fixtureRoot, file));
await symlink(resolve('node_modules'), join(fixtureRoot, 'node_modules'), 'dir');
const safeKeys = ['PATH', 'HOME', 'TMPDIR', 'LANG', 'SystemRoot'];
const env = Object.fromEntries(
  safeKeys.filter((k) => process.env[k]).map((k) => [k, process.env[k]]),
);
Object.assign(env, {
  NODE_ENV: 'production',
  ALIST_BUILD_OUTPUT: 'e2e',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:4318',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'fixture-publishable',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture-service',
  UPSTASH_REDIS_REST_URL: 'http://127.0.0.1:4318/redis',
  UPSTASH_REDIS_REST_TOKEN: 'fixture',
  ALIST_KEY_SALT: 'fixture-salt',
  ALIST_ALLOWED_EMAIL: 'fixture@example.invalid',
  ALIST_ALLOW_SIGNUPS: 'false',
  ALIST_APP_URL: 'http://127.0.0.1:4317',
  ALIST_WTS_AUTO_IMPORT: 'false',
});
const children = [];
let stopping = false;
function run(args) {
  const child = spawn(process.execPath, args, { env, cwd: fixtureRoot, stdio: 'inherit' });
  children.push(child);
  return child;
}
async function stop() {
  if (stopping) return;
  stopping = true;
  const active = children.filter((child) => child.exitCode === null);
  for (const child of active) child.kill('SIGTERM');
  await Promise.race([
    Promise.all(active.map((child) => new Promise((resolve) => child.once('exit', resolve)))),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);
  for (const child of active) if (child.exitCode === null) child.kill('SIGKILL');
  await rm(fixtureRoot, { recursive: true, force: true });
}
process.on('SIGTERM', () => {
  void stop().finally(() => process.exit(0));
});
process.on('SIGINT', () => {
  void stop().finally(() => process.exit(0));
});
const build = run(['node_modules/next/dist/bin/next', 'build', '--webpack']);
const code = await new Promise((resolve) => build.once('exit', resolve));
if (code !== 0) {
  await stop();
  process.exit(code || 1);
}
run(['--import', 'tsx', 'tests/e2e/providers.ts']);
const app = run([
  '--import',
  './tests/e2e/network.mjs',
  'node_modules/next/dist/bin/next',
  'start',
  '--hostname',
  '127.0.0.1',
  '--port',
  '4317',
]);
app.once('exit', (code) => {
  void stop().finally(() => process.exit(code || 0));
});

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

// Unit tests run during production builds too. Never give them provider credentials
// or platform switches: fake upstreams must behave the same on every machine.
const systemKeys = [
  'PATH',
  'HOME',
  'USERPROFILE',
  'TMPDIR',
  'TEMP',
  'TMP',
  'SystemRoot',
  'WINDIR',
  'COMSPEC',
  'LANG',
  'LC_ALL',
  'TZ',
  'NODE_PATH',
];
const env = Object.fromEntries(
  systemKeys.filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]]),
);
const files = readdirSync('tests')
  .filter((file) => file.endsWith('.test.ts'))
  .sort()
  .map((file) => `tests/${file}`);
const result = spawnSync(
  process.execPath,
  ['--import', 'tsx', '--import', './tests/setup.mjs', '--test', ...files],
  {
    env: { ...env, NODE_ENV: 'test' },
    stdio: 'inherit',
  },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);

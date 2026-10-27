import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    'dist/**',
    '.next-e2e/**',
    'test-results/**',
    'playwright-report/**',
    '.vinext/**',
    '.wrangler/**',
    '.sites-runtime/**',
    'outputs/**',
    'work/**',
  ]),
]);

export default eslintConfig;

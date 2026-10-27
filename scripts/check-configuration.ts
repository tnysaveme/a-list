import { existsSync } from 'node:fs';
import { configurationStatus } from '../lib/configuration';
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const status = configurationStatus();
for (const [capability, missing] of Object.entries(status))
  console.log(JSON.stringify({ capability, configured: !(missing as string[]).length, missing }));
if ((status.api as string[]).length || (status.sources as string[]).length) process.exitCode = 1;

export type Capability = 'auth' | 'api' | 'sources' | 'jobs';
const requirements = {
  auth: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'],
  api: [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    'ALIST_KEY_SALT',
  ],
  sources: [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    'ALIST_KEY_SALT',
  ],
  jobs: [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    'ALIST_KEY_SALT',
    'ALIST_APP_URL',
    'QSTASH_CURRENT_SIGNING_KEY',
    'QSTASH_NEXT_SIGNING_KEY',
  ],
} as const;
export class ConfigurationError extends Error {
  constructor(readonly missing: readonly string[]) {
    super(`Missing configuration: ${missing.join(', ')}`);
    this.name = 'ConfigurationError';
  }
}
export function requireConfiguration(
  capability: Capability,
  env: Record<string, string | undefined> = process.env,
) {
  const missing = requirements[capability].filter((key) => !env[key]?.trim());
  if (missing.length) throw new ConfigurationError(missing);
}
export function configurationStatus(env: Record<string, string | undefined> = process.env) {
  return Object.fromEntries(
    Object.keys(requirements).map((key) => {
      try {
        requireConfiguration(key as Capability, env);
        return [key, []];
      } catch (error) {
        return [key, (error as ConfigurationError).missing];
      }
    }),
  );
}

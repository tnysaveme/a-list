import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { sealRecovery, openRecovery } from '../lib/recovery-envelope.mjs';
import { resolve, basename } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { PGlite } from '@electric-sql/pglite';
import { readdir } from 'node:fs/promises';
const root = resolve('outputs/recovery'),
  keyPath = resolve(root, 'recovery.key');
const tables = {
  a_list_accounts: ['id'],
  a_list_movies: ['id'],
  a_list_library: ['user_id', 'movie_id'],
  a_list_source_cache: ['user_id', 'key'],
  a_list_source_status: ['id'],
  a_list_release_candidates: ['source_id'],
  a_list_release_reviews: ['id'],
};
async function verify(backup) {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;alter default privileges in schema public grant all on tables to service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`,
    );
    for (const name of (await readdir('supabase/migrations'))
      .filter((n) => n.endsWith('.sql'))
      .sort())
      await db.exec(await readFile('supabase/migrations/' + name, 'utf8'));
    const owners = new Set(
      [
        ...backup.tables.a_list_accounts.map((row) => row.id),
        ...backup.tables.a_list_library.map((row) => row.user_id),
        ...backup.tables.a_list_source_cache.map((row) => row.user_id),
        ...backup.tables.a_list_release_reviews.map((row) => row.reviewer_id),
      ].filter(Boolean),
    );
    for (const id of owners)
      await db.query('insert into auth.users values($1) on conflict do nothing', [id]);
    await db.exec('delete from public.a_list_source_status;set role service_role');
    const counts = {};
    for (const table of Object.keys(tables)) {
      const columns = new Set(
        (
          await db.query(
            'select column_name from information_schema.columns where table_schema=$1 and table_name=$2',
            ['public', table],
          )
        ).rows.map((row) => row.column_name),
      );
      for (const row of backup.tables[table]) {
        const keys = Object.keys(row);
        if (keys.some((key) => !columns.has(key) || !/^\w+$/.test(key)))
          throw Error('Unexpected backup column');
        await db.query(
          `insert into public.${table}(${keys.map((key) => '"' + key + '"').join(',')}) values(${keys.map((_, i) => '$' + (i + 1)).join(',')})`,
          keys.map((key) =>
            typeof row[key] === 'object' && row[key] !== null ? JSON.stringify(row[key]) : row[key],
          ),
        );
      }
      counts[table] = Number(
        (await db.query(`select count(*) as total from public.${table}`)).rows[0].total,
      );
      if (counts[table] !== backup.tables[table].length) throw Error('Restore count mismatch');
    }
    return counts;
  } finally {
    await db.close();
  }
}
const mode = process.argv[2];
let stage = 'initialization';
try {
  if (mode === 'create') {
    if (existsSync('.env.local')) process.loadEnvFile('.env.local');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
      key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw Error('Supabase URL and service role key are required');
    stage = 'read-only export';
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    async function rows(table, columns = '*') {
      let values = [];
      for (let offset = 0; ; offset += 500) {
        let query = db
          .from(table)
          .select(columns)
          .range(offset, offset + 499)
          .abortSignal(AbortSignal.timeout(10000));
        for (const column of tables[table]) query = query.order(column);
        const result = await query;
        if (result.error) throw Error('Backup query failed for ' + table);
        values.push(...result.data);
        if (result.data.length < 500) return values;
      }
    }
    const manifest = async () =>
      JSON.stringify([
        await rows('a_list_accounts', 'id,calendar_revision'),
        await rows('a_list_movies', 'id,updated_at'),
      ]);
    let backup;
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = await manifest();
      const data = {};
      for (const table of Object.keys(tables)) data[table] = await rows(table);
      if (before === (await manifest())) {
        backup = {
          schemaVersion: 1,
          createdAt: new Date().toISOString(),
          scope:
            'Application rows only; Supabase Auth identities/settings, storage, credentials and sessions are not included',
          tables: data,
        };
        break;
      }
    }
    if (!backup) throw Error('Application changed during export; retry during a quiet interval');
    stage = 'isolated restore drill';
    const counts = await verify(backup);
    await mkdir(root, { recursive: true, mode: 0o700 });
    if (!existsSync(keyPath))
      await writeFile(keyPath, randomBytes(32), { mode: 0o600, flag: 'wx' });
    const encryptionKey = await readFile(keyPath);
    if (encryptionKey.length !== 32) throw Error('Invalid recovery key');
    const file = resolve(
      root,
      `application-${new Date().toISOString().replace(/[:.]/g, '-')}.alist`,
    );
    await writeFile(file, sealRecovery(backup, encryptionKey), { mode: 0o600, flag: 'wx' });
    console.log(
      JSON.stringify({
        event: 'application_backup_verified',
        file: basename(file),
        counts,
        scope: backup.scope,
      }),
    );
  } else if (mode === 'self-test') {
    const owner = '11111111-1111-4111-8111-111111111111',
      movie = {
        id: '1',
        title: 'Recovery fixture',
        year: '2026',
        source: 'https://example.invalid',
        poster: '',
        checkedAt: new Date().toISOString(),
        releases: [],
      };
    const data = Object.fromEntries(Object.keys(tables).map((table) => [table, []]));
    data.a_list_accounts = [{ id: owner }];
    data.a_list_movies = [{ id: '1', movie }];
    data.a_list_library = [{ user_id: owner, movie_id: '1', movie, tracked: true }];
    data.a_list_source_status = [{ id: true }];
    console.log(
      JSON.stringify({
        event: 'application_restore_fixture_verified',
        counts: await verify(
          openRecovery(sealRecovery({ tables: data }, Buffer.alloc(32, 7)), Buffer.alloc(32, 7)),
        ),
      }),
    );
  } else if (mode === 'verify') {
    const name = process.argv[3];
    if (!name || basename(name) !== name)
      throw Error('Pass the backup filename from outputs/recovery');
    const data = await readFile(resolve(root, name));
    const backup = openRecovery(data, await readFile(keyPath));
    if (backup.schemaVersion !== 1) throw Error('Unsupported backup version');
    console.log(
      JSON.stringify({
        event: 'application_restore_verified',
        counts: await verify(backup),
        scope: backup.scope,
      }),
    );
  } else
    throw Error(
      'Use create, self-test or verify <filename>. Restore drills always use disposable in-memory Postgres.',
    );
} catch {
  console.error(JSON.stringify({ event: 'application_backup_failed', stage }));
  process.exitCode = 1;
}

import { spawnSync } from 'node:child_process';

const urbanexDatabaseUrl = String(process.env.URBANEX_DATABASE_URL || '').trim();

if (!urbanexDatabaseUrl) {
  console.error('URBANEX_DATABASE_URL is required to deploy Prisma migrations to urbanex_ai.');
  process.exit(1);
}

const result = spawnSync(
  'npx',
  ['prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: urbanexDatabaseUrl,
    },
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);

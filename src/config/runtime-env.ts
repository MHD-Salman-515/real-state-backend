import * as dotenv from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

export type AppNodeEnv = 'development' | 'production' | 'test';

export function getNodeEnv(): AppNodeEnv {
  const normalized = String(process.env.NODE_ENV || 'development')
    .trim()
    .toLowerCase();

  if (normalized === 'production') return 'production';
  if (normalized === 'test') return 'test';
  return 'development';
}

export function isProduction(): boolean {
  return getNodeEnv() === 'production';
}

export function loadLocalEnvFiles(): void {
  if (isProduction()) {
    return;
  }

  for (const file of ['.env', '.env.local']) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) {
      continue;
    }
    dotenv.config({ path, override: false });
  }
}

export function parseBooleanEnv(value: string | undefined, fallback = false): boolean {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();

  if (!normalized) {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

export function parseCorsOrigins(value: string | undefined): string[] {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getListenPort(): number {
  const rawPort = Number(process.env.PORT ?? 3000);
  const port = Number.isFinite(rawPort) && rawPort > 0 ? rawPort : 3000;
  return isProduction() ? port : 3000;
}

export function getRequiredRuntimeEnvVars(): string[] {
  return ['DATABASE_URL', 'URBANEX_DATABASE_URL'];
}

export function getMissingRuntimeEnvVars(): string[] {
  return getRequiredRuntimeEnvVars().filter((name) => !String(process.env[name] || '').trim());
}

loadLocalEnvFiles();

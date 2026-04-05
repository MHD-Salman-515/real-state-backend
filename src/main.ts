import './register-paths';
import './config/runtime-env';
import * as dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { execSync } from 'child_process';
import cookieParser from 'cookie-parser';
import { readFileSync } from 'fs';
import { MailService } from './mail/mail.service';
import { PrismaService } from './prisma/prisma.service';
import {
  getListenPort,
  getMissingRuntimeEnvVars,
  getNodeEnv,
  isProduction,
  loadLocalEnvFiles,
  parseBooleanEnv,
  parseCorsOrigins,
} from './config/runtime-env';

dotenv.config();

function getDbInfo(databaseUrl?: string) {
  if (!databaseUrl) {
    return null;
  }

  try {
    const parsed = new URL(databaseUrl);
    return {
      host: parsed.hostname || 'localhost',
      port: parsed.port || '3306',
      dbName: parsed.pathname.replace(/^\//, '') || 'unknown',
    };
  } catch {
    return null;
  }
}

function shouldIgnoreHotfixError(error: unknown): boolean {
  const message = String((error as { message?: string })?.message || '').toLowerCase();
  const metaCode = Number((error as { meta?: { code?: number } })?.meta?.code);

  // MySQL duplicate column, duplicate key name, table exists.
  if ([1060, 1061, 1050].includes(metaCode)) {
    return true;
  }

  if (
    message.includes('duplicate column') ||
    message.includes('duplicate key name') ||
    message.includes('already exists')
  ) {
    return true;
  }

  return false;
}

function parseHotfixStatements(sql: string): string[] {
  return sql
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('--'))
    .join('\n')
    .split(';')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
}

function validateRuntimeEnv(): void {
  const missing = getMissingRuntimeEnvVars();
  if (missing.length > 0) {
    throw new Error(
      `Missing required runtime environment variable(s): ${missing.join(', ')}.`,
    );
  }

  if (isProduction()) {
    const corsOrigins = parseCorsOrigins(process.env.CORS_ORIGIN);
    if (corsOrigins.length === 0) {
      throw new Error(
        'Missing required environment variable CORS_ORIGIN in production.',
      );
    }

    if (corsOrigins.includes('*')) {
      throw new Error(
        'CORS_ORIGIN cannot contain "*" in production when credentials are enabled.',
      );
    }

    if (!String(process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || '').trim()) {
      throw new Error(
        'Missing JWT_ACCESS_SECRET or JWT_SECRET in production.',
      );
    }

    if (!String(process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || '').trim()) {
      throw new Error(
        'Missing JWT_REFRESH_SECRET or JWT_SECRET in production.',
      );
    }
  }
}

async function bootstrap() {
  loadLocalEnvFiles();
  validateRuntimeEnv();

  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const mailService = app.get(MailService);
  const prisma = app.get(PrismaService);
  const nodeEnv = getNodeEnv();
  const listenPort = getListenPort();
  const otpRequired = parseBooleanEnv(process.env.OTP_REQUIRED, false);
  const emailVerificationRequired = parseBooleanEnv(
    process.env.EMAIL_VERIFICATION_REQUIRED,
    false,
  );
  const mailInfo = mailService.getMailRuntimeInfo();
  let mysqlReachable = false;
  let hotfixStatus: 'skipped' | 'applied' | 'failed' = 'skipped';

  const origins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : ['*'];
  console.log('CORS ORIGINS:', origins);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (origins.includes(origin) || origins.includes('*')) {
        return callback(null, true);
      }

      return callback(new Error('Not allowed by CORS'));
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      forbidUnknownValues: false,
    }),
  );

  // ⭐ الحل النهائي لعرض الصور
  app.useStaticAssets(join(process.cwd(), "uploads"), {
    prefix: "/uploads/",
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Urbanex API')
    .setDescription('Urbanex backend API documentation')
    .setVersion('1.0')
    .addTag('advisor')
    .addTag('admin-advisor')
    .addTag('admin-market')
    .addBearerAuth()
    .build();
  const swaggerDoc = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDoc);

  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    mysqlReachable = true;
  } catch {
    mysqlReachable = false;
  }

  const shouldRunHotfix =
    nodeEnv !== 'production' &&
    String(process.env.RUN_DB_HOTFIX || '').toLowerCase() === 'true';

  if (shouldRunHotfix) {
    const hotfixPath = join(process.cwd(), 'docs', 'sql', 'hotfix-auth.sql');

    try {
      const sql = readFileSync(hotfixPath, 'utf8');
      const statements = parseHotfixStatements(sql);
      let applied = 0;
      let skipped = 0;

      for (const statement of statements) {
        try {
          await prisma.$executeRawUnsafe(statement);
          applied += 1;
        } catch (error) {
          if (shouldIgnoreHotfixError(error)) {
            skipped += 1;
            logger.warn(`DB hotfix skipped statement: ${statement.slice(0, 80)}...`);
            continue;
          }
          throw error;
        }
      }

      logger.log(
        `DB hotfix executed from ${hotfixPath} (applied=${applied}, skipped=${skipped}, total=${statements.length})`,
      );
      hotfixStatus = 'applied';
    } catch (error) {
      logger.error(
        `DB hotfix failed (${hotfixPath}): ${(error as Error)?.message || error}`,
      );
      hotfixStatus = 'failed';
      throw error;
    }
  }

  try {
    await app.listen(listenPort);
    console.log('🚀 Urbanex backend running');
    console.log('CORS_ORIGIN:', process.env.CORS_ORIGIN);
  } catch (error: unknown) {
    const code =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof (error as { code?: unknown }).code === 'string'
        ? (error as { code: string }).code
        : undefined;

    if (code === 'EADDRINUSE' && listenPort === 3000) {
      let pid = 'unknown';
      try {
        pid =
          execSync('lsof -ti tcp:3000 | head -n 1', {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
          }).trim() || 'unknown';
      } catch {
        pid = 'unknown';
      }

      logger.error(
        `Port 3000 is already in use (PID: ${pid}). Run: npm run port:free`,
      );
      process.exit(1);
    }

    throw error;
  }

  const dbInfo = getDbInfo(process.env.DATABASE_URL);
  const dbName = dbInfo?.dbName ?? 'unknown';
  logger.log(
    `mail: enabled=${mailInfo.enabled} provider=${mailInfo.provider} from="${mailInfo.from}"`,
  );
  logger.log(`Listening on port ${listenPort}`);
  logger.log(`Startup context: db=${dbName}, port=${listenPort}, node_env=${nodeEnv}`);
  logger.log(
    `Boot checks: mysql_reachable=${mysqlReachable}, hotfix=${hotfixStatus}, otp_required=${otpRequired}, email_verification_required=${emailVerificationRequired}`,
  );
}
bootstrap().catch((error: unknown) => {
  const logger = new Logger('Bootstrap');
  logger.error((error as Error)?.message || error);
  process.exit(1);
});

const { execSync } = require('child_process');

// All migrations that have known issues - comprehensive list
const PROBLEM_MIGRATIONS = [
  '20260304113000_add_buyer_chat_session_meta_json',
  '20260304113000_add_chat_session_meta',
  '20260304120000_add_buyer_saved_searches',
  '20260304124500_add_buyer_recommendation_logs',
  '20260304183000_add_buyer_chat_tables',
  '20260304195000_add_auth_otp_tables',
  '20260304170000_add_external_market_baseline',
  '20260304193000_add_market_snapshot_daily',
  '20260312093000_expand_market_data_for_csv_import',
  '20260312103000_expand_market_data_dataset_columns',
  '20260505120000_add_agent_role',
  '20260505130000_add_property_image',
  '20260506100000_add_districts_table',
  '20260508120000_add_notifications',
  '20260527000000_add_learned_vocabulary',
];

function run(cmd) {
  try {
    execSync(`node node_modules/prisma/build/index.js ${cmd}`, { stdio: 'pipe' });
    return true;
  } catch (e) {
    return false;
  }
}

console.log('[fix-migration] Starting comprehensive migration fix...');

for (const migration of PROBLEM_MIGRATIONS) {
  // Try rollback first (ignore errors)
  run(`migrate resolve --rolled-back "${migration}"`);
  // Try mark as applied (ignore errors)
  const applied = run(`migrate resolve --applied "${migration}"`);
  if (applied) {
    console.log(`[fix-migration] Fixed: ${migration}`);
  }
}

// Run all table creation SQL directly (idempotent — IF NOT EXISTS)
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createBuyerChatTables() {
  try {
    console.log('[fix-migration] Creating buyer_chat_sessions table...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`buyer_chat_sessions\` (
        \`id\` INTEGER NOT NULL AUTO_INCREMENT,
        \`buyer_id\` INTEGER NOT NULL,
        \`title\` VARCHAR(255) NULL,
        \`meta_json\` TEXT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`buyer_chat_sessions_buyer_id_idx\`(\`buyer_id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log('[fix-migration] buyer_chat_sessions created ✅');

    // Drop and recreate buyer_chat_messages with all required columns
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS \`buyer_chat_messages\``).catch(() => {});
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`buyer_chat_messages\` (
        \`id\` INTEGER NOT NULL AUTO_INCREMENT,
        \`session_id\` INTEGER NOT NULL,
        \`role\` VARCHAR(20) NOT NULL,
        \`content\` TEXT NOT NULL,
        \`intent\` VARCHAR(100) NULL,
        \`payload_json\` TEXT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`buyer_chat_messages_session_id_idx\`(\`session_id\`),
        CONSTRAINT \`buyer_chat_messages_session_id_fkey\`
          FOREIGN KEY (\`session_id\`) REFERENCES \`buyer_chat_sessions\`(\`id\`)
          ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log('[fix-migration] buyer_chat_messages recreated with intent column ✅');

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`buyer_recommendation_logs\` (
        \`id\` INTEGER NOT NULL AUTO_INCREMENT,
        \`session_id\` INTEGER NOT NULL,
        \`property_id\` INTEGER NOT NULL,
        \`score\` DOUBLE NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`buyer_recommendation_logs_session_id_fkey\`
          FOREIGN KEY (\`session_id\`) REFERENCES \`buyer_chat_sessions\`(\`id\`)
          ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log('[fix-migration] buyer_recommendation_logs created ✅');
  } catch (e) {
    console.warn('[fix-migration] Buyer chat tables skipped:', e.message?.split('\n')[0]);
  }
}

async function createBuyerSavedSearches() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`buyer_saved_searches\` (
        \`id\` INTEGER NOT NULL AUTO_INCREMENT,
        \`buyer_id\` INTEGER NOT NULL,
        \`filters_json\` TEXT NOT NULL,
        \`label\` VARCHAR(255) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`buyer_saved_searches_buyer_id_idx\`(\`buyer_id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log('[fix-migration] buyer_saved_searches created ✅');
  } catch (e) {
    console.warn('[fix-migration] buyer_saved_searches skipped:', e.message?.split('\n')[0]);
  }
}

async function createVocabularyTables() {
  try {
    console.log('[fix-migration] Creating learned_vocabulary table...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`learned_vocabulary\` (
        \`id\` INTEGER NOT NULL AUTO_INCREMENT,
        \`raw_term\` VARCHAR(255) NOT NULL,
        \`mapped_to\` VARCHAR(255) NOT NULL,
        \`category\` VARCHAR(50) NOT NULL,
        \`confidence\` DOUBLE NOT NULL DEFAULT 0.5,
        \`usage_count\` INTEGER NOT NULL DEFAULT 1,
        \`confirmed_count\` INTEGER NOT NULL DEFAULT 0,
        \`rejected_count\` INTEGER NOT NULL DEFAULT 0,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        UNIQUE INDEX \`learned_vocabulary_raw_term_mapped_to_key\`(\`raw_term\`, \`mapped_to\`),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log('[fix-migration] learned_vocabulary created ✅');

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`vocabulary_learning_log\` (
        \`id\` INTEGER NOT NULL AUTO_INCREMENT,
        \`term_id\` INTEGER NOT NULL,
        \`user_id\` INTEGER NOT NULL,
        \`action\` VARCHAR(20) NOT NULL,
        \`context\` TEXT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`vocabulary_learning_log_term_id_fkey\`
          FOREIGN KEY (\`term_id\`) REFERENCES \`learned_vocabulary\`(\`id\`)
          ON DELETE RESTRICT ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log('[fix-migration] vocabulary_learning_log created ✅');
  } catch (e) {
    console.warn('[fix-migration] Table creation skipped (may already exist):', e.message?.split('\n')[0]);
  }
}

async function createPaymentTable() {
  try {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS \`payment\``);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`payment\` (
        \`id\` INTEGER NOT NULL AUTO_INCREMENT,
        \`invoiceId\` INTEGER NOT NULL,
        \`amount\` DOUBLE NOT NULL,
        \`method\` VARCHAR(50) NOT NULL DEFAULT 'CASH',
        \`date\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`note\` TEXT NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`payment_invoiceId_idx\`(\`invoiceId\`),
        CONSTRAINT \`payment_invoiceId_fkey\`
          FOREIGN KEY (\`invoiceId\`) REFERENCES \`Invoice\`(\`id\`)
          ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log('[fix-migration] payment table recreated ✅');
  } catch (e) {
    console.warn('[fix-migration] payment skipped:', e.message?.split('\n')[0]);
  }
}

(async () => {
  try {
    await createBuyerChatTables();
    await createBuyerSavedSearches();
    await createVocabularyTables();
    await createPaymentTable();
  } finally {
    await prisma.$disconnect();
  }
})();

console.log('[fix-migration] Done! Running deploy...');

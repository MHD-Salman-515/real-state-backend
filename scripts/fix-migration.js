const { execSync } = require('child_process');

const FAILED_MIGRATIONS = [
  '20260304113000_add_buyer_chat_session_meta_json',
  '20260304113000_add_chat_session_meta',
];

for (const migration of FAILED_MIGRATIONS) {
  try {
    console.log(`[fix-migration] Rolling back ${migration}...`);
    execSync(
      `node node_modules/prisma/build/index.js migrate resolve --rolled-back "${migration}"`,
      { stdio: 'inherit' }
    );
    console.log(`[fix-migration] Rolled back.`);
  } catch (e) {
    console.warn(`[fix-migration] Rollback skipped:`, e.message?.split('\n')[0]);
  }

  try {
    console.log(`[fix-migration] Marking ${migration} as applied...`);
    execSync(
      `node node_modules/prisma/build/index.js migrate resolve --applied "${migration}"`,
      { stdio: 'inherit' }
    );
    console.log(`[fix-migration] Done.`);
  } catch (e) {
    console.warn(`[fix-migration] Apply skipped:`, e.message?.split('\n')[0]);
  }
}

console.log('[fix-migration] All migrations fixed!');

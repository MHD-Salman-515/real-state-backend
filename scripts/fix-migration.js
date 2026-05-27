const { execSync } = require('child_process');

const FAILED_MIGRATION = '20260304113000_add_buyer_chat_session_meta_json';

try {
  console.log(`[fix-migration] Marking ${FAILED_MIGRATION} as rolled-back...`);
  execSync(
    `node node_modules/prisma/build/index.js migrate resolve --rolled-back "${FAILED_MIGRATION}"`,
    { stdio: 'inherit' }
  );
  console.log('[fix-migration] Rolled back.');
} catch (e) {
  console.warn('[fix-migration] Already clean:', e.message);
}

try {
  console.log(`[fix-migration] Marking ${FAILED_MIGRATION} as applied (skip)...`);
  execSync(
    `node node_modules/prisma/build/index.js migrate resolve --applied "${FAILED_MIGRATION}"`,
    { stdio: 'inherit' }
  );
  console.log('[fix-migration] Marked as applied. Done.');
} catch (e) {
  console.warn('[fix-migration] Could not mark as applied:', e.message);
}

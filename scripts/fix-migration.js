const { execSync } = require('child_process');

const migration = '20260304113000_add_buyer_chat_session_meta_json';

try {
  console.log(`[fix-migration] Marking ${migration} as rolled-back...`);
  execSync(
    `node node_modules/prisma/build/index.js migrate resolve --rolled-back "${migration}"`,
    { env: { ...process.env }, stdio: 'inherit' },
  );
  console.log('[fix-migration] Done.');
} catch (err) {
  // Already resolved or never failed — safe to continue
  console.warn('[fix-migration] Resolve skipped (may already be clean):', err.message);
}

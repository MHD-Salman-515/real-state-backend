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

console.log('[fix-migration] Done! Running deploy...');

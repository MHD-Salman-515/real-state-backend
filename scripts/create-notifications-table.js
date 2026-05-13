const mysql = require('mysql2/promise');

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');

  const u = new URL(url);
  const conn = await mysql.createConnection({
    host: u.hostname,
    port: parseInt(u.port),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
    ssl: { rejectUnauthorized: false }
  });

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS notifications (
      id        INT AUTO_INCREMENT PRIMARY KEY,
      userId    INT NOT NULL,
      type      VARCHAR(50) NOT NULL,
      title     VARCHAR(200) NOT NULL,
      body      TEXT NOT NULL,
      isRead    BOOLEAN NOT NULL DEFAULT FALSE,
      metadata  JSON NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX notifications_userId_idx (userId),
      INDEX notifications_userId_isRead_idx (userId, isRead),
      CONSTRAINT fk_notifications_user FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
    )
  `);

  console.log('notifications table created or already exists');
  await conn.end();
}

run().catch(e => { console.error(e.message); process.exit(1); });

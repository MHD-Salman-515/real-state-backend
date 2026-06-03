const https = require('https');

setInterval(() => {
  https.get('https://real-state-backend-yc23.onrender.com/health', () => {
    console.log('[keep-alive] ping sent', new Date().toISOString());
  }).on('error', () => {});
}, 840000); // ping every 14 minutes

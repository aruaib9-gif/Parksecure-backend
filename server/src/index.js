const cron = require('node-cron');

const config = require('./config');
const prisma = require('./db');
const app = require('./app');
const { runSecurityDetection } = require('./jobs/securityAlerts');

// Hourly automated security detection (overstays, guest expiry, exit timeouts).
if (config.cronEnabled) {
  cron.schedule('0 * * * *', () => {
    runSecurityDetection()
      .then((r) => console.log('[cron] security detection:', JSON.stringify(r.created)))
      .catch((e) => console.error('[cron] security detection failed:', e.message));
  });
  // Exit request timeouts are more time-sensitive — check every 5 minutes.
  cron.schedule('*/5 * * * *', () => {
    runSecurityDetection().catch(() => {});
  });
}

const server = app.listen(config.port, () => {
  console.log(`ParkSecure API listening on :${config.port}`);
  console.log(`Swagger docs: ${config.appBaseUrl}/api-docs`);
});

const shutdown = async (signal) => {
  console.log(`${signal} received, shutting down`);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app;

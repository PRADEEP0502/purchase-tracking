import { config } from './config.js';
import { closeDb, runMigrations } from './db/client.js';
import { ensureInitialAdmin, seedIfEmpty } from './db/seed.js';
import { createApp } from './app.js';
import { startReminderScheduler, stopReminderScheduler } from './services/reminders.js';

await runMigrations();
if (!config.isProduction || process.env.SEED_DEMO === '1') await seedIfEmpty();
else await ensureInitialAdmin();

const server = createApp().listen(config.port, () => {
  console.log(`JPM Purchase API listening on http://localhost:${config.port}`);
});
startReminderScheduler();

async function shutdown() {
  stopReminderScheduler();
  server.close();
  server.closeAllConnections();
  await closeDb();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

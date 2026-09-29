import { config } from './config.js';
import { closeDb, runMigrations } from './db/client.js';
import { seedIfEmpty } from './db/seed.js';
import { createApp } from './app.js';

await runMigrations();
if (!config.isProduction || process.env.SEED_DEMO === '1') await seedIfEmpty();

const server = createApp().listen(config.port, () => {
  console.log(`JPM Purchase API listening on http://localhost:${config.port}`);
});

async function shutdown() {
  server.close();
  server.closeAllConnections();
  await closeDb();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Entry point for hosts whose default start command is `node server.js` (e.g. Render).
// The real server is built into server/dist by `npm run build`.
const fs = require('node:fs');
const path = require('node:path');

const entry = path.join(__dirname, 'server', 'dist', 'index.js');

if (!fs.existsSync(entry) || !fs.existsSync(path.join(__dirname, 'web', 'dist', 'index.html'))) {
  console.error(
    [
      '',
      '❌ The app has not been built yet.',
      '   Set the Build Command on your hosting service to:',
      '       npm ci --include=dev && npm run build',
      '   and the Start Command to:',
      '       npm start',
      '   then deploy again.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

import(require('node:url').pathToFileURL(entry).href).catch((err) => {
  console.error(err);
  process.exit(1);
});

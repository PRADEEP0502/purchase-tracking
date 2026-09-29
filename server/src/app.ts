import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { config } from './config.js';
import { errorHandler, HttpError } from './lib/http.js';
import { requireAuth, requireClientHeader } from './lib/auth.js';
import { authRouter } from './routes/auth.js';
import { tasksRouter } from './routes/tasks.js';
import { sectionsRouter } from './routes/sections.js';
import { usersRouter } from './routes/users.js';
import {
  activityRouter,
  dashboardRouter,
  eventsRouter,
  filesRouter,
  notificationsRouter,
  voiceRouter,
} from './routes/misc.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          mediaSrc: ["'self'", 'blob:'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          connectSrc: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.use(requireClientHeader);
  api.get('/health', (_req, res) => {
    res.json({ data: { ok: true } });
  });
  api.use('/auth', authRouter);
  api.use(requireAuth);
  api.use('/tasks', tasksRouter);
  api.use('/sections', sectionsRouter);
  api.use('/users', usersRouter);
  api.use('/dashboard', dashboardRouter);
  api.use('/activity', activityRouter);
  api.use('/notifications', notificationsRouter);
  api.use('/voice', voiceRouter);
  api.use('/files', filesRouter);
  api.use('/events', eventsRouter);
  api.use(() => {
    throw new HttpError(404, 'not_found', 'Not found.');
  });

  app.use('/api', api);

  // Serve the built web app in production.
  if (fs.existsSync(config.webDistDir)) {
    app.use(express.static(config.webDistDir, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(path.join(config.webDistDir, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}

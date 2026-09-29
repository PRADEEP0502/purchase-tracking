import type { RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { config } from '../config.js';
import { db, schema } from '../db/client.js';
import { HttpError, forbidden } from './http.js';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

interface SessionClaims {
  sub: string;
}

export function setSessionCookie(res: Response, userId: number): void {
  const token = jwt.sign({ sub: String(userId) } satisfies SessionClaims, config.jwtSecret, {
    expiresIn: `${config.sessionDays}d`,
  });
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    maxAge: config.sessionDays * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(config.cookieName, { path: '/' });
}

/**
 * Loads the session user on every request so that deactivated users and role changes take effect immediately.
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.[config.cookieName];
  if (!token) throw new HttpError(401, 'unauthenticated', 'Please sign in to continue.');

  let claims: SessionClaims;
  try {
    claims = jwt.verify(token, config.jwtSecret) as SessionClaims;
  } catch {
    throw new HttpError(401, 'unauthenticated', 'Your session has expired. Please sign in again.');
  }

  const [user] = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.users.role,
      isActive: schema.users.isActive,
    })
    .from(schema.users)
    .where(eq(schema.users.id, Number(claims.sub)));

  if (!user || !user.isActive) {
    throw new HttpError(401, 'unauthenticated', 'Please sign in to continue.');
  }
  req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  next();
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (req.user?.role !== 'admin') throw forbidden();
  next();
};

/**
 * CSRF mitigation: state-changing requests must carry a custom header, which browsers
 * will not send cross-origin without a CORS preflight (and CORS is not enabled).
 */
export const requireClientHeader: RequestHandler = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-jpm-client') !== 'web') throw forbidden('Request blocked.');
  next();
};

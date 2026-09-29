import type { ErrorRequestHandler, Request } from 'express';
import { z, ZodError, type ZodType } from 'zod';
import multer from 'multer';

/**
 * Consistent response envelope:
 *   success → { data: ... , meta?: ... }
 *   failure → { error: { code, message, fields? } }
 * Messages in HttpError are written for end users; unexpected errors are never echoed to the client.
 */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Item') => new HttpError(404, 'not_found', `${what} not found.`);
export const forbidden = (message = 'You do not have permission to do this.') =>
  new HttpError(403, 'forbidden', message);
export const badRequest = (message: string, fields?: Record<string, string>) =>
  new HttpError(400, 'invalid_request', message, fields);

export function parse<T extends ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw validationError(result.error);
  return result.data;
}

function validationError(error: ZodError): HttpError {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  const first = Object.values(fields)[0];
  return badRequest(first ?? 'Please check the entered details.', fields);
}

export function idParam(req: Request, name = 'id'): number {
  const id = Number(req.params[name]);
  if (!Number.isInteger(id) || id <= 0) throw notFound();
  return id;
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, fields: err.fields } });
    return;
  }
  if (err instanceof ZodError) {
    const e = validationError(err);
    res.status(e.status).json({ error: { code: e.code, message: e.message, fields: e.fields } });
    return;
  }
  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE' ? 'File is too large. Maximum file size is 10 MB.' : 'File upload failed.';
    res.status(400).json({ error: { code: 'upload_failed', message } });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'invalid_json', message: 'Invalid request.' } });
    return;
  }
  console.error('[unhandled]', err);
  res.status(500).json({ error: { code: 'server_error', message: 'Something went wrong. Please try again.' } });
};

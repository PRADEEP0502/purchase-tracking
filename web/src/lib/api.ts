/**
 * Thin fetch wrapper. Every request carries the client header the server requires for
 * CSRF protection. Errors are normalised to user-facing messages — raw server errors never reach the UI.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

type Json = Record<string, unknown> | unknown[];

interface Options {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: Json | FormData;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

let onUnauthenticated: (() => void) | null = null;
export function setUnauthenticatedHandler(fn: () => void) {
  onUnauthenticated = fn;
}

export async function request<T = unknown>(path: string, opts: Options = {}): Promise<{ data: T; meta?: any }> {
  const headers: Record<string, string> = { 'x-jpm-client': 'web', ...opts.headers };
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method: opts.method ?? 'GET', headers, body, credentials: 'same-origin', signal: opts.signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'network', 'Unable to reach the server. Check your connection and try again.');
  }

  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    /* non-JSON */
  }

  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login' && path !== '/auth/me') onUnauthenticated?.();
    const err = payload?.error;
    const fallback =
      res.status === 413
        ? 'File is too large. Maximum file size is 10 MB.'
        : res.status >= 500
          ? 'Something went wrong. Please try again.'
          : 'Request failed. Please try again.';
    throw new ApiError(res.status, err?.code ?? 'error', err?.message ?? fallback, err?.fields);
  }
  return payload ?? { data: null };
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }).then((r) => r),
  post: <T>(path: string, body?: Json | FormData, headers?: Record<string, string>) =>
    request<T>(path, { method: 'POST', body: body ?? {}, headers }),
  patch: <T>(path: string, body: Json) => request<T>(path, { method: 'PATCH', body }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export function errorMessage(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  return e instanceof ApiError ? e.message : fallback;
}

export function qs(params: Record<string, string | number | undefined | null | string[] | number[]>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) {
      if (v.length) sp.set(k, v.join(','));
    } else sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

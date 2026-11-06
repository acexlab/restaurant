/** Error shape returned by the Xeva API: { error: { statusCode, code, message, details?, correlationId } } */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Sent as X-Xeva-Tenant. The server verifies membership; this only selects. */
  tenantId?: string | null;
}

/**
 * Thin fetch wrapper. Requests go to /api/v1 on the same origin; each app's Next.js
 * config rewrites that to the API server, so there is no CORS and no API URL in the bundle.
 */
export async function apiRequest<T>(token: string | null, path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.tenantId) headers['X-Xeva-Tenant'] = opts.tenantId;

  const res = await fetch(`/api/v1${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const e = data?.error ?? {};
    throw new ApiError(res.status, e.code ?? 'HTTP_ERROR', e.message ?? res.statusText, e.details);
  }
  return data as T;
}

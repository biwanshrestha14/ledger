export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn);

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : init.body,
      ...rest,
    });
  } catch {
    throw new ApiError(0, 'You’re offline. Check your connection and try again.');
  }
  if (res.status === 401 && !path.startsWith('/auth/')) onUnauthorized?.();
  if (!res.ok) {
    let message = 'Something went wrong. Try again.';
    try {
      const body = await res.json();
      const m = Array.isArray(body.message) ? body.message[0] : body.message;
      if (typeof m === 'string') message = res.status === 429 ? 'Too many attempts. Wait a minute and try again.' : m;
    } catch { /* non-JSON body */ }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

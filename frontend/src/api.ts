export const API_BASE: string = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api';

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'editor' | 'viewer';
}

export interface Session {
  token: string;
  user: SessionUser;
}

const SESSION_KEY = 'qa-ksink-session';

export function getSession(): Session | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function setSession(session: Session): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function hasRole(...roles: string[]): boolean {
  const session = getSession();
  return session !== null && roles.includes(session.user.role);
}

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(`HTTP ${status}: ${detail}`);
    this.status = status;
    this.detail = detail;
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  let detail = response.statusText || `HTTP ${response.status}`;
  try {
    const body = await response.json();
    if (typeof body.detail === 'string') detail = body.detail;
  } catch {
    /* non-JSON error body */
  }
  return new ApiError(response.status, detail);
}

export async function api(path: string, options: RequestInit = {}): Promise<any> {
  const session = getSession();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
    ...((options.headers as Record<string, string>) ?? {})
  };
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return null;
  return response.json();
}

export async function apiUpload(path: string, file: File): Promise<any> {
  const session = getSession();
  const form = new FormData();
  form.append('file', file);
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: session ? { Authorization: `Bearer ${session.token}` } : {},
    body: form
  });
  if (!response.ok) throw await toApiError(response);
  return response.json();
}

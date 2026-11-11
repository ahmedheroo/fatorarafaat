import { Tenant, User } from './models';

export const AUTH_KEY = 'pos_auth_session';
export const LEGACY_AUTH_KEY = 'pos_current_user';
export const STORE_CODE_KEY = 'pos_store_code';

export interface AuthSession {
  token: string;
  user: User;
  tenant: Tenant;
}

/** Session persisted by the server after login/registration. */
export function readSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed?.token || !parsed?.user || !parsed?.tenant) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSession(session: AuthSession): void {
  localStorage.setItem(AUTH_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(LEGACY_AUTH_KEY);
}

export function readStoredStoreCode(): string {
  try {
    return localStorage.getItem(STORE_CODE_KEY) || '';
  } catch {
    return '';
  }
}

export function writeStoredStoreCode(code: string): void {
  try {
    if (code) localStorage.setItem(STORE_CODE_KEY, code);
    else localStorage.removeItem(STORE_CODE_KEY);
  } catch {
    /* storage can be unavailable — the code is only a convenience */
  }
}

// apps/web/src/utils/jwt.ts
export function parseJwtExp(token?: string | null): number | null {
  if (!token) return null;
  try {
    const [, payload] = token.split('.');
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    // exp viene en segundos (UNIX). Convierto a ms.
    return typeof json?.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function isExpired(expMs?: number | null): boolean {
  if (!expMs) return false; // si no sabemos, no bloqueamos
  return Date.now() >= expMs;
}

export function msUntil(expMs?: number | null): number {
  if (!expMs) return Infinity;
  return Math.max(0, expMs - Date.now());
}

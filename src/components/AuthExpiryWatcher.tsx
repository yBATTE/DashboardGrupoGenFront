import { useEffect } from "react";
import { useAuthStore } from "../store/auth";

/** decode JWT exp sin depender de util externo */
function parseJwtExpMs(token?: string | null): number | null {
  if (!token) return null;
  try {
    const [, payload] = token.split(".");
    const json = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    );
    return typeof json?.exp === "number" ? json.exp * 1000 : null; // ms
  } catch {
    return null;
  }
}

/**
 * Observa la expiración del accessToken y, cuando llega la hora,
 * limpia sesión y manda a /login (aunque no hagas requests).
 */
export default function AuthExpiryWatcher() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const storeExp = useAuthStore((s) => (s as any).tokenExpMs ?? null);

  useEffect(() => {
    const expMs: number | null =
      storeExp ?? parseJwtExpMs(accessToken) ?? null;

    if (!expMs) return;

    const ms = Math.max(0, expMs - Date.now());
    const id = setTimeout(() => {
      const { clear } = useAuthStore.getState();
      clear();
      if (window.location.pathname !== "/login") {
        window.location.assign("/login");
      }
    }, ms);

    return () => clearTimeout(id);
  }, [accessToken, storeExp]);

  return null;
}

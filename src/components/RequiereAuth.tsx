import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/auth";

type Props = { children?: React.ReactNode };

/**
 * Si el usuario NO está autenticado (o el token venció), redirige a /login.
 * Soporta dos usos:
 * 1) <Route element={<RequireAuth />}><Route .../></Route>  (usa <Outlet/>)
 * 2) <Route element={<RequireAuth><MiPagina/></RequireAuth>} /> (renderiza children)
 */
export default function RequireAuth({ children }: Props) {
  const loc = useLocation();

  // soporta stores viejos y nuevos:
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasIsExpired = useAuthStore((s) => (s as any).isExpired !== undefined);
  const expired = hasIsExpired ? (useAuthStore.getState() as any).isExpired() : false;

  const logged = Boolean(accessToken) && !expired;

  if (!logged) {
    return <Navigate to="/login" state={{ from: loc }} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}

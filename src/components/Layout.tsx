import { NavLink, useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import { api } from "../api/axios";
import ProfileFab from "./ProfileFab";
import NotificationBell from "./NotificationBell"; // 👈 NUEVO

export default function Layout({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const isAdmin = useAuthStore((s) => s.isAdmin());
  const isMember = useAuthStore((s) =>
    (s as any).isMember
      ? (s as any).isMember()
      : Boolean((s as any).roles?.includes?.("member"))
  );

  const isAuthed = useAuthStore((s) =>
    Boolean((s as any).user?._id || (s as any).roles?.length || (s as any).email)
  );

  const nav = useNavigate();

  async function logout() {
    try {
      await api.post("/auth/logout");
    } catch {}
    api.defaults.headers.common["Authorization"] = undefined;
    useAuthStore.getState().clear();
    nav("/login", { replace: true });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/" className="brand" title="Ir al inicio">
          Grupo Gen Dashboard
        </Link>

        <nav className="nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
            Inicio
          </NavLink>

          {(isAdmin || isMember) && (
            <NavLink to="/payments" className={({ isActive }) => (isActive ? "active" : "")}>
              Tablero Pagos
            </NavLink>
          )}

          {(isAdmin || isMember) && (
            <NavLink
              to="/new/payments"
              end
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              Nuevo Pago
            </NavLink>
          )}

          {/* ✅ AHORA: Admin + Member pueden crear equipo */}
          {(isAdmin || isMember) && (
            <NavLink to="/teams" end className={({ isActive }) => (isActive ? "active" : "")}>
              Crear equipo
            </NavLink>
          )}

          {/* ✅ SOLO ADMIN: administración */}
          {isAdmin && (
            <>
              <NavLink to="/teams/manage" className={({ isActive }) => (isActive ? "active" : "")}>
                Administrar equipos
              </NavLink>

              <NavLink to="/users" end className={({ isActive }) => (isActive ? "active" : "")}>
                Crear usuario
              </NavLink>

              <NavLink to="/admin/users" className={({ isActive }) => (isActive ? "active" : "")}>
                Usuarios
              </NavLink>
            </>
          )}
        </nav>
      </aside>

      <div className="main">
        <div className="topbar">
          <div style={{ fontWeight: 800 }}>{title}</div>

          {/* derecha: acciones + campana */}
          <div className="btn-row" style={{ alignItems: "center", gap: 8 }}>
            {actions ? <div className="btn-row">{actions}</div> : null}
            <NotificationBell enabled={isAuthed} />
          </div>
        </div>

        <div className="page">{children}</div>
      </div>

      <ProfileFab />
    </div>
  );
}

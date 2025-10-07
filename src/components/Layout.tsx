import { NavLink, useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import { api } from "../api/axios";
import ProfileFab from "./ProfileFab";

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
        {/* Marca clickeable al home */}
        <Link to="/" className="brand" title="Ir al inicio">
          Grupo Gen Dashboard
        </Link>

        <nav className="nav">
          {/* ✅ Inicio apunta a "/" y sólo está activo en el home */}
          <NavLink
            to="/"
            end
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            Inicio
          </NavLink>

          {/* ✅ Tablero Tareas ahora en /tasks (sin end para quedar activo también en /tasks/:id) */}
          <NavLink
            to="/tasks"
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            Tablero Tareas
          </NavLink>

          {(isAdmin || isMember) && (
            <NavLink
              to="/new"
              end
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              Nueva tarea
            </NavLink>
          )}

          {(isAdmin || isMember) && (
            <NavLink
              to="/payments"
              className={({ isActive }) => (isActive ? "active" : "")}
            >
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

          {isAdmin && (
            <>
              <NavLink
                to="/teams"
                end
                className={({ isActive }) => (isActive ? "active" : "")}
              >
                Crear equipo
              </NavLink>

              <NavLink
                to="/teams/manage"
                className={({ isActive }) => (isActive ? "active" : "")}
              >
                Administrar equipos
              </NavLink>

              <NavLink
                to="/users"
                end
                className={({ isActive }) => (isActive ? "active" : "")}
              >
                Crear usuario
              </NavLink>

              <NavLink
                to="/admin/users"
                className={({ isActive }) => (isActive ? "active" : "")}
              >
                Usuarios
              </NavLink>
            </>
          )}
        </nav>
      </aside>

      <div className="main">
        <div className="topbar">
          <div style={{ fontWeight: 800 }}>{title}</div>
          {actions ? <div className="btn-row">{actions}</div> : null}
        </div>

        <div className="page">{children}</div>
      </div>

      <ProfileFab />
    </div>
  );
}

import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import Layout from "../components/Layout";
import { TaskFull, getTask, completeTask, reopenTask } from "../api/tasks";

type AnyUser =
  | { _id: string; name?: string; lastName?: string; displayName?: string; email?: string }
  | string;
type AnyTeam = { _id: string; name?: string } | string;

// ===== helpers de presentación =====
function displayUser(u: AnyUser): string {
  if (!u) return "—";
  if (typeof u === "string") return u; // fallback por si viene sólo el id
  const full = [u.name, u.lastName].filter(Boolean).join(" ");
  return u.displayName || full || u.email || u._id || "—";
}
function userKey(u: AnyUser) {
  return typeof u === "string" ? u : String(u._id);
}
function displayTeam(t: AnyTeam) {
  return typeof t === "string" ? t : t?.name || "";
}
function teamKey(t: AnyTeam) {
  return typeof t === "string" ? t : String(t._id);
}

export default function TaskDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();

  const { data: task, isLoading, isError, refetch } = useQuery({
    queryKey: ["task", id],
    queryFn: () => getTask(id),
    enabled: !!id,
  });

  const finalizeMutation = useMutation({
    mutationFn: () => completeTask(id),
    onSuccess: () => refetch(),
  });

  const reopenMutation = useMutation({
    mutationFn: () => reopenTask(id),
    onSuccess: () => refetch(),
  });

  function priorityBadge(p?: TaskFull["priority"]) {
    if (!p) return null;
    const cls = p === "high" ? "badge red" : p === "medium" ? "badge amber" : "badge green";
    return <span className={cls}>Prioridad: {p}</span>;
  }

  return (
    <Layout
      title="Detalle de tarea"
      actions={
        <Link to="/" className="btn btn-ghost">
          ← Volver
        </Link>
      }
    >
      {isLoading && <div className="card">Cargando…</div>}
      {isError && (
        <div className="card" style={{ borderColor: "var(--danger)", background: "#fff4f4" }}>
          No se pudo cargar la tarea.{" "}
          <button className="btn btn-ghost" onClick={() => refetch()}>
            Reintentar
          </button>
        </div>
      )}

      {task && (
        <div className="card">
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <h1 className="h1" style={{ margin: 0 }}>
              {task.title}
            </h1>
            {priorityBadge(task.priority)}
          </div>

          {/* Descripción */}
          {task.description && (
            <div className="card">
              <div className="card-sub">Descripción</div>
              <div className="break-anywhere muted" style={{ marginTop: 6 }}>
                {task.description}
              </div>
            </div>
          )}

          {/* Datos principales */}
          <div className="grid grid-2" style={{ marginTop: 16 }}>
            {/* Estado */}
            <div className="card">
              <div className="card-sub">Estado</div>
              <div style={{ fontWeight: 700 }}>{task.status === "done" ? "Finalizada" : "Abierta"}</div>
              {task.status === "done" && (
                <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                  Finalizada el {task.completedAt ? new Date(task.completedAt).toLocaleString() : "-"} por{" "}
                  {displayUser(task.completedBy as AnyUser)}
                </div>
              )}
            </div>

            {/* Vencimiento */}
            <div className="card">
              <div className="card-sub">Vencimiento</div>
              <div style={{ fontWeight: 700 }}>
                {task.dueAt ? new Date(task.dueAt).toLocaleString() : "—"}
              </div>
            </div>

            {/* Creador */}
            <div className="card">
              <div className="card-sub">Creador</div>
              <div style={{ fontWeight: 700 }}>{displayUser(task.ownerId as AnyUser)}</div>
              <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                Creada el {task.createdAt ? new Date(task.createdAt).toLocaleString() : "—"}
              </div>
            </div>

            {/* Asignados */}
            <div className="card">
              <div className="card-sub">Asignada a</div>
              {task.assigneeIds && task.assigneeIds.length ? (
                <div className="chips">
                  {task.assigneeIds.map((a: AnyUser) => (
                    <span key={userKey(a)} className="chip" title={displayUser(a)}>
                      {displayUser(a)}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="muted">—</div>
              )}
            </div>

            {/* Equipos */}
            <div className="card">
              <div className="card-sub">Equipos</div>
              {task.teamIds && task.teamIds.length ? (
                <div className="chips">
                  {task.teamIds.map((t: AnyTeam) => (
                    <span key={teamKey(t)} className="chip" title={displayTeam(t)}>
                      {displayTeam(t)}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="muted">—</div>
              )}
            </div>
          </div>

          {/* Acciones */}
          <div className="btn-row" style={{ marginTop: 12 }}>
            {task.status !== "done" ? (
              <button
                className="btn btn-primary"
                onClick={() => finalizeMutation.mutate()}
                disabled={finalizeMutation.isPending}
              >
                {finalizeMutation.isPending ? "Marcando…" : "Marcar como finalizada"}
              </button>
            ) : (
              <button
                className="btn btn-outline"
                onClick={() => reopenMutation.mutate()}
                disabled={reopenMutation.isPending}
              >
                {reopenMutation.isPending ? "Reabriendo…" : "Reabrir"}
              </button>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}

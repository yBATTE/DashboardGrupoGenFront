// apps/web/src/pages/AdminUserDetail.tsx
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useMemo, useState } from "react";
import { adminGetUserOverview } from "../api/adminUsers";
import Layout from "../components/Layout";

import { listTeams, type Team } from "../api/teams";
import { listPaymentsRange, type Payment } from "../api/payments";

/* ============ utils ============ */
function addMonths(d: Date, n: number) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}
const fmtDT = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("es-AR", { hour12: false }) : "—";
const fmtARS = (n: number) =>
  Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n);

// Mostrar Nombre + Apellido donde sea posible
function displayUser(u: any): string {
  if (!u) return '—';
  if (typeof u === 'string') return u;
  const full = [u.name, u.lastName].filter(Boolean).join(' ');
  console.log(u)
  return u.displayName || full || u.email || u._id || '—' || u.lastName;
}

type ViewMode = "payments" | "tasks";

export default function AdminUserDetail() {
  const { id = "" } = useParams();
  const [view, setView] = useState<ViewMode>("payments"); // default Pagos

  // --- Datos de usuario + tareas (overview existente)
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-user-overview", id],
    queryFn: () => adminGetUserOverview(id),
    enabled: !!id,
  });

  // --- Equipos
  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: listTeams,
  });

  // --- Pagos (traemos todos y filtramos)
  const to = new Date();
  const from = addMonths(to, -6);
  const { data: payments } = useQuery({
    queryKey: ["payments-all", id],
    enabled: !!id,
    queryFn: () => listPaymentsRange({}), // sin rango para tener todo
  });

  // Equipos del usuario actual
  const userTeamIds = useMemo(() => {
    if (!teams || !id) return new Set<string>();
    const set = new Set<string>();
    (teams as Team[]).forEach((t) => {
      (t.members ?? []).forEach((m: any) => {
        const mid = typeof m === "string" ? m : m?._id;
        if (mid === id) set.add(t._id);
      });
    });
    return set;
  }, [teams, id]);

  // Pagos asignados al usuario (directos o por sus equipos)
  const userPaymentsAssigned = useMemo<Payment[]>(() => {
    if (!payments || !id) return [];
    return payments.filter((p) => {
      const aIds = (Array.isArray(p.assigneeIds) ? p.assigneeIds : []).map(
        (x: any) => (typeof x === "string" ? x : x?._id)
      );
      if (aIds.includes(id)) return true;
      const tIds = (Array.isArray(p.teamIds) ? p.teamIds : []).map((x: any) =>
        typeof x === "string" ? x : x?._id
      );
      return tIds.some((tid) => userTeamIds.has(tid));
    });
  }, [payments, id, userTeamIds]);

  // Pagos pagados por el usuario (paidBy)
  const userPaymentsPaidBy = useMemo<Payment[]>(() => {
    if (!payments || !id) return [];
    return payments.filter((p) => {
      const pid = typeof p.paidBy === "string" ? p.paidBy : p.paidBy?._id;
      return p.status === "paid" && pid === id;
    });
  }, [payments, id]);

  // Asignados vencidos
  const userPaymentsOverdue = useMemo<Payment[]>(() => {
    const now = Date.now();
    return userPaymentsAssigned.filter((p) => {
      if (p.status === "paid") return false;
      const t = p.dueAt ? new Date(p.dueAt).getTime() : NaN;
      return Number.isFinite(t) && t < now;
    });
  }, [userPaymentsAssigned]);

  // KPIs
  const payPending = userPaymentsAssigned.filter((p) => p.status !== "paid");
  const payPaid = userPaymentsAssigned.filter((p) => p.status === "paid");

  // Tareas asignadas al usuario + por equipo
  const tasksAssigned = useMemo(() => {
    const direct = data?.lists?.assigned ?? [];
    const byTeam = data?.lists?.assignedByTeam ?? [];
    const map = new Map(direct.map((t: any) => [t._id, t]));
    byTeam.forEach((t: any) => map.set(t._id, t));
    return Array.from(map.values());
  }, [data]);

  const titleDisplay = data ? `Usuario: ${displayUser(data.user)}` : "Usuario";

  return (
    <Layout
      title={titleDisplay}
      actions={
        <div className="actions-bar">
          <div className="actions-right">
            <label className="muted" style={{ marginRight: 6 }}>
              Ver:
            </label>
            <select
              className="input"
              value={view}
              onChange={(e) => setView(e.target.value as any)}
              style={{ height: 34 }}
            >
              <option value="payments">Pagos</option>
              <option value="tasks">Tareas</option>
            </select>
          </div>
        </div>
      }
    >
      {isLoading && <div className="card">Cargando…</div>}
      {isError && (
        <div className="card">
          Error.{" "}
          <button className="btn btn-ghost" onClick={() => refetch()}>
            Reintentar
          </button>
        </div>
      )}

      {data && (
        <>
          {/* Header datos */}
          <div className="card" style={{ marginBottom: 12 }}>
            <div>
              <b>Nombre:</b> {displayUser(data.user)}
            </div>
            <div>
              <b>Email:</b> {data.user.email}
            </div>
            <div className="muted">
              Rol: {data.user.role} — Alta:{" "}
              {new Date(data.user.createdAt).toLocaleString()}
            </div>
          </div>

          {/* ======= VISTA PAGOS (default) ======= */}
          {view === "payments" && (
            <>
              <h2 className="h2">
                Pagos — Asignados al usuario (o a sus equipos)
              </h2>

              {/* KPIs pagos asignados */}
              <div className="grid grid-3" style={{ marginBottom: 12 }}>
                <div className="card">
                  <div className="card-sub">Pendientes</div>
                  <div style={{ fontSize: 28, fontWeight: 800 }}>
                    {payPending.length}
                  </div>
                </div>
                <div className="card">
                  <div className="card-sub">Pagados</div>
                  <div style={{ fontSize: 28, fontWeight: 800 }}>
                    {payPaid.length}
                  </div>
                </div>
                <div className="card">
                  <div className="card-sub">Total</div>
                  <div style={{ fontSize: 28, fontWeight: 800 }}>
                    {userPaymentsAssigned.length}
                  </div>
                </div>
              </div>

              {/* Asignados vencidos */}
              <div className="card" style={{ marginBottom: 10 }}>
                <div className="card-sub">Asignados vencidos</div>
                <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>
                  {userPaymentsOverdue.length}
                </div>
                {userPaymentsOverdue.length === 0 ? (
                  <div className="muted">No hay pagos vencidos.</div>
                ) : (
                  <PaymentsList items={userPaymentsOverdue} />
                )}
              </div>

              {/* Lista completa de asignados */}
              <h3 className="h3">Todos los asignados</h3>
              <PaymentsList items={userPaymentsAssigned} />

              {/* Pagados por el usuario */}
              <h2 className="h2" style={{ marginTop: 18 }}>
                Pagos — Pagados por el usuario
              </h2>
              <div className="card" style={{ marginBottom: 8 }}>
                <div className="muted">
                  Total pagados por el usuario:{" "}
                  <b>{userPaymentsPaidBy.length}</b>
                </div>
              </div>
              <PaymentsList items={userPaymentsPaidBy} />
            </>
          )}

          {/* ======= VISTA TAREAS ======= */}
          {view === "tasks" && (
            <>
              <ColorLegend />

              <h2 className="h2">Recientes — Creadas por el usuario</h2>
              <TaskList
                items={data.lists.created}
                empty="No hay tareas creadas."
              />

              <h2 className="h2">
                Recientes — Asignadas al usuario (incluye equipos)
              </h2>
              <TaskList
                items={tasksAssigned}
                empty="No hay tareas asignadas."
              />

              <h2 className="h2">Recientes — Cerradas por el usuario</h2>
              <TaskList
                items={data.lists.closed}
                empty="No hay tareas cerradas."
              />
            </>
          )}
        </>
      )}
    </Layout>
  );
}

/* =================== Subcomponentes =================== */
function TaskList({ items, empty }: { items: any[]; empty: string }) {
  if (!items?.length) return <div className="card">{empty}</div>;

  function rowStyle(t: any): React.CSSProperties {
    const now = Date.now();
    const isDone = t.status === "done";
    const due = t.dueAt ? new Date(t.dueAt).getTime() : NaN;
    const isOverdue = !isDone && Number.isFinite(due) && due < now;

    // colores consistentes con tu UI
    if (isDone) {
      return {
        background: "#dcfce7", // verde suave
        color: "#065f46",
        border: "1px dashed #86efac",
        borderRadius: 12,
      };
    }
    if (isOverdue) {
      return {
        background: "#e5e7eb", // gris
        color: "#111827",
        border: "1px solid #d1d5db",
        borderRadius: 12,
      };
    }
    // pendiente
    return {
      background: "#fde68a", // amarillo
      color: "#111",
      border: "1px solid rgba(0,0,0,.08)",
      borderRadius: 12,
    };
  }

  return (
    <div className="card" style={{ padding: 10 }}>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {items.map((t) => {
          const createdAt = t.createdAt
            ? new Date(t.createdAt).toLocaleString()
            : "-";
          const dueAt = t.dueAt ? new Date(t.dueAt).toLocaleString() : "";
          const completedAt = t.completedAt
            ? new Date(t.completedAt).toLocaleString()
            : "";

          return (
            <li key={t._id} style={{ padding: 6 }}>
              <Link
                to={`/tasks/${t._id}`}
                style={{
                  display: "block",
                  padding: "10px 12px",
                  textDecoration: "none",
                  color: "inherit",
                  ...rowStyle(t),
                }}
                title="Ver detalle de la tarea"
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t.title}
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      Estado: {t.status} · Pri: {t.priority || "-"} · Creada:{" "}
                      {createdAt}
                      {dueAt ? ` · Vence: ${dueAt}` : ""}
                      {completedAt ? ` · Cerrada: ${completedAt}` : ""}
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ColorLegend() {
  const chip = (bg: string, color: string, label: string) => (
    <span
      style={{
        display: "inline-block",
        padding: "4px 8px",
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 700,
        background: bg,
        color,
        border: "1px solid rgba(0,0,0,.08)",
      }}
    >
      {label}
    </span>
  );
  return (
    <div
      className="muted"
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        marginBottom: 8,
        fontSize: 12,
      }}
    >
      {chip("#dcfce7", "#065f46", "Finalizada")}
      {chip("#e5e7eb", "#111827", "Vencida")}
      {chip("#fde68a", "#111", "Pendiente")}
    </div>
  );
}

function PaymentsList({ items }: { items: Payment[] }) {
  if (!items?.length)
    return <div className="card">No hay pagos asignados.</div>;

  // Orden: dueAt asc (sin dueAt al final)
  const sorted = items.slice().sort((a, b) => {
    const ta = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
    const tb = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
    return ta - tb;
  });

  return (
    <div className="card" style={{ padding: 0 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.3fr .8fr .8fr 1fr",
          gap: 10,
          padding: "10px 12px",
          borderBottom: "1px solid var(--border)",
          fontSize: 12,
          color: "#6b7280",
          fontWeight: 700,
        }}
      >
        <div>Título</div>
        <div>Vencimiento</div>
        <div>Estado</div>
        <div>Creado / Pagado</div>
      </div>

      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {sorted.map((p) => {
          const dueStr = fmtDT(p.dueAt);
          const isPaid = p.status === "paid";

          let badgeStyle: React.CSSProperties = {};
          let badgeText = "Pendiente";
          if (isPaid) {
            badgeText = "Pagado";
            badgeStyle = {
              background: "#fef3c7",
              color: "#111",
              border: "1px dashed #9CA3AF",
            };
          } else {
            const now = Date.now();
            const t = p.dueAt ? new Date(p.dueAt).getTime() : undefined;
            if (t && t < now)
              badgeStyle = { background: "#111827", color: "#fff" };
            else if (t && t - now <= 48 * 3600 * 1000)
              badgeStyle = { background: "#fee2e2", color: "#b91c1c" };
            else badgeStyle = { background: "#dcfce7", color: "#065f46" };
          }

          return (
            <li
              key={p._id}
              style={{
                display: "grid",
                gridTemplateColumns: "1.3fr .8fr .8fr 1fr",
                gap: 10,
                padding: "12px",
                borderTop: "1px solid var(--border)",
              }}
            >
              <Link
                to={`/payments/${p._id}`}
                style={{
                  textDecoration: "none",
                  color: "inherit",
                  fontWeight: 700,
                }}
              >
                {p.title}{" "}
                <span className="muted" style={{ fontSize: 12 }}>
                  {fmtARS(p.amount)}
                </span>
              </Link>

              <div className="muted">{dueStr}</div>

              <div>
                <span className="badge" style={badgeStyle}>
                  {badgeText}
                </span>
              </div>

              <div className="muted" style={{ fontSize: 12 }}>
                <div>
                  Creado por: <b>{displayUser(p.createdBy)}</b>
                </div>
                {isPaid && (
                  <div>
                    Pagado por: <b>{displayUser(p.paidBy)}</b>
                    {p.paidAt ? ` · el ${fmtDT(p.paidAt)}` : ""}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );

  function PaymentsList({ items }: { items: Payment[] }) {
    if (!items?.length)
      return <div className="card">No hay pagos asignados.</div>;

    const sorted = items.slice().sort((a, b) => {
      const ta = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
      const tb = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
      return ta - tb;
    });

    return (
      <div className="card" style={{ padding: 0 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.3fr .8fr .8fr 1fr",
            gap: 10,
            padding: "10px 12px",
            borderBottom: "1px solid var(--border)",
            fontSize: 12,
            color: "#6b7280",
            fontWeight: 700,
          }}
        >
          <div>Título</div>
          <div>Vencimiento</div>
          <div>Estado</div>
          <div>Creado / Pagado</div>
        </div>

        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {sorted.map((p) => {
            const dueStr = fmtDT(p.dueAt);
            const isPaid = p.status === "paid";

            let badgeStyle: React.CSSProperties = {};
            let badgeText = "Pendiente";
            if (isPaid) {
              badgeText = "Pagado";
              badgeStyle = {
                background: "#fef3c7",
                color: "#111",
                border: "1px dashed #9CA3AF",
              };
            } else {
              const now = Date.now();
              const t = p.dueAt ? new Date(p.dueAt).getTime() : undefined;
              if (t && t < now)
                badgeStyle = { background: "#111827", color: "#fff" };
              else if (t && t - now <= 48 * 3600 * 1000)
                badgeStyle = { background: "#fee2e2", color: "#b91c1c" };
              else badgeStyle = { background: "#dcfce7", color: "#065f46" };
            }

            return (
              <li
                key={p._id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.3fr .8fr .8fr 1fr",
                  gap: 10,
                  padding: "12px",
                  borderTop: "1px solid var(--border)",
                }}
              >
                <Link
                  to={`/payments/${p._id}`}
                  style={{
                    textDecoration: "none",
                    color: "inherit",
                    fontWeight: 700,
                  }}
                >
                  {p.title}{" "}
                  <span className="muted" style={{ fontSize: 12 }}>
                    {fmtARS(p.amount)}
                  </span>
                </Link>

                <div className="muted">{dueStr}</div>

                <div>
                  <span className="badge" style={badgeStyle}>
                    {badgeText}
                  </span>
                </div>

                <div className="muted" style={{ fontSize: 12 }}>
                  <div>
                    Creado por: <b>{displayUser(p.createdBy)}</b>
                  </div>
                  {isPaid && (
                    <div>
                      Pagado por: <b>{displayUser(p.paidBy)}</b>
                      {p.paidAt ? ` · el ${fmtDT(p.paidAt)}` : ""}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }
}

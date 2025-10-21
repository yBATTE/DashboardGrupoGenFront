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
  if (!u) return "—";
  if (typeof u === "string") return u;
  const full = [u.name, u.lastName].filter(Boolean).join(" ");
  return u.displayName || full || u.email || u._id || "—";
}

function monthRangeFromYYYYMM(yyyyMm: string) {
  // yyyyMm tipo "2025-10"
  const [y, m] = yyyyMm.split("-").map(Number);
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m, 0, 23, 59, 59, 999); // último día del mes
  return { start, end };
}

type ViewMode = "payments" | "tasks";

/* ============ UI helpers ============ */
function useDebounced<T>(value: T, delay = 250) {
  const [v, setV] = useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

function Pager({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const canPrev = page > 1;
  const canNext = page < pages;

  return (
    <div
      className="btn-row"
      style={{
        justifyContent: "space-between",
        alignItems: "center",
        padding: "10px 12px",
        borderTop: "1px solid var(--border)",
        flexWrap: "wrap",
        gap: 8,
      }}
    >
      <div className="muted" style={{ fontSize: 12 }}>
        Mostrando {total === 0 ? 0 : (page - 1) * pageSize + 1}–
        {Math.min(page * pageSize, total)} de {total}
      </div>

      <div className="btn-row" style={{ gap: 8 }}>
        {/* ⬇️ Select más grande y legible */}
        <select
          className="input"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          style={{
            height: 36,
            minWidth: 120, // <- ancho cómodo
            padding: "6px 10px", // <- más aire
            borderRadius: 10,
            lineHeight: "20px",
          }}
          title="Items por página"
        >
          {[10, 25, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n} / pág.
            </option>
          ))}
        </select>

        <button
          type="button"
          className="btn btn-ghost"
          disabled={!canPrev}
          onClick={() => onPageChange(1)}
          title="Primera página"
        >
          «
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!canPrev}
          onClick={() => onPageChange(page - 1)}
          title="Anterior"
        >
          ←
        </button>

        <div className="muted" style={{ minWidth: 110, textAlign: "center" }}>
          pág. <b>{page}</b> / {pages}
        </div>

        <button
          type="button"
          className="btn btn-ghost"
          disabled={!canNext}
          onClick={() => onPageChange(page + 1)}
          title="Siguiente"
        >
          →
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!canNext}
          onClick={() => onPageChange(pages)}
          title="Última página"
        >
          »
        </button>
      </div>
    </div>
  );
}

/* ============ Listas con buscador + paginación ============ */
function PaymentsListControls({
  items,
  title,
  dateField = "dueAt", // "dueAt" | "paidAt"
}: {
  items: Payment[];
  title: string;
  dateField?: "dueAt" | "paidAt";
}) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 250);

  // filtro por mes (YYYY-MM), vacío = sin filtro
  const [month, setMonth] = useState<string>("");

  const [page, setPage] = useState(1);
  const [ps, setPs] = useState(10);

  const filtered = useMemo(() => {
    const term = dq.trim().toLowerCase();

    let rows = items;

    // 1) filtro de texto
    if (term) {
      rows = rows.filter((p) =>
        String(p.title ?? "")
          .toLowerCase()
          .includes(term)
      );
    }

    // 2) filtro por mes (usa dueAt o paidAt según dateField)
    if (month) {
      const { start, end } = monthRangeFromYYYYMM(month);
      const s = start.getTime();
      const e = end.getTime();
      rows = rows.filter((p) => {
        const iso = (p as any)?.[dateField] as string | undefined;
        if (!iso) return false;
        const t = new Date(iso).getTime();
        return t >= s && t <= e;
      });
    }

    return rows;
  }, [items, dq, month, dateField]);

  // Orden: más reciente primero por campo dateField; sin fecha al final
  const sorted = useMemo(() => {
    return filtered.slice().sort((a, b) => {
      const ta = (a as any)?.[dateField]
        ? new Date((a as any)[dateField]).getTime()
        : -Infinity;
      const tb = (b as any)?.[dateField]
        ? new Date((b as any)[dateField]).getTime()
        : -Infinity;
      return tb - ta; // DESC
    });
  }, [filtered, dateField]);

  const total = sorted.length;
  const maxPage = Math.max(1, Math.ceil(total / ps));
  const safePage = Math.min(page, maxPage);
  const slice = sorted.slice((safePage - 1) * ps, safePage * ps);

  function setMonthAndReset(value: string) {
    setMonth(value);
    setPage(1);
  }

  return (
    <div className="card" style={{ padding: 0 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          padding: "10px 12px",
          borderBottom: "1px solid var(--border)",
          flexWrap: "wrap",
        }}
      >
        <div className="card-sub">{title}</div>

        <div className="btn-row" style={{ gap: 8 }}>
          {/* Filtro por mes */}
          <input
            type="month"
            className="input"
            value={month}
            onChange={(e) => setMonthAndReset(e.target.value)}
            style={{ height: 32, minWidth: 150 }}
            title={
              dateField === "paidAt"
                ? "Filtrar por mes de pago"
                : "Filtrar por mes de vencimiento"
            }
          />
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              const now = new Date();
              const y = now.getFullYear();
              const m = String(now.getMonth() + 1).padStart(2, "0");
              setMonthAndReset(`${y}-${m}`);
            }}
            title="Mes actual"
          >
            Mes actual
          </button>
          {month && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setMonthAndReset("")}
              title="Quitar filtro de mes"
            >
              Limpiar mes
            </button>
          )}

          {/* Buscador */}
          <input
            className="input"
            placeholder="Buscar por título…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            style={{ width: 280, height: 32 }}
            title="Buscar en esta lista"
          />
        </div>
      </div>

      {total === 0 ? (
        <div className="muted" style={{ padding: 12 }}>
          No hay resultados.
        </div>
      ) : (
        <PaymentsList items={slice} />
      )}

      <Pager
        total={total}
        page={safePage}
        pageSize={ps}
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPs(n);
          setPage(1);
        }}
      />
    </div>
  );
}

function TasksListControls({
  items,
  title,
  empty,
}: {
  items: any[];
  title: string;
  empty?: string;
}) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 250);
  const [page, setPage] = useState(1);
  const [ps, setPs] = useState(10);

  const filtered = useMemo(() => {
    const term = dq.trim().toLowerCase();
    if (!term) return items;
    return items.filter((t) =>
      String(t.title ?? "")
        .toLowerCase()
        .includes(term)
    );
  }, [items, dq]);

  const total = filtered.length;
  const maxPage = Math.max(1, Math.ceil(total / ps));
  const safePage = Math.min(page, maxPage);
  const slice = filtered.slice((safePage - 1) * ps, safePage * ps);

  return (
    <div className="card" style={{ padding: 0 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          padding: "10px 12px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="card-sub">{title}</div>
        <input
          className="input"
          placeholder="Buscar por título…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          style={{ width: 280, height: 32 }}
          title="Buscar en esta lista"
        />
      </div>

      {total === 0 ? (
        <div className="muted" style={{ padding: 12 }}>
          {empty ?? "Sin resultados."}
        </div>
      ) : (
        <TaskList items={slice} empty="" />
      )}

      <Pager
        total={total}
        page={safePage}
        pageSize={ps}
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPs(n);
          setPage(1);
        }}
      />
    </div>
  );
}

/* ============ Página ============ */
import * as React from "react";

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
    // si querés limitar a 6 meses: listPaymentsRange({ from: from.toISOString(), to: to.toISOString() })
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

              {/* Asignados vencidos (buscador + paginado) */}
              <PaymentsListControls
                title="Asignados vencidos"
                items={userPaymentsOverdue}
              />

              {/* Lista completa de asignados */}
              <div style={{ height: 10 }} />
              <PaymentsListControls
                title="Todos los asignados"
                items={userPaymentsAssigned}
              />

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
              <PaymentsListControls
                title="Pagados por el usuario"
                items={userPaymentsPaidBy}
              />
            </>
          )}

          {/* ======= VISTA TAREAS ======= */}
          {view === "tasks" && (
            <>
              <ColorLegend />

              <TasksListControls
                title="Recientes — Creadas por el usuario"
                items={data.lists.created ?? []}
                empty="No hay tareas creadas."
              />

              <div style={{ height: 10 }} />
              <TasksListControls
                title="Recientes — Asignadas al usuario (incluye equipos)"
                items={tasksAssigned}
                empty="No hay tareas asignadas."
              />

              <div style={{ height: 10 }} />
              <TasksListControls
                title="Recientes — Cerradas por el usuario"
                items={data.lists.closed ?? []}
                empty="No hay tareas cerradas."
              />
            </>
          )}
        </>
      )}
    </Layout>
  );
}

/* =================== Subcomponentes (presentacionales) =================== */
function TaskList({ items, empty }: { items: any[]; empty: string }) {
  if (!items?.length) return <div className="card">{empty}</div>;

  function rowStyle(t: any): React.CSSProperties {
    const now = Date.now();
    const isDone = t.status === "done";
    const due = t.dueAt ? new Date(t.dueAt).getTime() : NaN;
    const isOverdue = !isDone && Number.isFinite(due) && due < now;

    if (isDone) {
      return {
        background: "#dcfce7",
        color: "#065f46",
        border: "1px dashed #86efac",
        borderRadius: 12,
      };
    }
    if (isOverdue) {
      return {
        background: "#e5e7eb",
        color: "#111827",
        border: "1px solid #d1d5db",
        borderRadius: 12,
      };
    }
    return {
      background: "#fde68a",
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
    <>
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
    </>
  );
}

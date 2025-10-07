// apps/web/src/pages/PaymentsCalendar.tsx
import { useMemo, useCallback, useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Layout from "../components/Layout";

import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import {
  format as fmt,
  parse,
  startOfWeek,
  getDay,
  addHours,
  startOfMonth,
  endOfMonth,
  setHours,
  setMinutes,
  setSeconds,
  differenceInHours,
} from "date-fns";
import { es } from "date-fns/locale";

import { listPayments, Payment } from "../api/payments";
import { listTeams, Team } from "../api/teams";
import { searchUsers, BasicUser } from "../api/users";

/* ===== Localizer (ES) ===== */
const locales = { es };
const localizer = dateFnsLocalizer({
  format: fmt,
  parse,
  startOfWeek,
  getDay,
  locales,
});

/* ===== Utils ===== */
function fullName(u: any): string {
  if (!u) return "—";
  if (typeof u === "string") return u;
  const composed = [u.name, u.lastName].filter(Boolean).join(" ").trim();
  return u.displayName || composed || u.email || u._id || "—";
}
function displayUser(u: any): string {
  return fullName(u);
}
const formatDateTime = (iso?: string | null) =>
  iso ? fmt(new Date(iso), "dd/MM/yyyy HH:mm", { locale: es }) : "—";

function useDebounced<T>(value: T, delay = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

function startOfDayLocal(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day, 0, 0, 0, 0);
}
function endOfDayLocal(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day, 23, 59, 59, 999);
}

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1ffaM03ZDztLaMM0odRh9fS4-Yx9lpcog8r_a0uBaIqY/edit?gid=1012738625";
const SHEET_URL_DAY =
  "https://docs.google.com/spreadsheets/d/1ed4LzPSEmPPpQBgCkizcrZT1pSWTrO2XTSfL0VIf7Dc/edit?hl=es&gid=0#gid=0";

/* ===== Página ===== */
export default function PaymentsCalendar() {
  const nav = useNavigate();

  // fecha visible
  const [viewDate, setViewDate] = useState(new Date());
  const monthStart = useMemo(() => startOfMonth(viewDate), [viewDate]);
  const monthEnd = useMemo(() => endOfMonth(viewDate), [viewDate]);

  // pagos del mes
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["payments", monthStart.toISOString(), monthEnd.toISOString()],
    queryFn: () =>
      listPayments({
        from: monthStart.toISOString(),
        to: monthEnd.toISOString(),
      }),
  });

  // equipos (para el picker)
  const {
    data: teamsData,
    isLoading: loadingTeams,
    isError: errTeams,
  } = useQuery({
    queryKey: ["teams"],
    queryFn: listTeams,
  });

  /* ===== Filtros ===== */
  const [teamsSelected, setTeamsSelected] = useState<Team[]>([]);
  const [usersSelected, setUsersSelected] = useState<BasicUser[]>([]);
  const [openTeams, setOpenTeams] = useState(false);
  const [openUsers, setOpenUsers] = useState(false);

  function clearFilters() {
    setTeamsSelected([]);
    setUsersSelected([]);
  }

  // aplicar filtros base
  const baseFiltered = useMemo(() => {
    let rows = (data ?? []) as Payment[];

    const hasUser = (p: any, userId: string) => {
      const arr = Array.isArray(p.assigneeIds) ? p.assigneeIds : [];
      return arr.some((x: any) =>
        typeof x === "string" ? x === userId : x?._id === userId
      );
    };
    const hasTeam = (p: any, teamId: string) => {
      const arr = Array.isArray(p.teamIds) ? p.teamIds : [];
      return arr.some((x: any) =>
        typeof x === "string" ? x === teamId : x?._id === teamId
      );
    };

    if (usersSelected.length) {
      const uids = usersSelected.map((u) => u._id);
      rows = rows.filter((p) => uids.some((uid) => hasUser(p, uid)));
    }
    if (teamsSelected.length) {
      const tids = teamsSelected.map((t) => t._id);
      rows = rows.filter((p) => tids.some((tid) => hasTeam(p, tid)));
    }
    return rows;
  }, [data, usersSelected, teamsSelected]);

  /* ===== Calendario ===== */
  type CalendarEvent = {
    id: string;
    title: string;
    start: Date;
    end: Date;
    payment: Payment;
  };
  const events: CalendarEvent[] = useMemo(() => {
    const rows = baseFiltered.filter((p) => p.dueAt);
    return rows.map((p) => {
      const start = new Date(p.dueAt!);
      const end = addHours(start, 1);
      return { id: p._id, title: p.title, start, end, payment: p };
    });
  }, [baseFiltered]);

  const eventPropGetter = useCallback((event: CalendarEvent) => {
    const now = new Date();
    const isPaid = event.payment.status === "paid";

    let bg = "#fde68a";
    let color = "#111";
    let border = "1px solid rgba(0,0,0,.08)";

    if (isPaid) {
      bg = "#fef3c7";
      color = "#111";
      border = "1px dashed #9CA3AF";
    } else if (event.payment.dueAt) {
      const hours = differenceInHours(new Date(event.payment.dueAt), now);
      if (hours < 0) {
        bg = "#111827";
        color = "#fff";
      } else if (hours <= 48) {
        bg = "#fee2e2";
        color = "#b91c1c";
      } else {
        bg = "#dcfce7";
        color = "#065f46";
      }
    }

    return {
      style: {
        backgroundColor: bg,
        color,
        border,
        borderRadius: 8,
        fontWeight: 700,
        padding: "2px 6px",
      },
    };
  }, []);

  const onSelectEvent = useCallback(
    (e: CalendarEvent) => nav(`/payments/${e.id}`),
    [nav]
  );
  const onNavigate = useCallback((date: Date) => setViewDate(date), []);
  const minTime = useMemo(
    () => setSeconds(setMinutes(setHours(new Date(), 6), 0), 0),
    []
  );
  const maxTime = useMemo(
    () => setSeconds(setMinutes(setHours(new Date(), 18), 0), 0),
    []
  );
  const scrollTo = useMemo(
    () => setSeconds(setMinutes(setHours(new Date(), 8), 0), 0),
    []
  );

  /* ===== Controles de LISTA ===== */
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const clearRange = () => {
    setFromDate("");
    setToDate("");
  };

  const [textQ, setTextQ] = useState("");
  const dqText = useDebounced(textQ, 250);

  const [sortDue, setSortDue] = useState<"asc" | "desc">("asc");
  const [sortUnpaidFirst, setSortUnpaidFirst] = useState(false);

  const toggleDueSort = () =>
    setSortDue((prev) => (prev === "asc" ? "desc" : "asc"));
  const toggleUnpaidFirst = () =>
    setSortUnpaidFirst((prev) => {
      const next = !prev;
      if (!next) setSortDue("asc");
      return next;
    });

  const monthList = useMemo(() => {
    const defaultStart = startOfMonth(viewDate).getTime();
    const defaultEnd = endOfMonth(viewDate).getTime();

    const rangeStart = fromDate
      ? startOfDayLocal(fromDate).getTime()
      : defaultStart;
    const rangeEnd = toDate ? endOfDayLocal(toDate).getTime() : defaultEnd;

    const term = dqText.trim().toLowerCase();

    const rows = (baseFiltered ?? [])
      .filter((p) => {
        if (!p.dueAt) return false;
        const t = new Date(p.dueAt).getTime();
        if (t < rangeStart || t > rangeEnd) return false;
        if (term && !String(p.title ?? "").toLowerCase().includes(term))
          return false;
        return true;
      })
      .sort((a, b) => {
        if (sortUnpaidFirst) {
          const ap = a.status === "paid" ? 1 : 0;
          const bp = b.status === "paid" ? 1 : 0;
          if (ap !== bp) return ap - bp;
        }
        const da = new Date(a.dueAt!).getTime();
        const db = new Date(b.dueAt!).getTime();
        return sortDue === "asc" ? da - db : db - da;
      });

    return rows;
  }, [baseFiltered, viewDate, sortDue, sortUnpaidFirst, fromDate, toDate, dqText]);

  return (
    <Layout
      title="Pagos"
      actions={
        <div className="btn-row">
          <a
            href={SHEET_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline"
            title="Abrir Excel de pagos"
          >
            📊 Ver Excel por mes
          </a>
          <a
            href={SHEET_URL_DAY}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline"
            title="Abrir Excel de pagos"
          >
            📊 Ver Excel por día
          </a>
          <Link to="/new/payments" className="btn btn-primary">
            + Crear pago
          </Link>
        </div>
      }
    >
      {isLoading && <div className="card">Cargando…</div>}
      {isError && (
        <div
          className="card"
          style={{ borderColor: "var(--danger)", background: "#fff4f4" }}
        >
          Error.{" "}
          <button className="btn btn-ghost" onClick={() => refetch()}>
            Reintentar
          </button>
        </div>
      )}

      {/* ===== Calendario ===== */}
      <div className="card" style={{ padding: 0 }}>
        <div
          style={{
            padding: "12px 14px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <strong>Calendario de pagos</strong>
          <span className="muted" style={{ marginLeft: 8 }}>
            — rojo: vence ≤ 48 h · verde: &gt; 48 h · negro: vencido · amarillo:
            pagado
          </span>
        </div>
        <div style={{ height: 600 }}>
          <Calendar
            localizer={localizer}
            culture="es"
            events={events}
            defaultView={Views.MONTH}
            views={[Views.MONTH, Views.WEEK, Views.DAY]}
            startAccessor="start"
            endAccessor="end"
            onSelectEvent={onSelectEvent}
            onNavigate={onNavigate}
            eventPropGetter={eventPropGetter}
            toolbar
            popup
            min={minTime}
            max={maxTime}
            step={30}
            timeslots={2}
            scrollToTime={scrollTo}
            messages={{
              month: "Mes",
              week: "Semana",
              day: "Día",
              today: "Hoy",
              previous: "Anterior",
              next: "Siguiente",
              allDay: "Todo el día",
              noEventsInRange: "No hay pagos en este rango",
              date: "Fecha",
              time: "Hora",
              event: "Pago",
            }}
          />
        </div>
      </div>

      {/* ===== Filtros ===== */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-sub" style={{ marginBottom: 8 }}>
          Filtros (afectan al calendario y a la lista)
        </div>

        <label className="label">Equipo(s)</label>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setOpenTeams(true)}
            disabled={loadingTeams || !!errTeams}
            title={errTeams ? "Error al cargar equipos" : undefined}
          >
            + Elegir equipos
          </button>
          {(usersSelected.length > 0 || teamsSelected.length > 0) && (
            <button type="button" className="btn btn-ghost" onClick={clearFilters}>
              Limpiar filtros
            </button>
          )}
        </div>
        {teamsSelected.length > 0 && (
          <div className="chips" style={{ marginTop: 8 }}>
            {teamsSelected.map((t) => (
              <span key={t._id} className="chip">
                {t.name}
                <button
                  type="button"
                  onClick={() =>
                    setTeamsSelected((prev) => prev.filter((x) => x._id !== t._id))
                  }
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <label className="label" style={{ marginTop: 12 }}>
          Usuario(s)
        </label>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setOpenUsers(true)}
          >
            + Elegir usuarios
          </button>
        </div>
        {usersSelected.length > 0 && (
          <div className="chips" style={{ marginTop: 8 }}>
            {usersSelected.map((u) => (
              <span key={u._id} className="chip">
                {fullName(u) || u.email}
                <button
                  type="button"
                  onClick={() =>
                    setUsersSelected((prev) => prev.filter((x) => x._id !== u._id))
                  }
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ===== Encabezado + Rango ===== */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 14,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <h2 className="h2" style={{ margin: 0 }}>
          Pagos del mes ({fmt(monthStart, "MMMM yyyy", { locale: es })})
        </h2>

        <div className="btn-row" style={{ alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 12 }}>Rango para la lista:</span>
          <input
            type="date"
            className="input"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            placeholder="Desde"
            style={{ width: 150 }}
          />
          <input
            type="date"
            className="input"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            placeholder="Hasta"
            style={{ width: 150 }}
          />
          {(fromDate || toDate) && (
            <button type="button" className="btn btn-ghost" onClick={clearRange}>
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* ===== Lista ===== */}
      {!monthList.length ? (
        <div className="card" style={{ marginTop: 8 }}>
          No hay pagos con los filtros actuales.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, marginTop: 8 }}>
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
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>Título</span>
              <input
                className="input"
                placeholder="Buscar…"
                value={textQ}
                onChange={(e) => setTextQ(e.target.value)}
                style={{ height: 28, padding: "2px 8px" }}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>Vencimiento</span>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={toggleDueSort}
                title="Ordenar por vencimiento"
                style={{ padding: "2px 6px", fontSize: 12 }}
              >
                {sortDue === "asc" ? "▲" : "▼"}
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>Estado</span>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={toggleUnpaidFirst}
                title="Pendientes primero"
                style={{
                  padding: "2px 6px",
                  fontSize: 12,
                  border: sortUnpaidFirst ? "1px solid var(--border)" : "1px solid transparent",
                  borderRadius: 8,
                }}
              >
                Pendientes ↑
              </button>
            </div>

            <div>Creado / Pagado</div>
          </div>

          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {monthList.map((p) => {
              const dueStr = formatDateTime(p.dueAt);

              let badgeStyle: React.CSSProperties = {};
              let badgeText = "Pendiente";
              if (p.status === "paid") {
                badgeText = "Pagado";
                badgeStyle = {
                  background: "#fef3c7",
                  color: "#111",
                  border: "1px dashed #9CA3AF",
                };
              } else if (p.dueAt) {
                const hours = differenceInHours(new Date(p.dueAt), new Date());
                if (hours < 0) {
                  badgeStyle = { background: "#111827", color: "#fff" };
                } else if (hours <= 48) {
                  badgeStyle = { background: "#fee2e2", color: "#b91c1c" };
                } else {
                  badgeStyle = { background: "#dcfce7", color: "#065f46" };
                }
              }

              return (
                <li
                  key={p._id}
                  onClick={() => nav(`/payments/${p._id}`)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.3fr .8fr .8fr 1fr",
                    gap: 10,
                    padding: "12px",
                    borderTop: "1px solid var(--border)",
                    cursor: "pointer",
                  }}
                  title="Ver detalle"
                >
                  <div
                    style={{
                      fontWeight: 700,
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    {p.title}
                    <span className="muted" style={{ fontSize: 12 }}>
                      {Intl.NumberFormat("es-AR", {
                        style: "currency",
                        currency: "ARS",
                      }).format(p.amount)}
                    </span>
                  </div>

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
                    {p.status === "paid" && (
                      <div>
                        Pagado por: <b>{displayUser(p.paidBy)}</b>
                        {p.paidAt ? ` · el ${formatDateTime(p.paidAt)}` : ""}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ===== Modales ===== */}
      {openTeams && (
        <TeamPickerModal
          teams={teamsData ?? []}           // ✅ se pasa la prop teams
          initiallySelected={teamsSelected}
          onClose={() => setOpenTeams(false)}
          onSave={(sel) => {
            setTeamsSelected(sel);
            setOpenTeams(false);
          }}
        />
      )}
      {openUsers && (
        <UserPickerModal
          initiallySelected={usersSelected}
          onClose={() => setOpenUsers(false)}
          onSave={(sel) => {
            setUsersSelected(sel);
            setOpenUsers(false);
          }}
        />
      )}
    </Layout>
  );
}

/* ===== Modales ===== */
function ModalBase({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  // ❌ Sin ESC ni click-outside
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.35)",
        zIndex: 60,
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
    >
      <div className="card" style={{ maxWidth: 640, width: "100%" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <div style={{ fontWeight: 800 }}>{title}</div>
          <button className="btn btn-ghost" onClick={onClose}>
            Cerrar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function TeamPickerModal({
  teams,
  initiallySelected,
  onSave,
  onClose,
}: {
  teams: Team[];
  initiallySelected: Team[];
  onSave: (teams: Team[]) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 200);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initiallySelected.map((t) => t._id))
  );

  const pool = useMemo(
    () => (teams ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [teams]
  );
  const byId = useMemo(() => new Map(pool.map((t) => [t._id, t])), [pool]);

  const filtered = useMemo(() => {
    const term = dq.trim().toLowerCase();
    if (!term) return pool;
    return pool.filter((t) => t.name.toLowerCase().includes(term));
  }, [pool, dq]);

  // ⬇️ mostrar en la lista SOLO los no seleccionados
  const available = useMemo(
    () => filtered.filter((t) => !selectedIds.has(t._id)),
    [filtered, selectedIds]
  );

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function save() {
    const items = Array.from(selectedIds)
      .map((id) => byId.get(id))
      .filter(Boolean) as Team[];
    onSave(items);
  }

  const hasSel = selectedIds.size > 0;

  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderBottom: "1px solid var(--border)",
    cursor: "pointer",
  };

  return (
    <ModalBase title="Elegir equipos" onClose={onClose}>
      <input
        className="input"
        placeholder="Buscar equipo…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
      />
      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
        Click en un equipo para agregarlo. Usá “×” en la barra para quitarlo.
      </div>

      {/* Marco de altura fija: lista con scroll + seleccionados con transición */}
      <div
        style={{
          marginTop: 10,
          border: "1px solid var(--border)",
          borderRadius: 12,
          height: 360,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Lista (solo NO seleccionados) */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {available.map((t) => (
            <div
              key={t._id}
              role="button"
              tabIndex={0}
              onClick={() => toggle(t._id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggle(t._id)}
              style={rowStyle}
              title="Agregar a seleccionados"
            >
              {/* sin checkbox */}
              <div style={{ fontWeight: 700 }}>{t.name}</div>
              <div className="muted">{t.members?.length ?? 0} miembro/s</div>
            </div>
          ))}
          {!available.length && (
            <div className="muted" style={{ padding: 12 }}>
              No hay equipos para agregar.
            </div>
          )}
        </div>

        {/* Seleccionados */}
        <div
          style={{
            borderTop: "1px solid var(--border)",
            padding: hasSel ? "8px 10px" : "0 10px",
            maxHeight: hasSel ? 200 : 0,
            opacity: hasSel ? 1 : 0,
            overflow: "hidden",
            transition: "max-height .25s ease, opacity .2s ease, padding .2s ease",
          }}
        >
          <div className="muted" style={{ marginBottom: 6 }}>
            Seleccionados:
          </div>
          <div className="chips">
            {Array.from(selectedIds).map((id) => {
              const t = byId.get(id);
              if (!t) return null;
              return (
                <span key={id} className="chip">
                  {t.name}
                  <button type="button" onClick={() => toggle(id)}>×</button>
                </span>
              );
            })}
          </div>
        </div>
      </div>

      <div className="btn-row" style={{ marginTop: 12 }}>
        <button className="btn btn-primary" onClick={save}>
          Agregar
        </button>
        <button className="btn btn-ghost" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </ModalBase>
  );
}

function UserPickerModal({
  initiallySelected,
  excludeIds = [],
  onSave,
  onClose,
}: {
  initiallySelected: BasicUser[];
  excludeIds?: string[];
  onSave: (users: BasicUser[]) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 250);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initiallySelected.map((u) => u._id))
  );
  const [cache, setCache] = useState<Record<string, BasicUser>>(
    () => Object.fromEntries(initiallySelected.map((u) => [u._id, u]))
  );

  const { data: results, isLoading } = useQuery({
    queryKey: ["userSearch", dq],
    queryFn: () => searchUsers(dq),
  });

  useEffect(() => {
    if (results?.length) {
      setCache((prev) => ({
        ...prev,
        ...Object.fromEntries(results.map((u) => [u._id, u])),
      }));
    }
  }, [results]);

  const exclude = useMemo(() => new Set(excludeIds), [excludeIds]);
  const filtered = useMemo(
    () => (results ?? []).filter((u) => !exclude.has(u._id)),
    [results, exclude]
  );

  // ⬇️ solo los NO seleccionados en la lista
  const available = useMemo(
    () => filtered.filter((u) => !selectedIds.has(u._id)),
    [filtered, selectedIds]
  );

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function save() {
    const ids = Array.from(selectedIds);
    const users = ids.map((id) => cache[id]).filter(Boolean) as BasicUser[];
    onSave(users);
  }

  const hasSel = selectedIds.size > 0;

  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderBottom: "1px solid var(--border)",
    cursor: "pointer",
  };

  return (
    <ModalBase title="Elegir usuarios" onClose={onClose}>
      <input
        className="input"
        placeholder="Buscar por nombre o email…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
      />
      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
        Click en un usuario para agregarlo. Usá “×” en la barra para quitarlo.
      </div>

      <div
        style={{
          marginTop: 10,
          border: "1px solid var(--border)",
          borderRadius: 12,
          height: 360,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Lista (solo no seleccionados) */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {isLoading && <div className="card">Buscando…</div>}
          {!isLoading && !available.length && (
            <div className="muted" style={{ padding: 12 }}>
              No hay resultados
            </div>
          )}
          {available.map((u) => {
            const label =
              "lastName" in u && (u as any).lastName
                ? `${u.name ?? ""} ${(u as any).lastName}`.trim()
                : u.name || "(sin nombre)";
            return (
              <div
                key={u._id}
                role="button"
                tabIndex={0}
                onClick={() => toggle(u._id)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggle(u._id)}
                style={rowStyle}
                title="Agregar a seleccionados"
              >
                {/* sin checkbox */}
                <div style={{ fontWeight: 700 }}>{label}</div>
                <div className="muted">{u.email}</div>
              </div>
            );
          })}
        </div>

        {/* Seleccionados */}
        <div
          style={{
            borderTop: "1px solid var(--border)",
            padding: hasSel ? "8px 10px" : "0 10px",
            maxHeight: hasSel ? 200 : 0,
            opacity: hasSel ? 1 : 0,
            overflow: "hidden",
            transition: "max-height .25s ease, opacity .2s ease, padding .2s ease",
          }}
        >
          <div className="muted" style={{ marginBottom: 6 }}>
            Seleccionados:
          </div>
          <div className="chips">
            {Array.from(selectedIds).map((id) => {
              const u = cache[id];
              if (!u) return null;
              const label =
                "lastName" in u && (u as any).lastName
                  ? `${u.name ?? ""} ${(u as any).lastName}`.trim()
                  : u.name || u.email;
              return (
                <span key={id} className="chip">
                  {label}
                  <button type="button" onClick={() => toggle(id)}>×</button>
                </span>
              );
            })}
          </div>
        </div>
      </div>

      <div className="btn-row" style={{ marginTop: 12 }}>
        <button className="btn btn-primary" onClick={save}>
          Agregar
        </button>
        <button className="btn btn-ghost" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </ModalBase>
  );
}


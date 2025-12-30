// PaymentsCalendar.tsx
import { useMemo, useCallback, useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Layout from "../components/Layout";

import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import type { ToolbarProps, View, EventProps } from "react-big-calendar";
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

import * as XLSX from "xlsx";

import { listPayments, Payment } from "../api/payments";
import { listTeams, Team } from "../api/teams";
import { getMe } from "../api/users";

/* ===== Localizer (ES) ===== */
const locales = { es };
const localizer = dateFnsLocalizer({
  format: fmt,
  parse,
  startOfWeek,
  getDay,
  locales,
});

/* ===== URLs de Google Sheets (para admins) ===== */
const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1ffaM03ZDztLaMM0odRh9fS4-Yx9lpcog8r_a0uBaIqY/edit?gid=1012738625";
const SHEET_URL_DAY =
  "https://docs.google.com/spreadsheets/d/1ed4LzPSEmPPpQBgCkizcrZT1pSWTrO2XTSfL0VIf7Dc/edit?gid=0";

/* ===== Utils ===== */
function fullName(u: any): string {
  if (!u) return "—";
  if (typeof u === "string") return u;
  const composed = [u.name, (u as any).lastName].filter(Boolean).join(" ").trim();
  return (u as any).displayName || composed || u.email || u._id || "—";
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

/* ===== Loader overlay ===== */
function PageLoader({
  visible,
  text = "Cargando…",
}: {
  visible: boolean;
  text?: string;
}) {
  if (!visible) return null;
  return (
    <div
      aria-busy="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(255,255,255,.85)",
        backdropFilter: "blur(2px)",
        zIndex: 9999,
        display: "grid",
        placeItems: "center",
      }}
    >
      <div style={{ display: "grid", gap: 12, placeItems: "center" }}>
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          role="img"
          aria-label="cargando"
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
            opacity="0.15"
          />
          <path
            d="M22 12a10 10 0 0 0-10-10"
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
          >
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 12 12"
              to="360 12 12"
              dur="0.8s"
              repeatCount="indefinite"
            />
          </path>
        </svg>
        <div style={{ fontWeight: 800 }}>{text}</div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Preparando calendario y lista de pagos…
        </div>
      </div>
    </div>
  );
}

/* ===== Helpers de exportación (XLSX/CSV) ===== */
function buildExportRows(
  payments: Payment[],
  {
    dateMode,
    rangeStart,
    rangeEnd,
  }: { dateMode: "due" | "paid" | "overdue" | "upcoming"; rangeStart: Date; rangeEnd: Date }
) {
  const start = rangeStart.getTime();
  const end = rangeEnd.getTime();

  const toEsStatus = (s?: string) => (s === "paid" ? "Pagado" : "Pendiente");
  const fmtD = (d?: string | Date | null) =>
    d ? fmt(new Date(d), "dd/MM/yyyy HH:mm", { locale: es }) : "";

  const now = Date.now();

  return payments
    .filter((p) => {
      const ref = dateMode === "paid" ? p.paidAt : p.dueAt;
      if (!ref) return false;
      const t = new Date(ref).getTime();
      if (t < start || t > end) return false;

      if (dateMode === "paid") return p.status === "paid";
      if (dateMode === "overdue")
        return p.status !== "paid" && p.dueAt && new Date(p.dueAt).getTime() < now;
      if (dateMode === "upcoming")
        return p.status !== "paid" && p.dueAt && new Date(p.dueAt).getTime() >= now;

      return true; // "due"
    })
    .map((p) => {
      const refDate = dateMode === "paid" ? p.paidAt : p.dueAt;
      return {
        Título: p.title ?? "",
        MontoARS: Number(p.amount ?? 0),
        Estado: toEsStatus(p.status),
        [dateMode === "paid" ? "Pagado" : "Vencimiento"]: fmtD(refDate),
        "Creado por": displayUser(p.createdBy),
        "Creado el": fmtD((p as any)?.createdAt),
        "Pagado por": p.status === "paid" ? displayUser(p.paidBy) : "",
        "Pagado el": p.status === "paid" ? fmtD(p.paidAt) : "",
        Descripción: (p as any)?.description ?? "",
        Id: p._id,
      };
    });
}

function downloadRows(rows: any[], filenameBase: string, format: "xlsx" | "csv" = "xlsx") {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pagos");

  const ext = format === "csv" ? "csv" : "xlsx";
  const bookType = format === "csv" ? "csv" : "xlsx";
  XLSX.writeFile(wb, `${filenameBase}.${ext}`, { bookType });
}

/* ===== Tipos ===== */
type CalendarEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  payment: Payment;
  isOverflow?: boolean;
  overflowEvents?: CalendarEvent[];
};

/* ========= THEME: Toolbar & Event ========= */
const ModernToolbar: React.FC<ToolbarProps<CalendarEvent, object>> = ({
  label,
  onNavigate,
  onView,
  view,
}) => {
  const Btn = (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button
      {...props}
      className="btn btn-ghost"
      style={{
        border: "1px solid var(--border)",
        padding: "6px 10px",
        borderRadius: 10,
        fontWeight: 700,
      }}
    />
  );

  const SegBtn = ({
    active,
    children,
    onClick,
  }: {
    active?: boolean;
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button
      onClick={onClick}
      className="btn btn-ghost"
      style={{
        padding: "6px 10px",
        fontWeight: active ? 800 : 600,
        background: active ? "var(--bg-soft)" : "transparent",
      }}
    >
      {children}
    </button>
  );

  return (
    <div
      style={{
        padding: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div style={{ display: "flex", gap: 8 }}>
        <Btn onClick={() => onNavigate("TODAY" as any)}>Hoy</Btn>
        <Btn onClick={() => onNavigate("PREV" as any)}>←</Btn>
        <Btn onClick={() => onNavigate("NEXT" as any)}>→</Btn>
      </div>

      <div style={{ fontWeight: 900, fontSize: 18 }}>{label}</div>

      <div
        style={{
          display: "inline-flex",
          border: "1px solid var(--border)",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        <SegBtn active={view === "month"} onClick={() => onView("month" as View)}>
          Mes
        </SegBtn>
        <SegBtn active={view === "week"} onClick={() => onView("week" as View)}>
          Semana
        </SegBtn>
        <SegBtn active={view === "day"} onClick={() => onView("day" as View)}>
          Día
        </SegBtn>
      </div>
    </div>
  );
};

/** Evento “pill” con soporte para overflow */
const EventPill: React.FC<EventProps<CalendarEvent>> = ({ event }) => {
  const isOverflow = event.isOverflow;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: isOverflow ? "2px 6px" : "4px 8px",
        borderRadius: 12,
        fontWeight: 800,
        boxShadow: "0 2px 8px rgba(0,0,0,.06)",
        border: isOverflow ? "1px solid rgba(0,0,0,.15)" : "1px dashed rgba(0,0,0,.15)",
        background: isOverflow ? "#f3f4f6" : undefined,
      }}
      title={event?.payment?.description || event?.title}
    >
      <span
        style={{
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {event.title}
      </span>
    </div>
  );
};

/* ===== Dropdown simple ===== */
function Dropdown({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        className="btn btn-outline"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label} ▾
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            minWidth: 220,
            background: "var(--bg, #fff)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            marginTop: 6,
            boxShadow: "0 8px 24px rgba(0,0,0,.12)",
            zIndex: 100,
            overflow: "hidden",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function DropdownItem({
  onClick,
  href,
  newTab,
  children,
  danger = false,
}: {
  onClick?: () => void;
  href?: string;
  newTab?: boolean;
  children: React.ReactNode;
  danger?: boolean;
}) {
  const style: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    fontSize: 14,
    cursor: "pointer",
    borderBottom: "1px solid var(--border)",
    color: danger ? "#b91c1c" : "inherit",
  };
  const inner = (
    <div
      style={style}
      onClick={onClick}
      role="menuitem"
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) onClick();
      }}
      tabIndex={0}
    >
      {children}
    </div>
  );
  if (href) {
    return (
      <a
        href={href}
        target={newTab ? "_blank" : undefined}
        rel={newTab ? "noopener noreferrer" : undefined}
        style={{ textDecoration: "none", color: "inherit" }}
      >
        {inner}
      </a>
    );
  }
  return inner;
}

/* ===== Página ===== */
export default function PaymentsCalendar() {
  const nav = useNavigate();

  // fecha visible + view
  const [viewDate, setViewDate] = useState(new Date());
  const [view, setView] = useState<View>(Views.MONTH);
  const monthStart = useMemo(() => startOfMonth(viewDate), [viewDate]);
  const monthEnd = useMemo(() => endOfMonth(viewDate), [viewDate]);

  // pagos del mes
  const {
    data: payments,
    isLoading: loadingPayments,
    isError: errorPayments,
    refetch,
    isFetching: fetchingPayments,
  } = useQuery<Payment[]>({
    queryKey: ["payments", monthStart.toISOString(), monthEnd.toISOString()],
    queryFn: () =>
      listPayments({
        from: monthStart.toISOString(),
        to: monthEnd.toISOString(),
      }),
    staleTime: 10_000,
  });

  // equipos
  const {
    data: teamsData,
    isLoading: loadingTeams,
    isError: errTeams,
  } = useQuery<Team[]>({
    queryKey: ["teams"],
    queryFn: () => listTeams(),
    staleTime: 60_000,
  });

  // ===== Usuario actual (rol) =====
  type Me = { _id: string; name?: string; lastName?: string; email: string; roles?: string[] };
  const { data: me, isLoading: loadingMe } = useQuery<Me>({
    queryKey: ["me"],
    queryFn: getMe,
    staleTime: 60_000,
  });
  const isAdmin = !!me?.roles?.some((r) => String(r).toLowerCase() === "admin");

  // Loader overlay visible en primera carga
  const bigLoaderVisible = (loadingPayments || loadingTeams || loadingMe) && !payments;

  /* ===== Filtro opcional por Equipo(s)
     ✅ Importante: teamsSelected vacío => "Todos los temas" (sin filtro) ===== */
  const [teamsSelected, setTeamsSelected] = useState<Team[]>([]);

  // modal 1: elegir tema principal (SINGLE)
  const [openTopicSingle, setOpenTopicSingle] = useState(false);

  // modal 2: agregar/quitar más temas (MULTI)
  const [openTeamsManage, setOpenTeamsManage] = useState(false);

  function clearTeams() {
    // ✅ Reset a "ver todo"
    setTeamsSelected([]);
  }

  // label: muestra "Todos" cuando no hay selección o cuando están todos
  const selectedTeamsLabel = useMemo(() => {
    const total = teamsData?.length ?? 0;
    if (!total) return "Cargando temas…";

    if (teamsSelected.length === 0 || teamsSelected.length === total) return "Todos los temas";
    if (teamsSelected.length === 1) return teamsSelected[0].name;
    return `${teamsSelected[0].name} +${teamsSelected.length - 1}`;
  }, [teamsSelected, teamsData]);

  // aplicar filtro base. Si no hay equipos seleccionados, mostramos TODO.
  const baseFiltered = useMemo(() => {
    const rows = (payments ?? []) as Payment[];
    if (!teamsSelected.length) return rows;

    const hasTeam = (p: any, teamId: string) => {
      const arr = Array.isArray(p.teamIds) ? p.teamIds : [];
      return arr.some((x: any) => (typeof x === "string" ? x === teamId : x?._id === teamId));
    };

    const tids = teamsSelected.map((t) => t._id);
    return rows.filter((p) => tids.some((tid) => hasTeam(p, tid)));
  }, [payments, teamsSelected]);

  /* ===== Toggle global (impacta Calendario + Lista) ===== */
  type Mode = "due" | "paid" | "overdue" | "upcoming";
  const [dateMode, setDateMode] = useState<Mode>("due");

  /* ===== Eventos base (sin agrupar) ===== */
  const eventsBaseDue: CalendarEvent[] = useMemo(() => {
    const rows = baseFiltered.filter((p) => p.dueAt);
    return rows.map((p) => {
      const start = new Date(p.dueAt!);
      const end = addHours(start, 1);
      return { id: p._id, title: p.title, start, end, payment: p };
    });
  }, [baseFiltered]);

  const eventsBasePaid: CalendarEvent[] = useMemo(() => {
    const rows = baseFiltered.filter((p) => p.status === "paid" && p.paidAt);
    return rows.map((p) => {
      const start = new Date(p.paidAt!);
      const end = addHours(start, 1);
      return { id: p._id, title: p.title, start, end, payment: p };
    });
  }, [baseFiltered]);

  const eventsBaseOverdue: CalendarEvent[] = useMemo(() => {
    const now = Date.now();
    const rows = baseFiltered.filter(
      (p) => p.status !== "paid" && p.dueAt && new Date(p.dueAt).getTime() < now
    );
    return rows.map((p) => {
      const start = new Date(p.dueAt!);
      const end = addHours(start, 1);
      return { id: p._id, title: p.title, start, end, payment: p };
    });
  }, [baseFiltered]);

  const eventsBaseUpcoming: CalendarEvent[] = useMemo(() => {
    const now = Date.now();
    const rows = baseFiltered.filter(
      (p) => p.status !== "paid" && p.dueAt && new Date(p.dueAt).getTime() >= now
    );
    return rows.map((p) => {
      const start = new Date(p.dueAt!);
      const end = addHours(start, 1);
      return { id: p._id, title: p.title, start, end, payment: p };
    });
  }, [baseFiltered]);

  /* ===== Agrupar por día en vista MONTH (máx. 1 visible + “+N más”) ===== */
  function groupForMonth(events: CalendarEvent[]): CalendarEvent[] {
    const keyOf = (d: Date) => fmt(d, "yyyy-MM-dd");
    const byDay = new Map<string, CalendarEvent[]>();

    events.forEach((e) => {
      const k = keyOf(e.start);
      const arr = byDay.get(k) ?? [];
      arr.push(e);
      byDay.set(k, arr);
    });

    const out: CalendarEvent[] = [];

    for (const [k, arrRaw] of byDay.entries()) {
      const arr = arrRaw.slice().sort((a, b) => a.start.getTime() - b.start.getTime());

      if (arr.length <= 1) {
        out.push(...arr);
        continue;
      }

      const [first, ...rest] = arr;
      out.push(first);

      const [yy, mm, dd] = k.split("-").map(Number);
      const overflowEvent: CalendarEvent = {
        id: `overflow-${k}-${rest.length}`,
        title: `+${rest.length} más`,
        start: new Date(yy, mm - 1, dd, 12, 0, 0, 0),
        end: new Date(yy, mm - 1, dd, 12, 30, 0, 0),
        payment: { _id: `overflow-${k}`, title: "", amount: 0, status: "pending" } as any,
        isOverflow: true,
        overflowEvents: rest,
      };

      out.push(overflowEvent);
    }

    return out;
  }

  const eventsDue: CalendarEvent[] = useMemo(
    () => (view === Views.MONTH ? groupForMonth(eventsBaseDue) : eventsBaseDue),
    [eventsBaseDue, view]
  );
  const eventsPaid: CalendarEvent[] = useMemo(
    () => (view === Views.MONTH ? groupForMonth(eventsBasePaid) : eventsBasePaid),
    [eventsBasePaid, view]
  );
  const eventsOverdue: CalendarEvent[] = useMemo(
    () => (view === Views.MONTH ? groupForMonth(eventsBaseOverdue) : eventsBaseOverdue),
    [eventsBaseOverdue, view]
  );
  const eventsUpcoming: CalendarEvent[] = useMemo(
    () => (view === Views.MONTH ? groupForMonth(eventsBaseUpcoming) : eventsBaseUpcoming),
    [eventsBaseUpcoming, view]
  );

  const calendarEvents = useMemo(() => {
    if (dateMode === "paid") return eventsPaid;
    if (dateMode === "overdue") return eventsOverdue;
    if (dateMode === "upcoming") return eventsUpcoming;
    return eventsDue;
  }, [dateMode, eventsDue, eventsPaid, eventsOverdue, eventsUpcoming]);

  const noEventsMessage = useMemo(() => {
    if (dateMode === "paid") return "No hay pagos realizados en este rango";
    if (dateMode === "overdue") return "No hay pagos vencidos en este rango";
    if (dateMode === "upcoming") return "No hay pagos pendientes en fecha en este rango";
    return "No hay pagos en este rango";
  }, [dateMode]);

  // estilos de eventos
  const eventPropGetter = useCallback((event: CalendarEvent) => {
    if (event.isOverflow) {
      return {
        style: {
          backgroundColor: "#e5e7eb",
          color: "#111827",
          border: "1px solid rgba(0,0,0,.15)",
          borderRadius: 8,
          fontWeight: 800,
          padding: "2px 6px",
        },
      };
    }

    const now = new Date();
    let bg = "#fde68a";
    let color = "#111";
    let border = "1px solid rgba(0,0,0,.08)";

    if (event.payment.status === "paid") {
      bg = "#1a17ecff";
      color = "#f8f4f4ff";
      border = "1px dashed #9CA3AF";
    } else if (event.payment.dueAt) {
      const hours = differenceInHours(new Date(event.payment.dueAt), now);
      if (hours < 0) {
        bg = "#ff1313ff";
        color = "#fff";
      } else if (hours <= 48) {
        bg = "#fffc46ff";
        color = "#000000ff";
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

  /* ======= MODAL “Pagos de este día” (día seleccionado) ======= */
  const [dayList, setDayList] = useState<Payment[] | null>(null);
  const [dayDate, setDayDate] = useState<Date | null>(null);

  const openDayModal = useCallback(
    (date: Date) => {
      const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
      const end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
      const nowTs = Date.now();

      const rows = (baseFiltered ?? [])
        .filter((p) => {
          if (dateMode === "paid") {
            if (p.status !== "paid" || !p.paidAt) return false;
            const t = new Date(p.paidAt).getTime();
            return t >= start.getTime() && t <= end.getTime();
          }
          if (dateMode === "overdue") {
            if (!p.dueAt || p.status === "paid") return false;
            const t = new Date(p.dueAt).getTime();
            if (t < start.getTime() || t > end.getTime()) return false;
            return t < nowTs;
          }
          if (dateMode === "upcoming") {
            if (!p.dueAt || p.status === "paid") return false;
            const t = new Date(p.dueAt).getTime();
            if (t < start.getTime() || t > end.getTime()) return false;
            return t >= nowTs;
          }
          // "due"
          if (!p.dueAt) return false;
          const t = new Date(p.dueAt).getTime();
          return t >= start.getTime() && t <= end.getTime();
        })
        .sort((a, b) => {
          const ta =
            dateMode === "paid"
              ? new Date(a.paidAt ?? 0).getTime()
              : new Date(a.dueAt ?? 0).getTime();
          const tb =
            dateMode === "paid"
              ? new Date(b.paidAt ?? 0).getTime()
              : new Date(b.dueAt ?? 0).getTime();
          return ta - tb;
        });

      setDayDate(start);
      setDayList(rows);
    },
    [baseFiltered, dateMode]
  );

  const closeDayModal = () => {
    setDayList(null);
    setDayDate(null);
  };

  /* ===== Interacciones del calendario ===== */
  const onSelectEvent = useCallback(
    (e: CalendarEvent) => {
      openDayModal(e.start);
    },
    [openDayModal]
  );

  const onSelectSlot = useCallback(
    (slotInfo: any) => {
      openDayModal(slotInfo.start as Date);
    },
    [openDayModal]
  );

  const minTime = useMemo(() => setSeconds(setMinutes(setHours(new Date(), 6), 0), 0), []);
  const maxTime = useMemo(() => setSeconds(setMinutes(setHours(new Date(), 18), 0), 0), []);
  const scrollTo = useMemo(() => setSeconds(setMinutes(setHours(new Date(), 8), 0), 0), []);

  /* ===== Lista (debajo) ===== */
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

  const monthList = useMemo(() => {
    const defaultStart = startOfMonth(viewDate).getTime();
    const defaultEnd = endOfMonth(viewDate).getTime();
    const rangeStart = fromDate ? startOfDayLocal(fromDate).getTime() : defaultStart;
    const rangeEnd = toDate ? endOfDayLocal(toDate).getTime() : defaultEnd;
    const term = dqText.trim().toLowerCase();
    const nowTs = Date.now();

    const rows = (baseFiltered ?? [])
      .filter((p) => {
        if (dateMode === "paid") {
          if (p.status !== "paid" || !p.paidAt) return false;
          const t = new Date(p.paidAt).getTime();
          if (t < rangeStart || t > rangeEnd) return false;
          if (term && !String(p.title ?? "").toLowerCase().includes(term)) return false;
          return true;
        }
        if (dateMode === "overdue") {
          if (!p.dueAt || p.status === "paid") return false;
          const t = new Date(p.dueAt).getTime();
          if (t < rangeStart || t > rangeEnd) return false;
          if (t >= nowTs) return false;
          if (term && !String(p.title ?? "").toLowerCase().includes(term)) return false;
          return true;
        }
        if (dateMode === "upcoming") {
          if (!p.dueAt || p.status === "paid") return false;
          const t = new Date(p.dueAt).getTime();
          if (t < rangeStart || t > rangeEnd) return false;
          if (t < nowTs) return false;
          if (term && !String(p.title ?? "").toLowerCase().includes(term)) return false;
          return true;
        }
        // "due"
        const selectedDate = p.dueAt ?? null;
        if (!selectedDate) return false;
        const t = new Date(selectedDate).getTime();
        if (t < rangeStart || t > rangeEnd) return false;
        if (term && !String(p.title ?? "").toLowerCase().includes(term)) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortUnpaidFirst) {
          const ap = a.status === "paid" ? 1 : 0;
          const bp = b.status === "paid" ? 1 : 0;
          if (ap !== bp) return ap - bp;
        }
        const da =
          dateMode === "paid"
            ? new Date(a.paidAt ?? 0).getTime()
            : new Date(a.dueAt ?? 0).getTime();
        const db =
          dateMode === "paid"
            ? new Date(b.paidAt ?? 0).getTime()
            : new Date(b.dueAt ?? 0).getTime();
        return sortDue === "asc" ? da - db : db - da;
      });

    return rows;
  }, [baseFiltered, viewDate, sortDue, sortUnpaidFirst, fromDate, toDate, dqText, dateMode]);

  const dateHeaderLabel = dateMode === "paid" ? "Pagado" : "Vencimiento";

  /* ===== Exportadores ===== */
  const fileBaseName = useMemo(
    () =>
      `Pagos_${fmt(monthStart, "yyyy-MM", { locale: es })}_${
        dateMode === "paid"
          ? "pagados"
          : dateMode === "overdue"
          ? "vencidos"
          : dateMode === "upcoming"
          ? "por_pagar"
          : "vencimiento"
      }`,
    [monthStart, dateMode]
  );

  const exportMonth = useCallback(
    (format: "xlsx" | "csv" = "xlsx") => {
      const rows = buildExportRows(baseFiltered, { dateMode, rangeStart: monthStart, rangeEnd: monthEnd });
      downloadRows(rows, fileBaseName, format);
    },
    [baseFiltered, dateMode, monthStart, monthEnd, fileBaseName]
  );

  const exportDay = useCallback(
    (format: "xlsx" | "csv" = "xlsx") => {
      const start = new Date(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate(), 0, 0, 0, 0);
      const end = new Date(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate(), 23, 59, 59, 999);
      const rows = buildExportRows(baseFiltered, { dateMode, rangeStart: start, rangeEnd: end });
      const base = `${fileBaseName}_${fmt(viewDate, "yyyy-MM-dd")}`;
      downloadRows(rows, base, format);
    },
    [baseFiltered, dateMode, viewDate, fileBaseName]
  );

  return (
    <Layout
      title="Pagos"
      actions={
        <div className="btn-row">
          <Dropdown label="📊 Excel por mes">
            {isAdmin && (
              <DropdownItem href={SHEET_URL} newTab>
                🔗 Ver online
              </DropdownItem>
            )}
            <DropdownItem onClick={() => exportMonth("xlsx")}>⬇️ Descargar .xlsx</DropdownItem>
            <DropdownItem onClick={() => exportMonth("csv")}>⬇️ Descargar .csv</DropdownItem>
          </Dropdown>

          <Dropdown label="📅 Excel por día">
            {isAdmin && (
              <DropdownItem href={SHEET_URL_DAY} newTab>
                🔗 Ver online
              </DropdownItem>
            )}
            <DropdownItem onClick={() => exportDay("xlsx")}>⬇️ Descargar .xlsx (día)</DropdownItem>
            <DropdownItem onClick={() => exportDay("csv")}>⬇️ Descargar .csv (día)</DropdownItem>
          </Dropdown>

          <Link to="/new/payments" className="btn btn-primary">
            + Crear pago
          </Link>
        </div>
      }
    >
      <PageLoader visible={bigLoaderVisible} />

      {errorPayments && (
        <div className="card" style={{ borderColor: "var(--danger)", background: "#fff4f4" }}>
          Error.{" "}
          <button className="btn btn-ghost" onClick={() => refetch()}>
            Reintentar
          </button>
        </div>
      )}

      {/* ===== Calendario ===== */}
      <div className="card" style={{ padding: 0, opacity: bigLoaderVisible ? 0.35 : 1 }}>
        {/* Header */}
        <div
          style={{
            padding: "12px 14px",
            borderBottom: "1px solid var(--border)",
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <strong>Calendario de pagos</strong>
              <span className="muted" style={{ marginLeft: 8 }}>
                — amarillo: vence ≤ 48 h · verde: &gt; 48 h · rojo: vencido · azul: pagado
              </span>
              {fetchingPayments && (
                <span className="muted" style={{ marginLeft: 10, fontSize: 12 }}>
                  (actualizando…)
                </span>
              )}
            </div>
          </div>

          {/* Tema + + */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span className="muted" style={{ fontSize: 12, fontWeight: 800 }}>
                Tema:
              </span>

              {/* 1) botón principal: SINGLE (opcional) */}
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setOpenTopicSingle(true)}
                disabled={loadingTeams || !!errTeams}
                title={errTeams ? "Error al cargar equipos" : "Elegir tema principal"}
              >
                {selectedTeamsLabel}
              </button>

              {/* 2) botón +: MULTI (siempre disponible) */}
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setOpenTeamsManage(true)}
                disabled={loadingTeams || !!errTeams}
                title="Filtrar por temas (multi)"
                style={{ fontWeight: 900 }}
              >
                +
              </button>

              {/* Limpiar filtro -> vuelve a TODOS */}
              {teamsSelected.length > 0 && (
                <button type="button" className="btn btn-ghost" onClick={clearTeams}>
                  Ver todos
                </button>
              )}
            </div>

            {/* Toggle fecha */}
            <div
              style={{
                display: "inline-flex",
                border: "1px solid var(--border)",
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              <button
                type="button"
                onClick={() => setDateMode("due")}
                className="btn btn-ghost"
                style={{
                  padding: "6px 10px",
                  background: dateMode === "due" ? "var(--bg-soft)" : "transparent",
                  fontWeight: dateMode === "due" ? 800 : 600,
                }}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setDateMode("upcoming")}
                className="btn btn-ghost"
                style={{
                  padding: "6px 10px",
                  background: dateMode === "upcoming" ? "var(--bg-soft)" : "transparent",
                  fontWeight: dateMode === "upcoming" ? 800 : 600,
                  borderLeft: "1px solid var(--border)",
                }}
              >
                En fecha
              </button>
              <button
                type="button"
                onClick={() => setDateMode("paid")}
                className="btn btn-ghost"
                style={{
                  padding: "6px 10px",
                  background: dateMode === "paid" ? "var(--bg-soft)" : "transparent",
                  fontWeight: dateMode === "paid" ? 800 : 600,
                  borderLeft: "1px solid var(--border)",
                }}
              >
                Pagado
              </button>
              <button
                type="button"
                onClick={() => setDateMode("overdue")}
                className="btn btn-ghost"
                style={{
                  padding: "6px 10px",
                  background: dateMode === "overdue" ? "var(--bg-soft)" : "transparent",
                  fontWeight: dateMode === "overdue" ? 800 : 600,
                  borderLeft: "1px solid var(--border)",
                }}
              >
                Vencidos
              </button>
            </div>
          </div>

          {/* Chips de equipos seleccionados (solo cuando hay filtro activo) */}
          {teamsSelected.length > 0 && (
            <div className="chips">
              {teamsSelected.map((t) => (
                <span key={t._id} className="chip">
                  {t.name}
                  <button
                    type="button"
                    onClick={() =>
                      setTeamsSelected((prev) => {
                        // ✅ si queda vacío, significa "Todos"
                        return prev.filter((x) => x._id !== t._id);
                      })
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Calendario */}
        <div style={{ height: 600, position: "relative" }}>
          <div style={{ height: "100%" }}>
            <Calendar
              key={`calendar-${dateMode}`}
              localizer={localizer}
              culture="es"
              events={calendarEvents}
              defaultView={Views.MONTH}
              view={view}
              onView={(v) => setView(v)}
              views={[Views.MONTH, Views.WEEK, Views.DAY]}
              startAccessor="start"
              endAccessor="end"
              selectable
              onSelectSlot={onSelectSlot}
              onSelectEvent={onSelectEvent}
              onNavigate={setViewDate}
              eventPropGetter={eventPropGetter}
              components={{ toolbar: ModernToolbar, event: EventPill }}
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
                noEventsInRange: noEventsMessage,
                date: "Fecha",
                time: "Hora",
                event: "Pago",
                showMore: (total) => `+${total} más`,
              }}
            />
          </div>
        </div>
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
          opacity: bigLoaderVisible ? 0.35 : 1,
        }}
      >
        <h2 className="h2" style={{ margin: 0 }}>
          Pagos del mes ({fmt(monthStart, "MMMM yyyy", { locale: es })})
        </h2>

        <div className="btn-row" style={{ alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 12 }}>
            Rango para la lista:
          </span>
          <input
            type="date"
            className="input"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={{ width: 150 }}
          />
          <input
            type="date"
            className="input"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
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
        <div className="card" style={{ marginTop: 8, opacity: bigLoaderVisible ? 0.35 : 1 }}>
          No hay pagos con los filtros actuales.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, marginTop: 8, opacity: bigLoaderVisible ? 0.35 : 1 }}>
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
              <span>{dateHeaderLabel}</span>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setSortDue((p) => (p === "asc" ? "desc" : "asc"))}
                title={`Ordenar por ${dateHeaderLabel.toLowerCase()}`}
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
                onClick={() => setSortUnpaidFirst((p) => !p)}
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
              const dateStr = dateMode === "paid" ? formatDateTime(p.paidAt) : formatDateTime(p.dueAt);

              let badgeStyle: React.CSSProperties = {};
              let badgeText = "Pendiente";

              if (p.status === "paid") {
                badgeText = "Pagado";
                badgeStyle = { background: "#fef3c7", color: "#111", border: "1px dashed #9CA3AF" };
              } else if (p.dueAt) {
                const hours = differenceInHours(new Date(p.dueAt), new Date());
                if (hours < 0) badgeStyle = { background: "#111827", color: "#fff" };
                else if (hours <= 48) badgeStyle = { background: "#fee2e2", color: "#b91c1c" };
                else badgeStyle = { background: "#dcfce7", color: "#065f46" };
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
                  <div style={{ fontWeight: 700, display: "flex", gap: 8, alignItems: "center" }}>
                    {p.title}
                    <span className="muted" style={{ fontSize: 12 }}>
                      {Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(p.amount)}
                    </span>
                  </div>

                  <div className="muted">{dateMode === "paid" && p.status !== "paid" ? "—" : dateStr}</div>

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
                        Pagado por: <b>{displayUser(p.paidBy)}</b>{" "}
                        {p.paidAt ? `· el ${formatDateTime(p.paidAt)}` : ""}
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

      {/* Modal 1: elegir tema principal (SINGLE) */}
      {openTopicSingle && (
        <TeamSinglePickerModal
          teams={(teamsData ?? []) as Team[]}
          selectedPrimary={teamsSelected[0] ?? null}
          onClose={() => setOpenTopicSingle(false)}
          onSave={(primary) => {
            setTeamsSelected((prev) => {
              const rest = prev.filter((t) => t._id !== primary._id);
              return [primary, ...rest];
            });
            setOpenTopicSingle(false);
          }}
        />
      )}

      {/* Modal 2: agregar/quitar más temas (MULTI) */}
      {openTeamsManage && (
        <TeamPickerModal
          teams={(teamsData ?? []) as Team[]}
          initiallySelected={teamsSelected}
          onClose={() => setOpenTeamsManage(false)}
          onSave={(sel) => {
            setTeamsSelected((prev) => {
              const primary = prev[0];
              if (!primary) return sel;
              const exists = sel.some((t) => t._id === primary._id);
              const rest = sel.filter((t) => t._id !== primary._id);
              return exists ? [primary, ...rest] : sel;
            });
            setOpenTeamsManage(false);
          }}
        />
      )}

      {/* Modal con pagos del día seleccionado */}
      {dayList && (
        <ModalBase
          title={`Pagos de este día${dayDate ? ` — ${fmt(dayDate, "dd/MM/yyyy", { locale: es })}` : ""}`}
          onClose={closeDayModal}
        >
          {!dayList.length ? (
            <div className="muted" style={{ padding: 12 }}>
              No hay pagos para este día con el modo seleccionado.
            </div>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {dayList.map((p) => {
                let left = "#e5e7eb";
                let chipBg = "#f3f4f6";
                let chipColor = "#111827";
                let chipText = "Pendiente";

                if (p.status === "paid") {
                  left = "#1a17ecff";
                  chipBg = "#e0e7ff";
                  chipColor = "#1f2937";
                  chipText = "Pagado";
                } else if (p.dueAt) {
                  const hours = differenceInHours(new Date(p.dueAt), new Date());
                  if (hours < 0) {
                    left = "#ff1313ff";
                    chipBg = "#fee2e2";
                    chipColor = "#991b1b";
                    chipText = "Vencido";
                  } else if (hours <= 48) {
                    left = "#fffc46ff";
                    chipBg = "#fef9c3";
                    chipColor = "#111827";
                    chipText = "Vence ≤48h";
                  } else {
                    left = "#22c55e";
                    chipBg = "#dcfce7";
                    chipColor = "#065f46";
                    chipText = "Futuro";
                  }
                }

                return (
                  <li
                    key={p._id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "10px 12px",
                      borderTop: "1px solid var(--border)",
                      alignItems: "center",
                      gap: 10,
                      position: "relative",
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: 6,
                        background: left,
                        borderTopLeftRadius: 10,
                        borderBottomLeftRadius: 10,
                      }}
                    />
                    <div style={{ minWidth: 0, paddingLeft: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 800,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          title={p.title}
                        >
                          {p.title}
                        </div>
                        <span
                          className="badge"
                          style={{
                            background: chipBg,
                            color: chipColor,
                            border: "1px solid rgba(0,0,0,.08)",
                          }}
                        >
                          {chipText}
                        </span>
                      </div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(p.amount)}
                        {" · "}
                        {dateMode === "paid" ? formatDateTime(p.paidAt) : formatDateTime(p.dueAt)}
                      </div>
                    </div>
                    <button className="btn btn-outline" onClick={() => nav(`/payments/${p._id}`)}>
                      Abrir
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ModalBase>
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
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 10 }}>
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

/* ===== Modal SINGLE (elegir 1 tema principal) ===== */
function TeamSinglePickerModal({
  teams,
  selectedPrimary,
  onSave,
  onClose,
}: {
  teams: Team[];
  selectedPrimary: Team | null;
  onSave: (team: Team) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 200);
  const [selectedId, setSelectedId] = useState<string>(selectedPrimary?._id ?? "");

  const pool = useMemo(
    () => (teams ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [teams]
  );
  const filtered = useMemo(() => {
    const term = dq.trim().toLowerCase();
    if (!term) return pool;
    return pool.filter((t) => t.name.toLowerCase().includes(term));
  }, [pool, dq]);

  const byId = useMemo(() => new Map(pool.map((t) => [t._id, t])), [pool]);
  const canSave = !!selectedId && byId.has(selectedId);

  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "10px 12px",
    borderBottom: "1px solid var(--border)",
    cursor: "pointer",
  };

  return (
    <ModalBase title="Elegir tema" onClose={onClose}>
      <input className="input" placeholder="Buscar equipo…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
        Seleccioná <b>1</b> equipo como tema principal (opcional).
      </div>

      <div style={{ marginTop: 10, border: "1px solid var(--border)", borderRadius: 12, height: 360, overflowY: "auto" }}>
        {filtered.map((t) => {
          const active = t._id === selectedId;
          return (
            <div
              key={t._id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedId(t._id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSelectedId(t._id)}
              style={{
                ...rowStyle,
                background: active ? "var(--bg-soft)" : "transparent",
                fontWeight: active ? 800 : 600,
              }}
              title="Seleccionar"
            >
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    border: "2px solid var(--border)",
                    display: "inline-grid",
                    placeItems: "center",
                    fontSize: 12,
                  }}
                >
                  {active ? "●" : ""}
                </span>
                <div>
                  <div>{t.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {t.members?.length ?? 0} miembro/s
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {!filtered.length && <div className="muted" style={{ padding: 12 }}>No hay resultados</div>}
      </div>

      <div className="btn-row" style={{ marginTop: 12 }}>
        <button
          className="btn btn-primary"
          disabled={!canSave}
          onClick={() => {
            const team = byId.get(selectedId);
            if (team) onSave(team);
          }}
        >
          Elegir
        </button>
        <button className="btn btn-ghost" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </ModalBase>
  );
}

/* ===== Modal MULTI (agregar más temas) ===== */
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

  const available = useMemo(() => filtered.filter((t) => !selectedIds.has(t._id)), [filtered, selectedIds]);

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
    <ModalBase title="Filtrar temas" onClose={onClose}>
      <input className="input" placeholder="Buscar equipo…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
        Tip: si dejás la selección vacía y guardás, se muestran <b>todos los temas</b>.
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
              <div style={{ fontWeight: 700 }}>{t.name}</div>
              <div className="muted">{t.members?.length ?? 0} miembro/s</div>
            </div>
          ))}
          {!available.length && <div className="muted" style={{ padding: 12 }}>No hay equipos para agregar.</div>}
        </div>

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
                  <button type="button" onClick={() => toggle(id)}>
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      </div>

      <div className="btn-row" style={{ marginTop: 12 }}>
        <button className="btn btn-primary" onClick={save}>
          Guardar
        </button>
        <button className="btn btn-ghost" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </ModalBase>
  );
}

// apps/web/src/pages/PaymentsCalendar.tsx
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
import { searchUsers, BasicUser, getMe } from "../api/users";

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
  const composed = [u.name, (u as any).lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
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
function fmtDate(iso?: string | null) {
  return iso ? fmt(new Date(iso), "dd/MM/yyyy HH:mm", { locale: es }) : "";
}

function buildExportRows(
  payments: Payment[],
  {
    dateMode,
    rangeStart,
    rangeEnd,
  }: { dateMode: "due" | "paid"; rangeStart: Date; rangeEnd: Date }
) {
  const start = rangeStart.getTime();
  const end = rangeEnd.getTime();

  const toEsStatus = (s?: string) => (s === "paid" ? "Pagado" : "Pendiente");
  const fmtD = (d?: string | Date | null) =>
    d ? fmt(new Date(d), "dd/MM/yyyy HH:mm", { locale: es }) : "";

  return payments
    .filter((p) => {
      const ref = dateMode === "paid" ? p.paidAt : p.dueAt;
      if (!ref) return false;
      const t = new Date(ref).getTime();
      return t >= start && t <= end;
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
        // ❌ Eliminados:
        // Equipos: ...
        // Asignados: ...
        Descripción: (p as any)?.description ?? "",
        Id: p._id,
      };
    });
}

function downloadRows(
  rows: any[],
  filenameBase: string,
  format: "xlsx" | "csv" = "xlsx"
) {
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
  /** synthetic overflow “+N más” */
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
        <SegBtn
          active={view === "month"}
          onClick={() => onView("month" as View)}
        >
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
        border: isOverflow
          ? "1px solid rgba(0,0,0,.15)"
          : "1px dashed rgba(0,0,0,.15)",
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
function Dropdown({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
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

  // equipos (picker)
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
  type Me = {
    _id: string;
    name?: string;
    lastName?: string;
    email: string;
    roles?: string[];
  };
  const { data: me, isLoading: loadingMe } = useQuery<Me>({
    queryKey: ["me"],
    queryFn: getMe,
    staleTime: 60_000,
  });
  const isAdmin = !!me?.roles?.some((r) => String(r).toLowerCase() === "admin");

  // Loader overlay visible en primera carga
  const bigLoaderVisible =
    (loadingPayments || loadingTeams || loadingMe) && !payments;

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
    let rows = (payments ?? []) as Payment[];

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
  }, [payments, usersSelected, teamsSelected]);

  /* ===== Toggle global (impacta Calendario + Lista) ===== */
  const [dateMode, setDateMode] = useState<"due" | "paid">("due");

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

  /* ===== Agrupar por día en vista MONTH (máx. 2 visibles + “+N más”) ===== */
  const MAX_DAY_EVENTS = 2;

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
      const arr = arrRaw
        .slice()
        .sort((a, b) => a.start.getTime() - b.start.getTime());

      if (arr.length <= 1) {
        // 0 o 1 => mostrar tal cual
        out.push(...arr);
        continue;
      }

      // 2 o más => 1er pago + "+N más" (N = total-1)
      const [first, ...rest] = arr;
      out.push(first);

      const [yy, mm, dd] = k.split("-").map(Number);
      const overflowEvent: CalendarEvent = {
        id: `overflow-${k}-${rest.length}`,
        title: `+${rest.length} más`,
        start: new Date(yy, mm - 1, dd, 12, 0, 0, 0),
        end: new Date(yy, mm - 1, dd, 12, 30, 0, 0), // MISMO día
        payment: {
          _id: `overflow-${k}`,
          title: "",
          amount: 0,
          status: "pending",
        } as any,
        isOverflow: true,
        overflowEvents: rest,
      };

      out.push(overflowEvent);
    }

    return out;
  }

  const eventsDue: CalendarEvent[] = useMemo(() => {
    return view === Views.MONTH ? groupForMonth(eventsBaseDue) : eventsBaseDue;
  }, [eventsBaseDue, view]);

  const eventsPaid: CalendarEvent[] = useMemo(() => {
    return view === Views.MONTH
      ? groupForMonth(eventsBasePaid)
      : eventsBasePaid;
  }, [eventsBasePaid, view]);

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

  /* ===== Overflow modal ===== */
  const [overflowList, setOverflowList] = useState<CalendarEvent[] | null>(
    null
  );

  const onSelectEvent = useCallback(
    (e: CalendarEvent) => {
      if (e.isOverflow && e.overflowEvents?.length) {
        setOverflowList(e.overflowEvents);
      } else {
        nav(`/payments/${e.id}`);
      }
    },
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

  /* ===== Lista ===== */
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
        const selectedDate =
          dateMode === "paid" ? p.paidAt ?? null : p.dueAt ?? null;
        if (dateMode === "paid") {
          if (p.status !== "paid" || !selectedDate) return false;
        } else {
          if (!selectedDate) return false;
        }
        const t = new Date(selectedDate!).getTime();
        if (t < rangeStart || t > rangeEnd) return false;
        if (
          term &&
          !String(p.title ?? "")
            .toLowerCase()
            .includes(term)
        )
          return false;
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
  }, [
    baseFiltered,
    viewDate,
    sortDue,
    sortUnpaidFirst,
    fromDate,
    toDate,
    dqText,
    dateMode,
  ]);

  const dateHeaderLabel = dateMode === "paid" ? "Pagado" : "Vencimiento";

  /* ===== Exportadores ===== */
  const fileBaseName = useMemo(
    () =>
      `Pagos_${fmt(monthStart, "yyyy-MM", { locale: es })}_${
        dateMode === "paid" ? "pagados" : "vencimiento"
      }`,
    [monthStart, dateMode]
  );

  const exportMonth = useCallback(
    (format: "xlsx" | "csv" = "xlsx") => {
      const rows = buildExportRows(baseFiltered, {
        dateMode,
        rangeStart: monthStart,
        rangeEnd: monthEnd,
      });
      downloadRows(rows, fileBaseName, format);
    },
    [baseFiltered, dateMode, monthStart, monthEnd, fileBaseName]
  );

  const exportDay = useCallback(
    (format: "xlsx" | "csv" = "xlsx") => {
      const start = new Date(
        viewDate.getFullYear(),
        viewDate.getMonth(),
        viewDate.getDate(),
        0,
        0,
        0,
        0
      );
      const end = new Date(
        viewDate.getFullYear(),
        viewDate.getMonth(),
        viewDate.getDate(),
        23,
        59,
        59,
        999
      );
      const rows = buildExportRows(baseFiltered, {
        dateMode,
        rangeStart: start,
        rangeEnd: end,
      });
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
          {/* Menú: Excel por mes */}
          <Dropdown label="📊 Excel por mes">
            {isAdmin && (
              <DropdownItem href={SHEET_URL} newTab>
                🔗 Ver online
              </DropdownItem>
            )}
            <DropdownItem onClick={() => exportMonth("xlsx")}>
              ⬇️ Descargar .xlsx
            </DropdownItem>
            <DropdownItem onClick={() => exportMonth("csv")}>
              ⬇️ Descargar .csv
            </DropdownItem>
          </Dropdown>

          {/* Menú: Excel por día */}
          <Dropdown label="📅 Excel por día">
            {isAdmin && (
              <DropdownItem href={SHEET_URL_DAY} newTab>
                🔗 Ver online
              </DropdownItem>
            )}
            <DropdownItem onClick={() => exportDay("xlsx")}>
              ⬇️ Descargar .xlsx (día)
            </DropdownItem>
            <DropdownItem onClick={() => exportDay("csv")}>
              ⬇️ Descargar .csv (día)
            </DropdownItem>
          </Dropdown>

          <Link to="/new/payments" className="btn btn-primary">
            + Crear pago
          </Link>
        </div>
      }
    >
      {/* Overlay inicial */}
      <PageLoader visible={bigLoaderVisible} />

      {errorPayments && (
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

      {/* ===== Calendario + Toggle arriba ===== */}
      <div
        className="card"
        style={{ padding: 0, opacity: bigLoaderVisible ? 0.35 : 1 }}
      >
        <div
          style={{
            padding: "12px 14px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div>
            <strong>Calendario de pagos</strong>
            <span className="muted" style={{ marginLeft: 8 }}>
              — rojo: vence ≤ 48 h · verde: &gt; 48 h · negro: vencido ·
              amarillo: pagado
            </span>
            {fetchingPayments && (
              <span className="muted" style={{ marginLeft: 10, fontSize: 12 }}>
                (actualizando…)
              </span>
            )}
          </div>

          {/* Toggle por encima del calendario */}
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
              title="Mostrar por fecha de vencimiento"
              style={{
                padding: "6px 10px",
                background:
                  dateMode === "due" ? "var(--bg-soft)" : "transparent",
                fontWeight: dateMode === "due" ? 800 : 600,
              }}
            >
              Vencimiento
            </button>
            <button
              type="button"
              onClick={() => setDateMode("paid")}
              className="btn btn-ghost"
              title="Mostrar por fecha de pago realizado"
              style={{
                padding: "6px 10px",
                background:
                  dateMode === "paid" ? "var(--bg-soft)" : "transparent",
                fontWeight: dateMode === "paid" ? 800 : 600,
                borderLeft: "1px solid var(--border)",
              }}
            >
              Pagado
            </button>
          </div>
        </div>

        {/* Calendarios */}
        <div style={{ height: 600 }}>
          {dateMode === "due" ? (
            <Calendar
              key="calendar-due"
              localizer={localizer}
              culture="es"
              events={eventsDue}
              defaultView={Views.MONTH}
              view={view}
              onView={(v) => setView(v)}
              views={[Views.MONTH, Views.WEEK, Views.DAY]}
              startAccessor="start"
              endAccessor="end"
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
                noEventsInRange: "No hay pagos en este rango",
                date: "Fecha",
                time: "Hora",
                event: "Pago",
                showMore: (total) => `+${total} más`,
              }}
            />
          ) : (
            <Calendar
              key="calendar-paid"
              localizer={localizer}
              culture="es"
              events={eventsPaid}
              defaultView={Views.MONTH}
              view={view}
              onView={(v) => setView(v)}
              views={[Views.MONTH, Views.WEEK, Views.DAY]}
              startAccessor="start"
              endAccessor="end"
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
                noEventsInRange: "No hay pagos realizados en este rango",
                date: "Fecha",
                time: "Hora",
                event: "Pago",
                showMore: (total) => `+${total} más`,
              }}
            />
          )}
        </div>
      </div>

      {/* ===== Filtros ===== */}
      <div
        className="card"
        style={{ marginTop: 12, opacity: bigLoaderVisible ? 0.35 : 1 }}
      >
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
            <button
              type="button"
              className="btn btn-ghost"
              onClick={clearFilters}
            >
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
                    setTeamsSelected((prev) =>
                      prev.filter((x) => x._id !== t._id)
                    )
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
                    setUsersSelected((prev) =>
                      prev.filter((x) => x._id !== u._id)
                    )
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
            <button
              type="button"
              className="btn btn-ghost"
              onClick={clearRange}
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* ===== Lista ===== */}
      {!monthList.length ? (
        <div
          className="card"
          style={{ marginTop: 8, opacity: bigLoaderVisible ? 0.35 : 1 }}
        >
          No hay pagos con los filtros actuales.
        </div>
      ) : (
        <div
          className="card"
          style={{
            padding: 0,
            marginTop: 8,
            opacity: bigLoaderVisible ? 0.35 : 1,
          }}
        >
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
                onClick={() =>
                  setSortDue((p) => (p === "asc" ? "desc" : "asc"))
                }
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
                  border: sortUnpaidFirst
                    ? "1px solid var(--border)"
                    : "1px solid transparent",
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
              const dateStr =
                dateMode === "paid"
                  ? formatDateTime(p.paidAt)
                  : formatDateTime(p.dueAt);

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

                  <div className="muted">
                    {dateMode === "paid" && p.status !== "paid" ? "—" : dateStr}
                  </div>

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
      {openTeams && (
        <TeamPickerModal
          teams={(teamsData ?? []) as Team[]}
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

      {/* Modal con overflow de eventos del día */}
      {overflowList && (
        <ModalBase
          title="Pagos de este día"
          onClose={() => setOverflowList(null)}
        >
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {overflowList.map((e) => (
              <li
                key={e.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "10px 12px",
                  borderTop: "1px solid var(--border)",
                  alignItems: "center",
                }}
              >
                <div style={{ fontWeight: 700 }}>{e.title}</div>
                <button
                  className="btn btn-outline"
                  onClick={() => nav(`/payments/${e.id}`)}
                >
                  Abrir
                </button>
              </li>
            ))}
          </ul>
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
              onKeyDown={(e) =>
                (e.key === "Enter" || e.key === " ") && toggle(t._id)
              }
              style={rowStyle}
              title="Agregar a seleccionados"
            >
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

        <div
          style={{
            borderTop: "1px solid var(--border)",
            padding: hasSel ? "8px 10px" : "0 10px",
            maxHeight: hasSel ? 200 : 0,
            opacity: hasSel ? 1 : 0,
            overflow: "hidden",
            transition:
              "max-height .25s ease, opacity .2s ease, padding .2s ease",
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
  const [cache, setCache] = useState<Record<string, BasicUser>>(() =>
    Object.fromEntries(initiallySelected.map((u) => [u._id, u]))
  );

  const { data: results, isLoading } = useQuery<BasicUser[]>({
    queryKey: ["userSearch", dq],
    queryFn: () => searchUsers(dq),
    staleTime: 10_000,
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
                onKeyDown={(e) =>
                  (e.key === "Enter" || e.key === " ") && toggle(u._id)
                }
                style={rowStyle}
                title="Agregar a seleccionados"
              >
                <div style={{ fontWeight: 700 }}>{label}</div>
                <div className="muted">{u.email}</div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            borderTop: "1px solid var(--border)",
            padding: hasSel ? "8px 10px" : "0 10px",
            maxHeight: hasSel ? 200 : 0,
            opacity: hasSel ? 1 : 0,
            overflow: "hidden",
            transition:
              "max-height .25s ease, opacity .2s ease, padding .2s ease",
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
          Agregar
        </button>
        <button className="btn btn-ghost" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </ModalBase>
  );
}

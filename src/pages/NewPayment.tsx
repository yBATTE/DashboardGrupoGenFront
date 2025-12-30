// apps/web/src/pages/NewPayment.tsx
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { createPayment } from "../api/payments";
import { listTeams } from "../api/teams";

/* --- datepicker --- */
import DatePicker from "react-datepicker";
import { es } from "date-fns/locale";
import "react-datepicker/dist/react-datepicker.css";

/* ----------------------- Tipos ----------------------- */
type Team = {
  _id: string;
  name: string;
  members: Array<string | { _id: string }>;
};

/* ----------------------- Utils ----------------------- */
function useDebounced<T>(value: T, delay = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

/* ----------------------- Money input AR -----------------------
   Muestra $ 1.234,56 pero guarda number (1234.56)
---------------------------------------------------------------- */
const AR_CURRENCY = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function MoneyInputAR({
  value,
  onChange,
  placeholder = "$ 0,00",
  className = "input",
}: {
  value: number | null;
  onChange: (n: number | null) => void;
  placeholder?: string;
  className?: string;
}) {
  const [text, setText] = useState<string>(value == null ? "" : AR_CURRENCY.format(value));

  useEffect(() => {
    setText(value == null ? "" : AR_CURRENCY.format(value));
  }, [value]);

  function handleChange(raw: string) {
    const digits = raw.replace(/[^\d]/g, "");
    if (!digits) {
      setText("");
      onChange(null);
      return;
    }
    const n = Number(digits) / 100; // 2 decimales
    setText(AR_CURRENCY.format(n));
    onChange(n);
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      className={className}
      placeholder={placeholder}
      value={text}
      onChange={(e) => handleChange(e.target.value)}
      autoComplete="off"
    />
  );
}

/* ===================================================== */
/*                     PÁGINA PRINCIPAL                  */
/* ===================================================== */
export default function NewPayment() {
  const nav = useNavigate();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [dueAt, setDueAt] = useState<Date | null>(null);

  // ✅ SOLO 1 equipo
  const [teamSelected, setTeamSelected] = useState<Team | null>(null);

  // modal equipos
  const [openTeams, setOpenTeams] = useState(false);

  // ===== NUEVO: Recurrencia mensual =====
  const [repeatMonthly, setRepeatMonthly] = useState(false);
  const [repeatDay, setRepeatDay] = useState<number>(10);
  const [monthsAhead, setMonthsAhead] = useState<number>(6);

  // si el usuario elige una fecha, usamos su día como default (si no tocó el input)
  useEffect(() => {
    if (!dueAt) return;
    // si el usuario nunca tocó el repeatDay y está en default 10,
    // preferimos setearlo al día del vencimiento elegido.
    // (Si querés que siempre sea 10, borrá este useEffect.)
    setRepeatDay((prev) => (prev === 10 ? dueAt.getDate() : prev));
  }, [dueAt]);

  // Traer equipos (TODOS)
  const { data: allTeams } = useQuery({
    queryKey: ["teams"],
    queryFn: listTeams,
    staleTime: 60_000,
  });

  // ✅ No filtra por pertenencia: cualquiera puede elegir cualquier equipo
  const visibleTeams: Team[] = useMemo(() => {
    return (allTeams ?? []) as Team[];
  }, [allTeams]);

  const mutation = useMutation({
    mutationFn: (payload: any) => createPayment(payload),
    onSuccess: () => nav("/payments"),
  });

  const isValid = Boolean(title.trim() && amount != null && amount >= 0 && dueAt && teamSelected);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || !dueAt || !teamSelected) return;

    const normalizedAmount = Number((amount ?? 0).toFixed(2));

    const payload: any = {
      title: title.trim(),
      description: description.trim() || undefined,
      amount: normalizedAmount,
      dueAt: dueAt.toISOString(),
      teamIds: [teamSelected._id], // ✅ exactamente 1
    };

    if (repeatMonthly) {
      // Derivamos hora/minuto/offset desde la fecha elegida (LOCAL)
      const hourLocal = dueAt.getHours();
      const minuteLocal = dueAt.getMinutes();
      const timezoneOffsetMinutes = dueAt.getTimezoneOffset();

      payload.recurrence = {
        kind: "monthly_day",
        dayOfMonth: Math.max(1, Math.min(31, Number(repeatDay || 1))),
        hourLocal,
        minuteLocal,
        timezoneOffsetMinutes,
        monthsAhead: Math.max(1, Math.min(24, Number(monthsAhead || 6))),
      };
    }

    await mutation.mutateAsync(payload);
  }

  return (
    <Layout title="Nuevo pago">
      <div className="page">
        <form onSubmit={onSubmit} autoComplete="off" className="card">
          <label className="label">Título</label>
          <input
            className="input"
            placeholder="Ej: Suscripción, Alquiler…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <label className="label">Notas</label>
          <textarea
            className="textarea"
            rows={3}
            placeholder="Notas…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <label className="label">Monto</label>
          <MoneyInputAR value={amount} onChange={setAmount} />
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Se guarda como número en ARS (ej: $ 1.234,56 → 1234.56)
          </div>

          <label className="label" style={{ marginTop: 12 }}>
            Vence el *
          </label>

          <DatePicker
            selected={dueAt}
            onChange={(d) => setDueAt(d)}
            showTimeSelect
            timeIntervals={30}
            timeCaption="Hora"
            dateFormat="dd/MM/yyyy HH:mm"
            locale={es}
            minDate={new Date()}
            placeholderText="Elegí fecha y hora"
            className="input nice-input"
            calendarClassName="nice-calendar"
            popperPlacement="bottom-start"
          />

          {/* ===== NUEVO: Recurrencia ===== */}
          <div style={{ marginTop: 12, padding: 12, border: "1px solid var(--border)", borderRadius: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 800 }}>
              <input
                type="checkbox"
                checked={repeatMonthly}
                onChange={(e) => setRepeatMonthly(e.target.checked)}
              />
              Repetir todos los meses
            </label>

            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Si activás esto, se crea una plantilla y se generan pagos futuros automáticamente (por mes).
            </div>

            {repeatMonthly && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                <div>
                  <label className="label">Día del mes (1–31)</label>
                  <input
                    type="number"
                    className="input"
                    min={1}
                    max={31}
                    value={repeatDay}
                    onChange={(e) => setRepeatDay(Number(e.target.value))}
                    placeholder="10"
                  />
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                    Ej: 10 → “todos los meses el día 10”. Si el mes no tiene ese día, se usa el último día.
                  </div>
                </div>

                <div>
                  <label className="label">Generar próximos (meses)</label>
                  <select
                    className="input"
                    value={monthsAhead}
                    onChange={(e) => setMonthsAhead(Number(e.target.value))}
                  >
                    <option value={3}>3</option>
                    <option value={6}>6</option>
                    <option value={12}>12</option>
                    <option value={24}>24</option>
                  </select>
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                    Se crean esos meses futuros ya “pendientes”.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ---------- Equipo (solo 1) ---------- */}
          <label className="label" style={{ marginTop: 12 }}>
            Equipo *
          </label>
          <div className="btn-row">
            <button type="button" className="btn btn-outline" onClick={() => setOpenTeams(true)}>
              + Elegir equipo
            </button>

            {teamSelected && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setTeamSelected(null)}
                title="Quitar equipo"
              >
                Limpiar
              </button>
            )}
          </div>

          {teamSelected && (
            <div className="chips" style={{ marginTop: 10 }}>
              <span className="chip">
                {teamSelected.name}
                <button type="button" onClick={() => setTeamSelected(null)}>
                  ×
                </button>
              </span>
            </div>
          )}

          {mutation.error && (
            <div
              className="card"
              style={{
                borderColor: "var(--danger)",
                background: "#fff4f4",
                marginTop: 12,
              }}
            >
              {(mutation.error as any)?.response?.data?.message ?? "Error al crear el pago"}
            </div>
          )}

          <div className="btn-row" style={{ marginTop: 16 }}>
            <button className="btn btn-primary" disabled={mutation.isPending || !isValid}>
              {mutation.isPending ? "Creando…" : "Crear"}
            </button>
            <Link to="/teams" className="btn btn-outline">
              + Crear equipo
            </Link>
          </div>
        </form>
      </div>

      {/* Modal equipos */}
      {openTeams && (
        <TeamPickerSingleModal
          teams={visibleTeams ?? []}
          selected={teamSelected}
          onClose={() => setOpenTeams(false)}
          onSave={(t) => {
            setTeamSelected(t);
            setOpenTeams(false);
          }}
        />
      )}

      {/* --- Estilos suaves para el calendario --- */}
      <style>{`
        .nice-input { border-radius: 12px; }
        .nice-calendar {
          border: 1px solid var(--border) !important;
          border-radius: 14px !important;
          padding: 6px !important;
          box-shadow: 0 12px 30px rgba(0,0,0,.12) !important;
        }
        .react-datepicker__day--selected,
        .react-datepicker__time-list-item--selected {
          background: var(--brand, #3b82f6) !important;
          color: #fff !important;
          border-radius: 10px !important;
        }
        .react-datepicker__time-list-item {
          border-radius: 8px !important;
          margin: 2px 4px !important;
        }
      `}</style>
    </Layout>
  );
}

/* ===================================================== */
/*                  MODAL DE EQUIPO (SINGLE)             */
/* ===================================================== */
function TeamPickerSingleModal({
  teams,
  selected,
  onSave,
  onClose,
}: {
  teams: Team[];
  selected: Team | null;
  onSave: (team: Team) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 200);

  const pool = useMemo(
    () => (teams ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [teams]
  );

  const filtered = useMemo(() => {
    const term = dq.trim().toLowerCase();
    if (!term) return pool;
    return pool.filter((t) => t.name.toLowerCase().includes(term));
  }, [pool, dq]);

  const [selectedId, setSelectedId] = useState<string>(selected?._id ?? "");

  useEffect(() => {
    setSelectedId(selected?._id ?? "");
  }, [selected?._id]);

  const selectedTeam = useMemo(() => {
    return (
      filtered.find((t) => t._id === selectedId) ||
      pool.find((t) => t._id === selectedId) ||
      null
    );
  }, [filtered, pool, selectedId]);

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
    <ModalBase title="Elegir equipo" onClose={onClose}>
      <input
        className="input"
        placeholder="Buscar equipo…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
      />

      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        Seleccioná 1 equipo.
      </div>

      <div
        style={{
          marginTop: 10,
          border: "1px solid var(--border)",
          borderRadius: 12,
          height: 360,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.map((t) => {
            const active = t._id === selectedId;
            return (
              <div
                key={t._id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedId(t._id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setSelectedId(t._id);
                }}
                style={{
                  ...rowStyle,
                  background: active ? "var(--bg-soft)" : "transparent",
                  fontWeight: active ? 800 : 600,
                }}
                title="Seleccionar"
              >
                <div>{t.name}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {active ? "✓" : ""}
                </div>
              </div>
            );
          })}

          {!filtered.length && (
            <div className="muted" style={{ padding: 12 }}>
              No hay equipos para mostrar.
            </div>
          )}
        </div>
      </div>

      <div className="btn-row" style={{ marginTop: 12 }}>
        <button
          className="btn btn-primary"
          onClick={() => selectedTeam && onSave(selectedTeam)}
          disabled={!selectedTeam}
        >
          Seleccionar
        </button>
        <button className="btn btn-ghost" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </ModalBase>
  );
}

/* ===================================================== */
/*                     MODAL BASE                        */
/* ===================================================== */
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

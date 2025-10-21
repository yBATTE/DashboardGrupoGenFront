import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { createPayment } from "../api/payments";
import { listTeams } from "../api/teams";
import { searchUsers, BasicUser, getMe } from "../api/users";

/* --- NUEVO: datepicker --- */
import DatePicker from "react-datepicker";
import { es } from "date-fns/locale";
import "react-datepicker/dist/react-datepicker.css";

/* ----------------------- Tipos ----------------------- */
type Team = { _id: string; name: string; members: Array<string | { _id: string }> };

/* ----------------------- Utils ----------------------- */
function useDebounced<T>(value: T, delay = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

/** 👉 Mostrar Nombre + Apellido; fallback a displayName, email o id */
function displayUser(u: any): string {
  if (!u) return "—";
  if (typeof u === "string") return u;
  const full = [u.name, u.lastName].filter(Boolean).join(" ");
  return u.displayName || full || u.email || u._id || "—";
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
  const [text, setText] = useState<string>(
    value == null ? "" : AR_CURRENCY.format(value)
  );

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

  // selección
  const [teamsSelected, setTeamsSelected] = useState<Team[]>([]);
  const [usersSelected, setUsersSelected] = useState<BasicUser[]>([]);

  // modales
  const [openTeams, setOpenTeams] = useState(false);
  const [openUsers, setOpenUsers] = useState(false);

  // === Me (rol)
  type Me = { _id: string; email: string; name?: string; lastName?: string; roles?: string[] };
  const { data: me } = useQuery<Me>({ queryKey: ["me"], queryFn: getMe, staleTime: 60_000 });
  const myId = me?._id ?? "";
  const isAdmin = !!me?.roles?.some((r) => String(r).toLowerCase() === "admin");

  // Traer equipos una vez
  const { data: allTeams } = useQuery({
    queryKey: ["teams"],
    queryFn: listTeams,
  });

  // Filtrado de equipos según rol:
  const visibleTeams: Team[] = useMemo(() => {
    const teams = (allTeams ?? []) as Team[];
    if (isAdmin) return teams;
    if (!myId) return [];
    return teams.filter((t) =>
      (t.members ?? []).some((m) => (typeof m === "string" ? m === myId : m?._id === myId))
    );
  }, [allTeams, isAdmin, myId]);

  // Si es MEMBER: preseleccionar su propio usuario y bloquear picker de usuarios
  useEffect(() => {
    if (!me) return;
    if (!isAdmin) {
      setUsersSelected([{ _id: me._id, email: me.email, name: me.name } as BasicUser]);
    } else {
      // admin: no forzar selección
      setUsersSelected((prev) => prev);
    }
  }, [me, isAdmin]);

  const mutation = useMutation({
    mutationFn: (payload: any) => createPayment(payload),
    onSuccess: () => nav("/payments"),
  });

  const isValid = Boolean(
    title.trim() &&
      amount != null &&
      amount >= 0 &&
      dueAt &&
      (teamsSelected.length > 0 || usersSelected.length > 0)
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || !dueAt) return;

    const normalizedAmount = Number((amount ?? 0).toFixed(2));

    await mutation.mutateAsync({
      title: title.trim(),
      description: description.trim() || undefined,
      amount: normalizedAmount,
      dueAt: dueAt.toISOString(),
      teamIds: teamsSelected.map((t) => t._id),
      assigneeIds: usersSelected.map((u) => u._id),
    });
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

          {/* ---------- Equipos ---------- */}
          <label className="label" style={{ marginTop: 12 }}>
            Equipo(s) — {isAdmin ? "podés elegir uno o varios" : "solo tus equipos"}
          </label>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setOpenTeams(true)}
            >
              + Elegir equipos
            </button>
          </div>

          {teamsSelected.length > 0 && (
            <div className="chips" style={{ marginTop: 10 }}>
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

          {/* ---------- Usuarios ---------- */}
          <label className="label" style={{ marginTop: 12 }}>
            Asignar a usuario(s) {isAdmin ? "" : "(solo vos)"}
          </label>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setOpenUsers(true)}
              disabled={!isAdmin} // ← member bloqueado, admin habilitado
              title={isAdmin ? "Elegir usuarios" : "Solo podés asignarte a vos"}
            >
              + Elegir usuarios
            </button>
          </div>

          {usersSelected.length > 0 && (
            <div className="chips" style={{ marginTop: 10 }}>
              {usersSelected.map((u) => (
                <span key={u._id} className="chip">
                  {displayUser(u)}
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

          {mutation.error && (
            <div
              className="card"
              style={{ borderColor: "var(--danger)", background: "#fff4f4", marginTop: 12 }}
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

      {/* Modales */}
      {openTeams && (
        <TeamPickerModal
          teams={visibleTeams ?? []}
          initiallySelected={teamsSelected}
          onClose={() => setOpenTeams(false)}
          onSave={(sel) => {
            setTeamsSelected(sel);
            setOpenTeams(false);
          }}
        />
      )}

      {openUsers && isAdmin && (
        <UserPickerModal
          initiallySelected={usersSelected}
          onClose={() => setOpenUsers(false)}
          onSave={(sel) => {
            setUsersSelected(sel);
            setOpenUsers(false);
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
/*                     MODAL DE EQUIPOS                  */
/* ===================================================== */
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

  // Mostrar solo los NO seleccionados en la lista
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
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        Click en un equipo para agregarlo. Usá “×” para quitarlo.
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

        {/* Seleccionados */}
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

/* ===================================================== */
/*                     MODAL DE USUARIOS                 */
/* ===================================================== */
function UserPickerModal({
  initiallySelected,
  onSave,
  onClose,
}: {
  initiallySelected: BasicUser[];
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

  // Lista base
  const list = results ?? [];

  // Ocultar los ya seleccionados en la lista
  const available = useMemo(
    () => list.filter((u) => !selectedIds.has(u._id)),
    [list, selectedIds]
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
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        Click en un usuario para agregarlo. Usá “×” para quitarlo.
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

        {/* Seleccionados */}
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
  // ❌ Sin ESC: se cierra solo con el botón "Cerrar"
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
      <div
        className="card"
        style={{ maxWidth: 640, width: "100%" }}
      >
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

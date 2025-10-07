// apps/web/src/pages/NewTask.tsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../api/axios';
import { listTeams } from '../api/teams';
import { searchUsers, BasicUser } from '../api/users';
import Layout from '../components/Layout';

/* --- NUEVO: datepicker --- */
import DatePicker from 'react-datepicker';
import { es } from 'date-fns/locale';
import 'react-datepicker/dist/react-datepicker.css';

type Priority = 'low' | 'medium' | 'high';
type Team = { _id: string; name: string; members: string[] };

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
  if (!u) return '—';
  if (typeof u === 'string') return u;
  const full = [u.name, u.lastName].filter(Boolean).join(' ');
  return u.displayName || full || u.email || u._id || '—';
}

/* ===================================================== */
/*                     PÁGINA PRINCIPAL                  */
/* ===================================================== */
export default function NewTask() {
  const nav = useNavigate();

  // form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');

  /* --- CAMBIO: usar Date en vez de string --- */
  const [dueAt, setDueAt] = useState<Date | null>(null); // obligatorio
  const [showDueError, setShowDueError] = useState(false);

  // selección
  const [teamsSelected, setTeamsSelected] = useState<Team[]>([]);
  const [usersSelected, setUsersSelected] = useState<BasicUser[]>([]);

  // modales
  const [openTeams, setOpenTeams] = useState(false);
  const [openUsers, setOpenUsers] = useState(false);

  // Traer equipos una vez
  const {
    data: teams,
    isLoading: loadingTeams,
    isError: errTeams,
    error: teamsError,
    refetch: refetchTeams,
  } = useQuery({
    queryKey: ['teams'],
    queryFn: listTeams,
  });

  // crear tarea
  const { mutateAsync, isPending, error: submitError } = useMutation({
    mutationFn: (payload: any) => api.post('/tasks', payload).then((r) => r.data),
    onSuccess: () => nav('/'),
  });

  const isValid = Boolean(
    title.trim() &&
      (teamsSelected.length > 0 || usersSelected.length > 0) &&
      dueAt
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || !dueAt) {
      if (!dueAt) setShowDueError(true);
      return;
    }
    const payload: any = {
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      visibility: 'team', // compat backend
      teamIds: teamsSelected.map((t) => t._id),
      assigneeIds: usersSelected.map((u) => u._id),
      dueAt: dueAt.toISOString(), // ← serialize Date a ISO
    };
    await mutateAsync(payload);
  }

  useEffect(() => {
    if (dueAt) setShowDueError(false);
  }, [dueAt]);

  return (
    <Layout
      title="Nueva tarea"
      actions={<Link to="/teams" className="btn btn-outline">+ Crear equipo</Link>}
    >
      <div className="page">
        <form onSubmit={onSubmit} autoComplete="off" className="card">
          {/* Título */}
          <label className="label">Título *</label>
          <input
            className="input"
            placeholder="Título"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          {/* Descripción */}
          <label className="label">Descripción</label>
          <textarea
            className="textarea"
            rows={4}
            placeholder="Detalles de la tarea…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          {/* Prioridad */}
          <label className="label">Prioridad</label>
          <select
            className="select"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
          >
            <option value="low">Baja</option>
            <option value="medium">Media</option>
            <option value="high">Alta</option>
          </select>

          {/* Vencimiento (obligatorio) */}
          <label className="label">Vence el *</label>
          {/* --- NUEVO: DatePicker bonito con intervalos de 30 min --- */}
          <DatePicker
            selected={dueAt}
            onChange={(d) => setDueAt(d)}
            showTimeSelect
            timeIntervals={30}           // 30 minutos
            timeCaption="Hora"
            dateFormat="dd/MM/yyyy HH:mm"
            locale={es}
            minDate={new Date()}
            placeholderText="Elegí fecha y hora"
            className="input nice-input"
            calendarClassName="nice-calendar"
            popperPlacement="bottom-start"
          />
          {showDueError && !dueAt && (
            <div className="muted" style={{ color: 'var(--danger)', marginTop: 6 }}>
              El vencimiento es obligatorio.
            </div>
          )}

          {/* Equipos (modal) */}
          <label className="label" style={{ marginTop: 12 }}>Equipo(s) (opcional)</label>
          {loadingTeams && <div className="card">Cargando equipos…</div>}
          {errTeams && (
            <div
              className="card"
              style={{ borderColor: 'var(--danger)', background: '#fff4f4', marginBottom: 10 }}
            >
              Error al cargar equipos{' '}
              <button type="button" className="btn btn-ghost" onClick={() => refetchTeams()}>
                Reintentar
              </button>
              <div style={{ fontSize: 12, color: '#a00', marginTop: 4 }}>
                {String((teamsError as any)?.message ?? teamsError)}
              </div>
            </div>
          )}
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setOpenTeams(true)}
              disabled={loadingTeams || !!errTeams}
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

          {/* Usuarios (modal) */}
          <label className="label" style={{ marginTop: 12 }}>
            Asignar a usuario(s) (opcional)
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

          {/* Error del submit */}
          {submitError && (
            <div
              className="card"
              style={{ borderColor: 'var(--danger)', background: '#fff4f4', marginTop: 12 }}
            >
              {(submitError as any)?.response?.data?.message ??
                (submitError as any)?.message ??
                'Error al crear la tarea'}
            </div>
          )}

          <div className="btn-row" style={{ marginTop: 16 }}>
            <button className="btn btn-primary" disabled={isPending || !isValid}>
              {isPending ? 'Creando…' : 'Crear'}
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
          teams={teams ?? []}
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

      {/* --- Estilos del calendario (suaves) --- */}
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

        {/* Seleccionados (transición sin cambiar altura total) */}
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
                {/* sin checkbox */}
                <div style={{ fontWeight: 700 }}>{label}</div>
                <div className="muted">{u.email}</div>
              </div>
            );
          })}
        </div>

        {/* Seleccionados (transición sin cambiar altura total) */}
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
/*                       MODAL BASE                      */
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
      // 👇 SIN onClick={onClose} en el overlay
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
        // 👇 sin stopPropagation porque ya no cerramos por overlay
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

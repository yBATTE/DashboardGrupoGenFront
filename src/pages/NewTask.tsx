// apps/web/src/pages/NewTask.tsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../api/axios';
import { listTeams } from '../api/teams';
import { searchUsers, BasicUser, getMe } from '../api/users';
import Layout from '../components/Layout';

/* --- Datepicker --- */
import DatePicker from 'react-datepicker';
import { es } from 'date-fns/locale';
import 'react-datepicker/dist/react-datepicker.css';

type Priority = 'low' | 'medium' | 'high';
type MemberLike = string | { _id?: string; id?: string };
type Team = { _id: string; name: string; members?: MemberLike[]; memberIds?: string[] };

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

/** 🔧 Redondea una fecha a múltiplos de 30 minutos (00/30) */
function roundTo30(d: Date) {
  const out = new Date(d);
  const m = out.getMinutes();
  const rounded = Math.round(m / 30) * 30;
  out.setMinutes(rounded % 60, 0, 0);
  if (rounded === 60) out.setHours(out.getHours() + 1, 0, 0, 0);
  return out;
}

/* ===== helpers de membresía ===== */
function normalizeMemberIds(team: Team): Set<string> {
  const ids = new Set<string>();
  if (Array.isArray(team.memberIds)) team.memberIds.forEach((x) => x && ids.add(String(x)));
  if (Array.isArray(team.members)) {
    team.members.forEach((m) => {
      if (!m) return;
      if (typeof m === 'string') ids.add(m);
      else if (m._id) ids.add(m._id);
      else if (m.id) ids.add(m.id);
    });
  }
  return ids;
}
function isMemberOf(team: Team, userId?: string): boolean {
  if (!userId) return false;
  return normalizeMemberIds(team).has(userId);
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

  const nowRounded = useMemo(() => roundTo30(new Date()), []);
  const [dueAt, setDueAt] = useState<Date | null>(nowRounded);
  const [showDueError, setShowDueError] = useState(false);

  // selección
  const [teamsSelected, setTeamsSelected] = useState<Team[]>([]);
  const [usersSelected, setUsersSelected] = useState<BasicUser[]>([]);

  // modales
  const [openTeams, setOpenTeams] = useState(false);
  const [openUsers, setOpenUsers] = useState(false);

  // Me & Teams
  type Me = { _id: string; email: string; name?: string; lastName?: string; role?: string; roles?: string[]; isAdmin?: boolean };
  const { data: me } = useQuery<Me>({ queryKey: ['me'], queryFn: getMe });
  const myId = me?._id as string | undefined;
  const isAdmin =
    !!me?.isAdmin ||
    String(me?.role ?? '').toLowerCase() === 'admin' ||
    !!me?.roles?.some((r) => String(r).toLowerCase() === 'admin');

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

  // Equipos permitidos: SOLO mis equipos si soy member; todos si admin
  const allowedTeams = useMemo<Team[]>(() => {
    if (!teams) return [];
    const list = teams as Team[];
    if (isAdmin) return list;
    if (!myId) return [];
    return list.filter((t) => isMemberOf(t, myId));
  }, [teams, isAdmin, myId]);

  // Member: auto-asignarse
  useEffect(() => {
    if (!isAdmin && me && myId) {
      setUsersSelected((prev) =>
        prev.some((u) => u._id === myId) ? prev : [...prev, { _id: me._id, email: me.email, name: me.name } as BasicUser]
      );
    }
  }, [isAdmin, me, myId]);

  // crear tarea
  const { mutateAsync, isPending, error: submitError } = useMutation({
    mutationFn: (payload: any) => api.post('/tasks', payload).then((r) => r.data),
    onSuccess: () => nav('/'),
  });

  const hasTarget = teamsSelected.length > 0 || usersSelected.length > 0;
  const isValid = Boolean(title.trim() && hasTarget && dueAt);

  const [permError, setPermError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || !dueAt) {
      if (!dueAt) setShowDueError(true);
      return;
    }

    setPermError(null);

    // Saneamos por permisos antes de enviar
    let teamIds = teamsSelected.map((t) => t._id);
    let assigneeIds = usersSelected.map((u) => u._id);

    if (!isAdmin) {
      // Solo yo
      assigneeIds = assigneeIds.filter((id) => id === myId);
      // Solo mis equipos
      const allowedIds = new Set(allowedTeams.map((t) => t._id));
      teamIds = teamIds.filter((id) => allowedIds.has(id));

      if (!assigneeIds.length && !teamIds.length) {
        setPermError('No tenés permisos para asignar fuera de tus equipos/usuario.');
        return;
      }
    }

    const payload: any = {
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      visibility: 'team', // compat backend
      teamIds,
      assigneeIds,
      dueAt: dueAt.toISOString(),
    };
    await mutateAsync(payload);
  }

  useEffect(() => {
    if (dueAt) setShowDueError(false);
  }, [dueAt]);

  /** ✅ Conserva la HORA actual (o la ya elegida) cuando cambiás solo la FECHA */
  function handleDueChange(d: Date | null) {
    if (!d) {
      setDueAt(null);
      return;
    }
    const base = dueAt ?? nowRounded;
    const merged = new Date(d);
    merged.setHours(base.getHours(), base.getMinutes(), 0, 0);
    setDueAt(merged);
  }

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

          {/* Vencimiento */}
          <label className="label">Vence el *</label>
          <DatePicker
            selected={dueAt}
            onChange={handleDueChange}
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
          {showDueError && !dueAt && (
            <div className="muted" style={{ color: 'var(--danger)', marginTop: 6 }}>
              El vencimiento es obligatorio.
            </div>
          )}

          {/* Equipos */}
          <label className="label" style={{ marginTop: 12 }}>
            Equipo(s) — podés elegir uno o varios
          </label>
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
              disabled={loadingTeams || !!errTeams || (!isAdmin && !allowedTeams.length)}
              title={!isAdmin && !allowedTeams.length ? 'No pertenecés a ningún equipo' : undefined}
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

          {/* Usuarios */}
          <label className="label" style={{ marginTop: 12 }}>
            Asignar a usuario(s){!isAdmin && ' (solo vos)'}
          </label>
          <div className="btn-row">
            {isAdmin ? (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setOpenUsers(true)}
              >
                + Elegir usuarios
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-outline"
                disabled
                title="Solo el administrador puede elegir otros usuarios"
                style={{ opacity: 0.5, pointerEvents: 'none' }}
              >
                + Elegir usuarios
              </button>
            )}
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
                    disabled={!isAdmin && u._id === myId && usersSelected.length === 1}
                    title={
                      !isAdmin && u._id === myId && usersSelected.length === 1
                        ? 'Dejá al menos tu usuario o elegí un equipo propio.'
                        : undefined
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Permisos */}
          {permError && (
            <div
              className="card"
              style={{ borderColor: 'var(--danger)', background: '#fff4f4', marginTop: 12 }}
            >
              {permError}
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
          teams={isAdmin ? (teams ?? []) as Team[] : allowedTeams}
          initiallySelected={teamsSelected}
          onClose={() => setOpenTeams(false)}
          onSave={(sel) => {
            setTeamsSelected(sel);
            setOpenTeams(false);
          }}
        />
      )}

      {/* Solo admin puede abrir modal de usuarios */}
      {isAdmin && openUsers && (
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
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 200);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initiallySelected.map((t) => t._id))
  );

  const byId = useMemo(() => new Map(teams.map((t) => [t._id, t])), [teams]);

  const pool = useMemo(
    () => (teams ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [teams]
  );

  const filtered = useMemo(() => {
    const term = dq.trim().toLowerCase();
    if (!term) return pool;
    return pool.filter((t) => t.name.toLowerCase().includes(term));
  }, [pool, dq]);

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

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
    cursor: 'pointer',
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
        Marcá uno o varios equipos a los que pertenece la tarea.
      </div>

      <div
        style={{
          marginTop: 10,
          border: '1px solid var(--border)',
          borderRadius: 12,
          height: 360,
          overflow: 'auto',
        }}
      >
        {filtered.map((t) => {
          const checked = selectedIds.has(t._id);
          return (
            <label key={t._id} style={rowStyle} title={checked ? 'Quitar' : 'Agregar'}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(t._id)}
                style={{ width: 18, height: 18 }}
              />
              <div style={{ fontWeight: 700 }}>{t.name}</div>
            </label>
          );
        })}
        {!filtered.length && (
          <div className="muted" style={{ padding: 12 }}>
            No hay equipos para mostrar.
          </div>
        )}
      </div>

      {selectedIds.size > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
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
      )}

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
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.35)',
        zIndex: 60,
        display: 'grid',
        placeItems: 'center',
        padding: 16,
      }}
    >
      <div className="card" style={{ maxWidth: 640, width: '100%' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 10,
            alignItems: 'center',
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
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initiallySelected.map((u) => u._id))
  );
  const [cache, setCache] = useState<Record<string, BasicUser>>(
    () => Object.fromEntries(initiallySelected.map((u) => [u._id, u]))
  );

  const { data: results, isLoading } = useQuery({
    queryKey: ['userSearch', dq],
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

  const list = results ?? [];
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
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
    cursor: 'pointer',
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
          border: '1px solid var(--border)',
          borderRadius: 12,
          height: 360,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {isLoading && <div className="card">Buscando…</div>}
          {!isLoading && !available.length && (
            <div className="muted" style={{ padding: 12 }}>
              No hay resultados
            </div>
          )}
          {available.map((u) => {
            const label =
              'lastName' in u && (u as any).lastName
                ? `${u.name ?? ''} ${(u as any).lastName}`.trim()
                : u.name || '(sin nombre)';
            return (
              <div
                key={u._id}
                role="button"
                tabIndex={0}
                onClick={() => toggle(u._id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggle(u._id)}
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
            borderTop: '1px solid var(--border)',
            padding: hasSel ? '8px 10px' : '0 10px',
            maxHeight: hasSel ? 200 : 0,
            opacity: hasSel ? 1 : 0,
            overflow: 'hidden',
            transition: 'max-height .25s ease, opacity .2s ease, padding .2s ease',
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
                'lastName' in u && (u as any).lastName
                  ? `${u.name ?? ''} ${(u as any).lastName}`.trim()
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

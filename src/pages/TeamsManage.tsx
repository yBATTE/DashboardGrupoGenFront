// apps/web/src/pages/TeamManage.tsx
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  addTeamMembers,
  listTeamsFull,
  removeTeamMember,
  renameTeam,
  TeamFull,
} from "../api/teams";
import { useEffect, useMemo, useState } from "react";
import { searchUsers, BasicUser } from "../api/users";
import Layout from "../components/Layout";

/* ----------------------- Utils ----------------------- */
function useDebounced<T>(value: T, delay = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

// 👇 Mostrar Nombre + Apellido donde sea posible
function displayUser(u: any): string {
  if (!u) return "—";
  if (typeof u === "string") return u;
  const full = [u.name, u.lastName].filter(Boolean).join(" ");
  return u.displayName || full || u.email || u._id || "—";
}

/* ===================================================== */
/*                     PÁGINA PRINCIPAL                  */
/* ===================================================== */
export default function TeamsManage() {
  const {
    data: teams,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["teams-full"],
    queryFn: listTeamsFull,
  });

  const renameMut = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      renameTeam(id, name),
    onSuccess: () => refetch(),
  });

  const addMembersMut = useMutation({
    mutationFn: ({ id, memberIds }: { id: string; memberIds: string[] }) =>
      addTeamMembers(id, memberIds),
    onSuccess: () => refetch(),
  });

  const removeMemberMut = useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string }) =>
      removeTeamMember(id, userId),
    onSuccess: () => refetch(),
  });

  return (
    <Layout
      title="Administrar equipos"
      actions={
        <Link to="/teams" className="btn btn-outline">
          + Crear equipo
        </Link>
      }
    >
      {isLoading && <div className="card">Cargando…</div>}
      {isError && (
        <div
          className="card"
          style={{ borderColor: "var(--danger)", background: "#fff4f4" }}
        >
          Error al cargar.{" "}
          <button className="btn btn-ghost" onClick={() => refetch()}>
            Reintentar
          </button>
        </div>
      )}

      {(teams ?? []).map((team) => (
        <TeamCard
          key={team._id}
          team={team}
          onRename={(name) => renameMut.mutate({ id: team._id, name })}
          onAddMembers={(ids) =>
            addMembersMut.mutate({ id: team._id, memberIds: ids })
          }
          onRemove={(userId) =>
            removeMemberMut.mutate({ id: team._id, userId })
          }
          busyRename={renameMut.isPending}
          busyRemove={removeMemberMut.isPending}
        />
      ))}

      {teams?.length === 0 && <div className="card">No hay equipos.</div>}
    </Layout>
  );
}

/* ===================================================== */
/*                         CARD                          */
/* ===================================================== */
function TeamCard({
  team,
  onRename,
  onAddMembers,
  onRemove,
  busyRename,
  busyRemove,
}: {
  team: TeamFull;
  onRename: (name: string) => void;
  onAddMembers: (ids: string[]) => void;
  onRemove: (userId: string) => void;
  busyRename: boolean;
  busyRemove: boolean;
}) {
  const [name, setName] = useState(team.name);
  const [openUsers, setOpenUsers] = useState(false);

  const already = useMemo(
    () => new Set(team.members.map((m) => m._id)),
    [team.members]
  );

  const alreadyIds = useMemo(
    () => team.members.map((m) => m._id),
    [team.members]
  );
  const alreadyEmails = useMemo(
    () =>
      team.members.map((m) => (m.email || "").toLowerCase()).filter(Boolean),
    [team.members]
  );

  return (
    <div className="card stack-lg" style={{ marginBottom: 24 }}>
      {/* Renombrar */}
      <div className="stack-sm">
        <div className="section-title">Nombre del equipo</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre del equipo"
            style={{ flex: 1 }}
          />
          <button
            className="btn btn-primary"
            onClick={() => onRename(name)}
            disabled={busyRename}
          >
            {busyRename ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>

      {/* Miembros */}
      <div className="stack-sm">
        <div className="section-title">Miembros</div>
        {!team.members.length ? (
          <div className="muted">No hay miembros.</div>
        ) : (
          <ul className="list-separated">
            {team.members.map((m) => (
              <li
                key={m._id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>
                  <strong>{displayUser(m)}</strong>{" "}
                  <span className="muted">({m.email})</span>
                </span>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    if (confirm("¿Quitar este miembro del equipo?"))
                      onRemove(m._id);
                  }}
                  disabled={busyRemove}
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Agregar miembros (con modal) */}
      <div className="stack-sm">
        <div className="section-title">Agregar miembros</div>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setOpenUsers(true)}
          >
            + Elegir usuarios
          </button>
        </div>

        {openUsers && (
          <UserPickerModal
            initiallySelected={[]}
            excludeIds={alreadyIds} // 👈 nuevo
            excludeEmails={alreadyEmails} // 👈 nuevo
            onClose={() => setOpenUsers(false)}
            onSave={(users) => {
              const toAdd = users
                .map((u) => u._id)
                .filter((id) => !already.has(id));
              if (toAdd.length) onAddMembers(toAdd);
              setOpenUsers(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

/* ===================================================== */
/*                     MODAL DE USUARIOS                 */
/* ===================================================== */
/* ===================================================== */
/*                     MODAL DE USUARIOS                 */
/* ===================================================== */
function UserPickerModal({
  initiallySelected,
  excludeIds = [],
  excludeEmails = [],
  onSave,
  onClose,
}: {
  initiallySelected: BasicUser[];
  excludeIds?: string[];
  excludeEmails?: string[];
  onSave: (users: BasicUser[]) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 250);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initiallySelected.map((u) => String(u._id)))
  );
  const [cache, setCache] = useState<Record<string, BasicUser>>(() =>
    Object.fromEntries(initiallySelected.map((u) => [String(u._id), u]))
  );

  const { data: results, isLoading } = useQuery({
    queryKey: ["userSearch", dq],
    queryFn: () => searchUsers(dq),
  });

  useEffect(() => {
    if (results?.length) {
      setCache((prev) => ({
        ...prev,
        ...Object.fromEntries(results.map((u) => [String(u._id), u])),
      }));
    }
  }, [results]);

  // Sets de exclusión (por id y por email)
  const excludeIdSet = useMemo(
    () => new Set(excludeIds.map(String)),
    [excludeIds]
  );
  const excludeEmailSet = useMemo(
    () => new Set(excludeEmails.map((e) => (e || "").toLowerCase())),
    [excludeEmails]
  );

  // Lista filtrada: fuera miembros existentes por id o email
  const list = useMemo(() => {
    const arr = results ?? [];
    return arr.filter((u) => {
      const idOk = !excludeIdSet.has(String(u._id));
      const emailOk =
        !u.email || !excludeEmailSet.has((u.email || "").toLowerCase());
      return idOk && emailOk;
    });
  }, [results, excludeIdSet, excludeEmailSet]);

  function toggle(id: string) {
    const key = String(id);
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  function save() {
    const ids = Array.from(selectedIds);
    const users = ids.map((id) => cache[id]).filter(Boolean) as BasicUser[];
    onSave(users);
  }

  const hasSel = selectedIds.size > 0;

  return (
    <ModalBase title="Elegir usuarios" onClose={onClose}>
      <input
        className="input"
        placeholder="Buscar por nombre o email…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
      />

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
          {!isLoading && !list.length && (
            <div className="muted" style={{ padding: 12 }}>
              No hay resultados
            </div>
          )}

          {list.map((u) => {
            const id = String(u._id);
            const checked = selectedIds.has(id);
            const label =
              "lastName" in u && (u as any).lastName
                ? `${u.name ?? ""} ${(u as any).lastName}`.trim()
                : u.name || "(sin nombre)";

            return (
              <div
                key={id}
                role="button"
                tabIndex={0}
                onClick={() => toggle(id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggle(id);
                  }
                }}
                aria-pressed={checked}
                title={checked ? "Quitar" : "Agregar"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderBottom: "1px solid var(--border)",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                {/* puntito de estado (sin checkbox) */}
                <span
                  aria-hidden
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    border: "1px solid var(--border)",
                    background: checked
                      ? "var(--brand, #3b82f6)"
                      : "transparent",
                    boxShadow: checked
                      ? "0 0 0 2px rgba(59,130,246,.15)"
                      : "none",
                  }}
                />
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

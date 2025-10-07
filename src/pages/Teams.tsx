// apps/web/src/pages/Teams.tsx
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import Layout from "../components/Layout";
import { useAuthStore } from "../store/auth";

import { listTeams, createTeam, Team } from "../api/teams";
import { searchUsers, BasicUser } from "../api/users";
import { api } from "../api/axios";

/* ----------------------- Utils ----------------------- */
function useDebounced<T>(value: T, delay = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

/** Mostrar Nombre + Apellido cuando estén, si no, email o id */
function displayUser(u: any): string {
  if (!u) return "—";
  if (typeof u === "string") return u;
  const full = [u.name, u.lastName].filter(Boolean).join(" ");
  return u.displayName || full || u.email || u._id || "—";
}

/* ===================================================== */
/*                     PÁGINA PRINCIPAL                  */
/* ===================================================== */
export default function TeamsPage() {
  const [name, setName] = useState("");
  const [members, setMembers] = useState<BasicUser[]>([]);
  const [openUsers, setOpenUsers] = useState(false);

  const isAdmin = useAuthStore((s) =>
    (s as any).isAdmin
      ? (s as any).isAdmin()
      : Boolean((s as any).roles?.includes?.("admin"))
  );
  const canCreate = !!isAdmin;

  // modal "ver miembros"
  const [openMembersTeam, setOpenMembersTeam] = useState<Team | null>(null);

  // listado de equipos
  const { data: teams, refetch } = useQuery({
    queryKey: ["teams"],
    queryFn: listTeams,
  });

  const createMut = useMutation({
    mutationFn: (payload: { name: string; members: string[] }) =>
      createTeam(payload),
    onSuccess: () => {
      setName("");
      setMembers([]);
      refetch();
    },
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) return;
    if (!name.trim()) return;
    await createMut.mutateAsync({
      name: name.trim(),
      members: members.map((u) => u._id),
    });
  };

  return (
    <Layout title="Crear equipo">
      {/* Aviso para miembros */}
      {!canCreate && (
        <div
          className="card"
          style={{ marginBottom: 12, background: "#fff8e1", borderColor: "#f59e0b" }}
        >
          <b>Sólo los admin pueden crear equipos.</b>
        </div>
      )}

      {/* Formulario de creación */}
      <form
        onSubmit={onSubmit}
        className="card"
        style={{ marginBottom: 16, opacity: canCreate ? 1 : 0.6 }}
        title={canCreate ? undefined : "Sólo los admin pueden crear equipos"}
        aria-disabled={!canCreate}
      >
        <label className="label">Nombre del equipo</label>
        <input
          className="input"
          placeholder="Ej: Ventas Sur"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!canCreate}
          readOnly={!canCreate}
        />

        <label className="label" style={{ marginTop: 12 }}>
          Miembros
        </label>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => canCreate && setOpenUsers(true)}
            disabled={!canCreate}
          >
            + Elegir usuarios
          </button>
        </div>

        {members.length > 0 && (
          <div className="chips" style={{ marginTop: 10 }}>
            {members.map((u) => (
              <span key={u._id} className="chip">
                {displayUser(u)}
                <button
                  type="button"
                  onClick={() =>
                    canCreate &&
                    setMembers((prev) => prev.filter((x) => x._id !== u._id))
                  }
                  disabled={!canCreate}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {createMut.error && (
          <div
            className="card"
            style={{
              borderColor: "var(--danger)",
              background: "#fff4f4",
              marginTop: 12,
            }}
          >
            {(createMut.error as any)?.response?.data?.message ??
              "No se pudo crear el equipo"}
          </div>
        )}

        <div className="btn-row" style={{ marginTop: 14 }}>
          <button
            className="btn btn-primary"
            disabled={!canCreate || createMut.isPending || !name.trim()}
          >
            {createMut.isPending ? "Creando…" : "Crear equipo"}
          </button>
        </div>
      </form>

      {/* === listado de equipos  ================== */}
      <h2 className="h2" style={{ marginTop: 4 }}>
        {isAdmin ? "Listado" : "Mis equipos"}
      </h2>

      {!teams ? (
        <div className="card">Cargando…</div>
      ) : !teams.length ? (
        <div className="card">Aún no hay equipos.</div>
      ) : (
        <div className="grid">
          {teams.map((t) => (
            <div key={t._id} className="card">
              <div
                className="card-title"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span>{t.name}</span>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setOpenMembersTeam(t)}
                >
                  Ver miembros
                </button>
              </div>
              <div className="muted">Miembros: {t.members?.length ?? 0}</div>
            </div>
          ))}
        </div>
      )}

      {/* Modal elegir usuarios */}
      {openUsers && canCreate && (
        <UserPickerModal
          initiallySelected={members}
          onSave={(sel) => {
            const byId = new Map<string, BasicUser>();
            [...members, ...sel].forEach((u) => byId.set(u._id, u));
            setMembers(Array.from(byId.values()));
            setOpenUsers(false);
          }}
          onClose={() => setOpenUsers(false)}
        />
      )}

      {/* Modal ver miembros */}
      {openMembersTeam && (
        <TeamMembersModal
          team={openMembersTeam}
          onClose={() => setOpenMembersTeam(null)}
        />
      )}
    </Layout>
  );
}

/* ===================================================== */
/*                 MODAL: VER MIEMBROS (read-only)       */
/* ===================================================== */
function TeamMembersModal({
  team,
  onClose,
}: {
  team: Team;
  onClose: () => void;
}) {
  // members puede venir como [ids] o como [{_id,name,lastName,email}, ...]
  const memberIds = useMemo(
    () =>
      (team.members ?? [])
        .map((m: any) => (typeof m === "string" ? m : m?._id))
        .filter(Boolean) as string[],
    [team.members]
  );

  // Si ya vino poblado, usamos esos datos y evitamos el fetch
  const preloaded: BasicUser[] = useMemo(() => {
    return (team.members ?? [])
      .map((m: any) =>
        typeof m === "string"
          ? null
          : ({
              _id: m._id,
              name: m.name,
              lastName: m.lastName,
              email: m.email,
            } as BasicUser)
      )
      .filter(Boolean) as BasicUser[];
  }, [team.members]);

  const shouldFetch = memberIds.length > 0 && preloaded.length === 0;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["teamMembers", team._id, memberIds.join(",")],
    enabled: shouldFetch,
    queryFn: async () => {
      const idsParam = memberIds.join(",");
      const res = await api.get("/users", { params: { ids: idsParam } });
      return res.data as BasicUser[];
    },
  });

  const members: BasicUser[] = preloaded.length ? preloaded : data ?? [];

  return (
    <ModalBase title={`Miembros de “${team.name}”`} onClose={onClose}>
      {!memberIds.length && (
        <div className="muted">Este equipo no tiene miembros.</div>
      )}

      {shouldFetch && isLoading && <div className="card">Cargando miembros…</div>}

      {shouldFetch && isError && (
        <div
          className="card"
          style={{ borderColor: "var(--danger)", background: "#fff4f4" }}
        >
          No se pudieron cargar los miembros.
        </div>
      )}

      {!!members.length && (
        <div
          style={{
            marginTop: 8,
            maxHeight: 360,
            overflowY: "auto",
            border: "1px solid var(--border)",
            borderRadius: 12,
          }}
        >
          {members.map((u) => (
            <div
              key={u._id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <Avatar seed={u._id} />
              <div style={{ fontWeight: 700 }}>{displayUser(u)}</div>
              <div className="muted">{u.email}</div>
            </div>
          ))}
        </div>
      )}

      {!shouldFetch && preloaded.length === 0 && memberIds.length > 0 && !members.length && (
        <div className="muted" style={{ marginTop: 8 }}>
          No se pudieron resolver los usuarios por ID. Comprobá que tu endpoint
          <code> GET /users?ids=</code> esté implementado.
        </div>
      )}

      <div className="btn-row" style={{ marginTop: 12 }}>
        <button className="btn btn-ghost" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </ModalBase>
  );
}

/* Avatar mini (inicial aleatoria) */
function Avatar({ seed }: { seed?: string }) {
  // seed queda sin usar, pero así no rompe en los lugares donde se lo pasa
  return (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: 999,
        background: '#eef2ff',
        display: 'grid',
        placeItems: 'center',
      }}
      aria-hidden
    >
      <img
        src="/brand/user-solid.svg"
        alt="Usuario"
        style={{ width: 16, height: 16, display: 'block' }}
      />
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

  // mostrar sólo los que NO están seleccionados
  const available = useMemo(
    () => (results ?? []).filter((u) => !selectedIds.has(u._id)),
    [results, selectedIds]
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

      {/* Marco de altura fija con scroll y sección de seleccionados con transición */}
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
        {/* Lista (sólo no seleccionados) */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {isLoading && <div className="card">Buscando…</div>}
          {!isLoading && !available.length && (
            <div className="muted" style={{ padding: 12 }}>
              No hay resultados
            </div>
          )}

          {available.map((u) => {
            const label =
              ("lastName" in u && (u as any).lastName)
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

        {/* Seleccionados (expande con transición sin cambiar la altura total) */}
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
                ("lastName" in u && (u as any).lastName)
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

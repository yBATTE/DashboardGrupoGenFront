// apps/web/src/pages/Teams.tsx
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import Layout from "../components/Layout";

import { listTeams, createTeam, Team } from "../api/teams";
import { BasicUser } from "../api/users";
import { api } from "../api/axios";

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

  // modal "ver miembros"
  const [openMembersTeam, setOpenMembersTeam] = useState<Team | null>(null);

  // listado de equipos
  const { data: teams, refetch } = useQuery({
    queryKey: ["teams"],
    queryFn: listTeams,
  });

  const createMut = useMutation({
    mutationFn: (payload: { name: string; members: string[] }) => createTeam(payload),
    onSuccess: () => {
      setName("");
      refetch();
    },
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    await createMut.mutateAsync({
      name: name.trim(),
      members: [], // ✅ sin miembros
    });
  };

  return (
    <Layout title="Equipos">
      {/* Formulario de creación */}
      <form onSubmit={onSubmit} className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Crear equipo</div>

        <label className="label" style={{ marginTop: 10 }}>
          Nombre del equipo
        </label>
        <input
          className="input"
          placeholder="Ej: Ventas Sur"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

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
            disabled={createMut.isPending || !name.trim()}
          >
            {createMut.isPending ? "Creando…" : "Crear equipo"}
          </button>
        </div>
      </form>

      {/* === listado de equipos  ================== */}
      <h2 className="h2" style={{ marginTop: 4 }}>
        Listado
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
      {!memberIds.length && <div className="muted">Este equipo no tiene miembros.</div>}

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

      <div className="btn-row" style={{ marginTop: 12 }}>
        <button className="btn btn-ghost" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </ModalBase>
  );
}

/* Avatar mini */
function Avatar({ seed }: { seed?: string }) {
  return (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: 999,
        background: "#eef2ff",
        display: "grid",
        placeItems: "center",
      }}
      aria-hidden
    >
      <img
        src="/brand/user-solid.svg"
        alt="Usuario"
        style={{ width: 16, height: 16, display: "block" }}
      />
    </div>
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

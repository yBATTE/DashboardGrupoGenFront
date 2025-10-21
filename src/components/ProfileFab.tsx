import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuthStore } from "../store/auth";
import { changeMyPassword, getMe, updateMe } from "../api/users";
import { useNavigate } from "react-router-dom";
import { api } from "../api/axios";

/** Botón flotante: avatar + nombre */
export default function ProfileFab() {
  const [open, setOpen] = useState(false);
  const auth = useAuthStore((s) => s) as any;

  const {
    data: me,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
  });

  const first = me?.name ?? auth?.user?.name ?? auth?.name ?? undefined;
  const last = me?.lastName ?? (auth as any)?.user?.lastName ?? undefined;
  const email = me?.email ?? auth?.user?.email ?? auth?.email ?? undefined;

  const displayName =
    [first, last].filter(Boolean).join(" ") || email || "Usuario";

  return (
    <>
      <button
        type="button"
        aria-label="Perfil"
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          left: 16,
          bottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "6px 12px",
          borderRadius: 9999,
          background: "#fff",
          color: "#111",
          border: "1px solid var(--border, #e5e7eb)",
          boxShadow: "0 8px 24px rgba(0,0,0,.12)",
          zIndex: 50,
          cursor: "pointer",
        }}
        title={displayName}
      >
        {/* Avatar con imagen personalizada */}
        <img
          src="/brand/user.svg"
          alt={displayName}
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            display: "block",
            objectFit: "cover",
            background: "#eef2ff",
            boxShadow: "0 6px 16px rgba(79,70,229,.22)",
            flex: "0 0 auto",
            padding: 4,
          }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />

        <span
          style={{
            fontWeight: 700,
            fontSize: 14,
            whiteSpace: "nowrap",
            maxWidth: 220,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {displayName}
        </span>
      </button>

      {open && <ProfileModal onClose={() => setOpen(false)} />}
    </>
  );
}

/** Modal con 2 pestañas: Datos (nombre/email) y Contraseña */
function ProfileModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"datos" | "password">("datos");

  const {
    data: me,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
  });

  const nav = useNavigate();

  async function logout() {
    try {
      await api.post("/auth/logout");
    } catch {}
    api.defaults.headers.common["Authorization"] = undefined;
    useAuthStore.getState().clear();
    nav("/login", { replace: true });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      /* 🔒 No cerrar al clickear overlay: sin onClick acá */
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
        /* Igual mantenemos stopPropagation por si en el futuro se agrega un handler al overlay */
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 560, width: "100%" }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            alignItems: "center",
          }}
        >
          <div>
            <div className="card-sub">Perfil</div>
            <div style={{ fontWeight: 800 }}>{me?.name || "Usuario"}</div>
            {me?.email && (
              <div className="muted" style={{ fontSize: 12 }}>
                {me.email}
              </div>
            )}
          </div>

          {/* Acciones del modal: cerrar sesión + cerrar modal */}
          <div className="btn-row">
            <button className="btn btn-danger" onClick={logout}>
              Cerrar sesión
            </button>
            <button className="btn btn-ghost" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button
              className={`btn ${tab === "datos" ? "btn-outline" : "btn-ghost"}`}
              onClick={() => setTab("datos")}
            >
              Datos
            </button>
            <button
              className={`btn ${
                tab === "password" ? "btn-outline" : "btn-ghost"
              }`}
              onClick={() => setTab("password")}
            >
              Contraseña
            </button>
          </div>

          {isLoading && <div className="card">Cargando…</div>}

          {tab === "datos" && me && (
            <EditAccountForm me={me} onSaved={() => refetch()} />
          )}

          {tab === "password" && <ChangePasswordForm onChanged={() => {}} />}
        </div>
      </div>
    </div>
  );
}

/** Form para editar nombre y email */
function EditAccountForm(
  { me, onSaved }: { me: { name?: string; lastName?: string; email: string }; onSaved: () => void }
) {
  const [name, setName] = useState(me.name ?? "");
  const [lastName, setLastName] = useState(me.lastName ?? "");
  const email = me.email;
  const [msg, setMsg] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: { name?: string; lastName?: string }) =>
      updateMe(payload),
    onSuccess: (updated) => {
      setMsg("Datos guardados.");
      try {
        const store: any = (useAuthStore as any).getState?.();
        store?.setUser?.(updated);
      } catch {}
      onSaved();
      setTimeout(() => setMsg(null), 1500);
    },
  });

  const canSave = useMemo(() => {
    return (name ?? "").trim() !== (me.name ?? "") ||
      (lastName ?? "").trim() !== (me.lastName ?? "");
  }, [name, lastName, me]);

  return (
    <>
      <label className="label">Nombre</label>
      <input
        className="input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoComplete="given-name"
      />

      <label className="label" style={{ marginTop: 10 }}>
        Apellido
      </label>
      <input
        className="input"
        value={lastName}
        onChange={(e) => setLastName(e.target.value)}
        autoComplete="family-name"
      />

      <label className="label" style={{ marginTop: 10 }}>
        Email
      </label>
      <input
        className="input"
        value={email}
        readOnly
        disabled
        style={{ background: "#f9fafb", color: "#6b7280", cursor: "not-allowed" }}
      />
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        El email no puede modificarse desde aquí. Contactá a un administrador para solicitar el cambio.
      </div>

      {mutation.error && (
        <div
          className="card"
          style={{ marginTop: 10, background: "#fff4f4", borderColor: "var(--danger)" }}
        >
          {(mutation.error as any)?.response?.data?.message ??
            "No se pudieron guardar los datos."}
        </div>
      )}
      {msg && (
        <div
          className="card"
          style={{ marginTop: 10, background: "#f0fff4", borderColor: "#22c55e" }}
        >
          {msg}
        </div>
      )}

      <div className="btn-row" style={{ marginTop: 14 }}>
        <button
          className="btn btn-primary"
          onClick={() =>
            mutation.mutate({ name: name.trim(), lastName: lastName.trim() })
          }
          disabled={!canSave || mutation.isPending}
        >
          {mutation.isPending ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </>
  );
}

/** Form para cambiar contraseña */
function ChangePasswordForm({ onChanged }: { onChanged: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const valid = next.length >= 6 && next === confirm;

  const mutation = useMutation({
    mutationFn: () => changeMyPassword({ current, next }),
    onSuccess: () => {
      setMsg("Contraseña actualizada correctamente.");
      setCurrent("");
      setNext("");
      setConfirm("");
      setTimeout(() => setMsg(null), 1200);
      onChanged();
    },
  });

  return (
    <>
      <label className="label">Contraseña actual</label>
      <input
        type="password"
        className="input"
        placeholder="••••••••"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        autoComplete="current-password"
      />

      <label className="label" style={{ marginTop: 10 }}>
        Nueva contraseña
      </label>
      <input
        type="password"
        className="input"
        placeholder="Mínimo 6 caracteres"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        autoComplete="new-password"
      />

      <label className="label" style={{ marginTop: 10 }}>
        Repetir nueva contraseña
      </label>
      <input
        type="password"
        className="input"
        placeholder="Repetir nueva contraseña"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        autoComplete="new-password"
      />

      {!valid && (next.length > 0 || confirm.length > 0) && (
        <div className="muted" style={{ color: "var(--danger)", marginTop: 6 }}>
          La contraseña debe tener al menos 6 caracteres y coincidir.
        </div>
      )}

      {mutation.error && (
        <div
          className="card"
          style={{
            marginTop: 10,
            background: "#fff4f4",
            borderColor: "var(--danger)",
          }}
        >
          {(mutation.error as any)?.response?.data?.message ??
            "No se pudo actualizar la contraseña."}
        </div>
      )}

      {msg && (
        <div
          className="card"
          style={{ marginTop: 10, background: "#f0fff4", borderColor: "#22c55e" }}
        >
          {msg}
        </div>
      )}

      <div className="btn-row" style={{ marginTop: 14 }}>
        <button
          className="btn btn-primary"
          onClick={() => mutation.mutate()}
          disabled={!valid || mutation.isPending}
        >
          {mutation.isPending ? "Guardando…" : "Cambiar contraseña"}
        </button>
      </div>
    </>
  );
}

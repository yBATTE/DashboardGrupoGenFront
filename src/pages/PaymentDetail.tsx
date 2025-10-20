// apps/web/src/pages/PaymentDetail.tsx
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueries } from "@tanstack/react-query";
import Layout from "../components/Layout";
import { getPayment, markPaymentPaid, reopenPayment } from "../api/payments";
import { getUserById } from "../api/users";
import { listTeamsFull } from "../api/teams";

// === helpers ===================================================
const fmtARS = (n: number) =>
  Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n);

// SIEMPRE prioriza displayName; si no, arma "name lastName"; luego email/_id
function userLabel(
  u:
    | {
        name?: string;
        lastName?: string;
        displayName?: string;
        email?: string;
        _id?: string;
      }
    | null
    | undefined
) {
  if (!u) return "—";
  const full = [u.name, u.lastName].filter(Boolean).join(" ").trim();
  return u.displayName || full || u.email || u._id || "—";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="card-sub">{label}</div>
      <div style={{ fontWeight: 700 }}>{children}</div>
    </div>
  );
}

// Normaliza una referencia de usuario que puede ser:
// - string (ObjectId)
// - {_id: string}
// - {name,lastName,email,_id,displayName}
// - {user: {...}}
function normalizeUserRef(ref: any): { userObj?: any; id?: string } {
  if (!ref) return {};

  // wrapper { user: {...} }
  if (typeof ref === "object" && ref.user) {
    const u = ref.user;
    if (u && (u.name || u.email || u.displayName || u.lastName))
      return {
        userObj: {
          _id: u._id,
          name: u.name,
          lastName: u.lastName,
          displayName: u.displayName,
          email: u.email,
        },
      };
    if (u && u._id) return { id: String(u._id) };
  }

  // objeto con datos
  if (typeof ref === "object") {
    if (ref.name || ref.email || ref.displayName || ref.lastName)
      return {
        userObj: {
          _id: ref._id,
          name: ref.name,
          lastName: ref.lastName,
          displayName: ref.displayName,
          email: ref.email,
        },
      };
    if (ref._id) return { id: String(ref._id) };
  }

  // string id
  if (typeof ref === "string") return { id: ref };

  return {};
}

export default function PaymentDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();

  const {
    data: payment,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["payment", id],
    queryFn: () => getPayment(id),
    enabled: !!id,
  });

  // ===== Usuarios asignados ===================================================
  const rawAssignees: any[] = ((payment as any)?.assigneeIds ?? (payment as any)?.assignees ?? []) as any[];
  const normUsers = rawAssignees.map(normalizeUserRef);

  const populatedAssignees = normUsers
    .map((n) => n.userObj)
    .filter(Boolean) as Array<{ _id: string; name?: string; lastName?: string; displayName?: string; email?: string }>;

  const missingUserIds = normUsers.map((n) => n.id).filter(Boolean) as string[];

  const usersQueries = useQueries({
    queries: missingUserIds.map((uid) => ({
      queryKey: ["user", uid],
      queryFn: () => getUserById(uid),
      enabled: !!uid && !!payment,
      staleTime: 60_000,
    })),
  });

  const usersLoading = usersQueries.some((q) => q.isLoading);

  const fetchedAssignees = usersQueries
    .map((q) => q.data)
    .filter(Boolean) as Array<{ _id: string; name?: string; lastName?: string; displayName?: string; email?: string }>;

  const assignees = [...populatedAssignees, ...fetchedAssignees];

  // ===== Equipos asignados ====================================================
  const rawTeams = ((payment as any)?.teamIds ?? []) as any[];

  const populatedTeams = rawTeams
    .filter((t) => typeof t === "object" && t && t.name)
    .map((t) => ({
      _id: t._id,
      name: t.name,
      members: (t.members ?? []).map((m: any) => ({
        _id: m._id,
        name: m.name,
        lastName: m.lastName,
        displayName: m.displayName,
        email: m.email,
      })),
    }));

  const missingTeamIds = rawTeams.filter((t) => typeof t === "string").map((t) => String(t));

  const { data: teamsFull } = useQuery({
    queryKey: ["teams-full-for-payment", missingTeamIds.join(",")],
    queryFn: listTeamsFull,
    enabled: missingTeamIds.length > 0,
    staleTime: 60_000,
  });

  const fetchedTeams =
    (teamsFull ?? [])
      .filter((t: any) => missingTeamIds.includes(String(t._id)))
      .map((t: any) => ({
        _id: t._id,
        name: t.name,
        members: (t.members ?? []).map((m: any) => ({
          _id: m._id,
          name: m.name,
          lastName: m.lastName,
          displayName: m.displayName,
          email: m.email,
        })),
      })) ?? [];

  const teams = [...populatedTeams, ...fetchedTeams];

  // ===== Acciones =============================================================
  const payMut = useMutation({
    mutationFn: () => markPaymentPaid(id),
    onSuccess: () => refetch(),
  });

  const reopenMut = useMutation({
    mutationFn: () => reopenPayment(id),
    onSuccess: () => refetch(),
  });

  const onMarkPaid = () => {
    if (!payment) return;
    if (!confirm(`¿Marcar "${payment.title}" como pagado?`)) return;
    payMut.mutate();
  };

  const onReopen = () => {
    if (!payment) return;
    if (!confirm(`¿Reabrir el pago "${payment.title}"?`)) return;
    reopenMut.mutate();
  };

  // ===== UI ==================================================================
  return (
    <Layout
      title="Detalle de pago"
      actions={
        <Link to="/payments" className="btn btn-ghost">
          ← Volver
        </Link>
      }
    >
      {isLoading && <div className="card">Cargando…</div>}

      {isError && (
        <div className="card" style={{ borderColor: "var(--danger)", background: "#fff4f4" }}>
          No se pudo cargar el pago.{" "}
          <button className="btn btn-ghost" onClick={() => refetch()}>
            Reintentar
          </button>
        </div>
      )}

      {payment && (
        <div className="card">
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div>
              <h1 className="h1" style={{ margin: 0 }}>
                {payment.title}
              </h1>
              <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                Estado: <b>{payment.status === "paid" ? "Pagado" : "Pendiente"}</b>
              </div>
            </div>
            <div className="badge amber" style={{ fontSize: 14 }}>
              {fmtARS(payment.amount)}
            </div>
          </div>

          {/* Info principal */}
          <div className="grid grid-2" style={{ marginTop: 16 }}>
            <Field label="Vencimiento">{payment.dueAt ? new Date(payment.dueAt).toLocaleString() : "—"}</Field>
            <Field label="Monto">{fmtARS(payment.amount)}</Field>

            <Field label="Creado por">
              {userLabel(payment.createdBy as any)}
              <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                {payment.createdAt ? `El ${new Date(payment.createdAt).toLocaleString()}` : ""}
              </div>
            </Field>

            <Field label="Estado">
              {payment.status === "paid" ? "Pagado" : "Pendiente"}
              {payment.status === "paid" && (
                <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                  {payment.paidAt ? `Pagado el ${new Date(payment.paidAt).toLocaleString()}` : ""}
                  {payment.paidBy ? ` · Por ${userLabel(payment.paidBy as any)}` : ""}
                </div>
              )}
            </Field>

            {/* ===== Asignado a (Usuarios) ===== */}
            <Field label="Asignado a">
              {usersLoading && <span className="muted">Cargando asignados…</span>}
              {!usersLoading && !assignees.length && <span className="muted">—</span>}
              {!usersLoading && assignees.length > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {assignees.map((u) => (
                    <span key={u._id} className="badge">
                      {userLabel(u)}
                    </span>
                  ))}
                </div>
              )}
            </Field>

            {/* ===== Equipos (chips como en TaskDetail) ===== */}
            <Field label="Equipos">
              {teams.length ? (
                <div className="chips" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {teams.map((t) => (
                    <span key={String(t._id)} className="chip" title={t.name}>
                      {t.name}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="muted">—</span>
              )}
            </Field>

            <Field label="Notas">
              {payment.description ? (
                <div className="break-anywhere muted" style={{ marginTop: 2 }}>
                  {payment.description}
                </div>
              ) : (
                <span className="muted">—</span>
              )}
            </Field>
          </div>

          {/* Acciones */}
          <div className="btn-row" style={{ marginTop: 14 }}>
            {payment.status !== "paid" ? (
              <button className="btn btn-primary" onClick={onMarkPaid} disabled={payMut.isPending}>
                {payMut.isPending ? "Marcando…" : "Marcar como pagado"}
              </button>
            ) : (
              <button className="btn btn-outline" onClick={onReopen} disabled={reopenMut.isPending}>
                {reopenMut.isPending ? "Reabriendo…" : "Reabrir pago"}
              </button>
            )}
            <Link to="/payments" className="btn btn-ghost">
              Volver
            </Link>
          </div>
        </div>
      )}
    </Layout>
  );
}

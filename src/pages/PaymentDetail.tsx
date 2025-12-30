// apps/web/src/pages/PaymentDetail.tsx
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueries } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { getPayment, markPaymentPaid, reopenPayment, updatePayment } from "../api/payments";
import { getUserById } from "../api/users";
import { listTeamsFull } from "../api/teams";

/* --- datepicker --- */
import DatePicker from "react-datepicker";
import { es } from "date-fns/locale";
import "react-datepicker/dist/react-datepicker.css";

// === helpers ===================================================
const fmtARS = (n: number) =>
  Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n);

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

function normalizeUserRef(ref: any): { userObj?: any; id?: string } {
  if (!ref) return {};
  if (typeof ref === "object" && ref.user) {
    const u = ref.user;
    if (u && (u.name || u.email || u.displayName || u.lastName))
      return { userObj: { _id: u._id, name: u.name, lastName: u.lastName, displayName: u.displayName, email: u.email } };
    if (u && u._id) return { id: String(u._id) };
  }
  if (typeof ref === "object") {
    if (ref.name || ref.email || ref.displayName || ref.lastName)
      return { userObj: { _id: ref._id, name: ref.name, lastName: ref.lastName, displayName: ref.displayName, email: ref.email } };
    if (ref._id) return { id: String(ref._id) };
  }
  if (typeof ref === "string") return { id: ref };
  return {};
}

/* ----------------------- Money input AR ----------------------- */
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
    const n = Number(digits) / 100;
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

export default function PaymentDetail() {
  const { id = "" } = useParams();

  const { data: payment, isLoading, isError, refetch } = useQuery({
    queryKey: ["payment", id],
    queryFn: () => getPayment(id),
    enabled: !!id,
  });

  // ===== Modo edición =========================================================
  const [editing, setEditing] = useState(false);

  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editAmount, setEditAmount] = useState<number | null>(null);
  const [editDueAt, setEditDueAt] = useState<Date | null>(null);

  // ✅ NUEVO: paidAt editable
  const [editPaidAt, setEditPaidAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!payment) return;
    if (editing) return;

    setEditTitle(payment.title ?? "");
    setEditDescription(payment.description ?? "");
    setEditAmount(typeof payment.amount === "number" ? payment.amount : null);
    setEditDueAt(payment.dueAt ? new Date(payment.dueAt) : null);

    setEditPaidAt(payment.paidAt ? new Date(payment.paidAt) : null);
  }, [payment, editing]);

  const canSaveBase = Boolean(editTitle.trim() && editAmount != null && editAmount >= 0 && editDueAt);

  // si está pagado, exigimos paidAt no nulo (para evitar mandar undefined raro)
  const canSave =
    canSaveBase && (payment?.status !== "paid" || (payment?.status === "paid" && editPaidAt));

  const updateMut = useMutation({
    mutationFn: async () => {
      if (!canSave || !editDueAt) throw new Error("Formulario inválido");
      const normalizedAmount = Number((editAmount ?? 0).toFixed(2));

      return updatePayment(id, {
        title: editTitle.trim(),
        description: editDescription.trim() || "",
        amount: normalizedAmount,
        dueAt: editDueAt.toISOString(),
        ...(payment?.status === "paid" && editPaidAt ? { paidAt: editPaidAt.toISOString() } : {}),
      });
    },
    onSuccess: async () => {
      setEditing(false);
      await refetch();
    },
  });

  function onStartEdit() {
    if (!payment) return;
    setEditing(true);
  }

  function onCancelEdit() {
    setEditing(false);
    if (!payment) return;
    setEditTitle(payment.title ?? "");
    setEditDescription(payment.description ?? "");
    setEditAmount(typeof payment.amount === "number" ? payment.amount : null);
    setEditDueAt(payment.dueAt ? new Date(payment.dueAt) : null);
    setEditPaidAt(payment.paidAt ? new Date(payment.paidAt) : null);
  }

  function onSaveEdit() {
    if (!canSave) return;
    updateMut.mutate();
  }

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
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ minWidth: 260 }}>
              {!editing ? (
                <>
                  <h1 className="h1" style={{ margin: 0 }}>
                    {payment.title}
                  </h1>
                  <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                    Estado: <b>{payment.status === "paid" ? "Pagado" : "Pendiente"}</b>
                  </div>
                </>
              ) : (
                <>
                  <div className="muted" style={{ fontSize: 12, fontWeight: 800 }}>
                    Editando
                  </div>
                  <input
                    className="input"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Título"
                    style={{ marginTop: 6 }}
                  />
                </>
              )}
            </div>

            <div className="badge amber" style={{ fontSize: 14 }}>
              {!editing ? fmtARS(payment.amount) : fmtARS(editAmount ?? 0)}
            </div>
          </div>

          {/* Info principal */}
          <div className="grid grid-2" style={{ marginTop: 16 }}>
            <Field label="Vencimiento">
              {!editing ? (
                payment.dueAt ? new Date(payment.dueAt).toLocaleString() : "—"
              ) : (
                <DatePicker
                  selected={editDueAt}
                  onChange={(d) => setEditDueAt(d)}
                  showTimeSelect
                  timeIntervals={30}
                  timeCaption="Hora"
                  dateFormat="dd/MM/yyyy HH:mm"
                  locale={es}
                  placeholderText="Elegí fecha y hora"
                  className="input nice-input"
                  calendarClassName="nice-calendar"
                  popperPlacement="bottom-start"
                />
              )}
            </Field>

            <Field label="Monto">
              {!editing ? (
                fmtARS(payment.amount)
              ) : (
                <>
                  <MoneyInputAR value={editAmount} onChange={setEditAmount} />
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                    Se guarda como número en ARS.
                  </div>
                </>
              )}
            </Field>

            <Field label="Creado por">
              {userLabel(payment.createdBy as any)}
              <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                {payment.createdAt ? `El ${new Date(payment.createdAt).toLocaleString()}` : ""}
              </div>
            </Field>

            <Field label="Estado">
              {payment.status === "paid" ? "Pagado" : "Pendiente"}

              {/* ✅ fecha de pago editable */}
              {payment.status === "paid" && (
                <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                  {!editing ? (
                    <>
                      {payment.paidAt ? `Pagado el ${new Date(payment.paidAt).toLocaleString()}` : ""}
                      {payment.paidBy ? ` · Por ${userLabel(payment.paidBy as any)}` : ""}
                    </>
                  ) : (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontWeight: 800, fontSize: 12, marginBottom: 6 }}>Pagado el</div>
                      <DatePicker
                        selected={editPaidAt}
                        onChange={(d) => setEditPaidAt(d)}
                        showTimeSelect
                        timeIntervals={30}
                        timeCaption="Hora"
                        dateFormat="dd/MM/yyyy HH:mm"
                        locale={es}
                        placeholderText="Elegí fecha y hora"
                        className="input nice-input"
                        calendarClassName="nice-calendar"
                        popperPlacement="bottom-start"
                      />
                      {payment.paidBy ? (
                        <div style={{ marginTop: 6 }}>
                          Por <b>{userLabel(payment.paidBy as any)}</b>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              )}
            </Field>

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
              {!editing ? (
                payment.description ? (
                  <div className="break-anywhere muted" style={{ marginTop: 2 }}>
                    {payment.description}
                  </div>
                ) : (
                  <span className="muted">—</span>
                )
              ) : (
                <textarea
                  className="textarea"
                  rows={4}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Notas…"
                />
              )}
            </Field>
          </div>

          {/* Acciones */}
          <div className="btn-row" style={{ marginTop: 14, flexWrap: "wrap" }}>
            {!editing ? (
              <>
                <button className="btn btn-outline" onClick={onStartEdit}>
                  ✏️ Editar
                </button>

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
              </>
            ) : (
              <>
                <button className="btn btn-primary" onClick={onSaveEdit} disabled={!canSave || updateMut.isPending}>
                  {updateMut.isPending ? "Guardando…" : "Guardar cambios"}
                </button>
                <button className="btn btn-ghost" onClick={onCancelEdit} disabled={updateMut.isPending}>
                  Cancelar
                </button>

                {updateMut.isError && (
                  <span className="badge" style={{ background: "#fee2e2", color: "#991b1b" }}>
                    {(updateMut.error as any)?.response?.data?.message ?? "Error al guardar"}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      )}

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

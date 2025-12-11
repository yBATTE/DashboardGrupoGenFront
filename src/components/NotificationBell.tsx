// apps/web/src/components/NotificationBell.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listNotifications,
  unreadCount,
  markSeen,
  markAllSeen,
  type Notification,
} from "../api/notifications";

function useOutsideClose(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!open || !ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onClose]);
  return ref;
}

export default function NotificationBell({ enabled = true }: { enabled?: boolean }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);

  // contador con polling liviano
  const { data: count } = useQuery({
    queryKey: ["notif-unread-count"],
    queryFn: unreadCount,
    refetchInterval: 30_000,
    enabled,
  });

  // lista sólo cuando abro el panel
  const { data: notifs } = useQuery({
    queryKey: ["notif-list", { open }],
    queryFn: () => listNotifications({ onlyNew: false }), // el back ya oculta expiradas
    enabled: enabled && open,
  });

  const mAll = useMutation({
    mutationFn: markAllSeen,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif-unread-count"] });
      qc.invalidateQueries({ queryKey: ["notif-list"] });
    },
  });

  const mOne = useMutation({
    mutationFn: (id: string) => markSeen(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif-unread-count"] });
      qc.invalidateQueries({ queryKey: ["notif-list"] });
    },
  });

  const ref = useOutsideClose(open, () => setOpen(false));
  const unreadIds = useMemo(
    () => (notifs ?? []).filter((n) => !n.seenAt).map((n) => n._id),
    [notifs]
  );

  // Al abrir, marcá todo como visto (si preferís hacerlo manual, comentá esto)
  useEffect(() => {
    if (enabled && open && unreadIds.length) mAll.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, enabled]);

  if (!enabled) return null;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        className="btn btn-ghost"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notificaciones"
        title="Notificaciones"
        style={{
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          borderRadius: 999,
          padding: "8px 12px",
        }}
      >
        {/* ícono campana */}
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
          <path
            d="M12 2a6 6 0 0 0-6 6v2.586l-1.707 1.707A1 1 0 0 0 5 14h14a1 1 0 0 0 .707-1.707L18 10.586V8a6 6 0 0 0-6-6zm0 20a3 3 0 0 0 3-3H9a3 3 0 0 0 3 3z"
            fill="currentColor"
          />
        </svg>
        {typeof count === "number" && count > 0 && (
          <span
            style={{
              position: "absolute",
              top: -2,
              right: -2,
              minWidth: 18,
              height: 18,
              borderRadius: 9,
              background: "#ef4444",
              color: "#fff",
              fontSize: 11,
              lineHeight: "18px",
              textAlign: "center",
              padding: "0 4px",
              fontWeight: 800,
              boxShadow: "0 0 0 3px #fff",
            }}
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 6px)",
            width: 360,
            background: "#fff",
            border: "1px solid var(--border)",
            borderRadius: 12,
            boxShadow: "0 12px 30px rgba(0,0,0,.14)",
            overflow: "hidden",
            zIndex: 50,
          }}
        >
          <div style={{ padding: 12, borderBottom: "1px solid var(--border)", fontWeight: 800 }}>
            Notificaciones
          </div>

          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            {!notifs?.length ? (
              <div className="muted" style={{ padding: 12 }}>
                No hay notificaciones recientes.
              </div>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {notifs!.map((n: Notification) => (
                  <li
                    key={n._id}
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                      padding: "10px 12px",
                      borderTop: "1px solid var(--border)",
                      background: n.seenAt ? "#fff" : "#f8fafc",
                    }}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        marginTop: 6,
                        background: n.seenAt ? "#d1d5db" : "#22c55e",
                        flex: "0 0 auto",
                      }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {n.title}
                      </div>
                      {n.body && (
                        <div className="muted" style={{ fontSize: 12 }}>
                          {n.body}
                        </div>
                      )}

                      {/* Deep-links */}
                      {n.type === "TASK_ASSIGNED" && n?.data?.taskId && (
                        <button
                          className="btn btn-outline"
                          style={{ marginTop: 6, padding: "4px 8px", fontSize: 12 }}
                          onClick={() => {
                            if (!n.seenAt) mOne.mutate(n._id);
                            nav(`/tasks/${n.data.taskId}`);
                            setOpen(false);
                          }}
                        >
                          Abrir tarea
                        </button>
                      )}

                      {n.type === "PAYMENT_ASSIGNED" && n?.data?.paymentId && (
                        <button
                          className="btn btn-outline"
                          style={{ marginTop: 6, padding: "4px 8px", fontSize: 12 }}
                          onClick={() => {
                            if (!n.seenAt) mOne.mutate(n._id);
                            nav(`/payments/${n.data.paymentId}`);
                            setOpen(false);
                          }}
                        >
                          Abrir pago
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div
            style={{
              padding: 10,
              borderTop: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
            }}
          >
            <button
              className="btn btn-ghost"
              onClick={() => mAll.mutate()}
              title="Marcar todas como vistas"
            >
              Marcar como visto
            </button>
            <Link to="/notifications/history" className="btn btn-outline" onClick={() => setOpen(false)}>
              Ver historial
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

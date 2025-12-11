import { useQuery } from "@tanstack/react-query";
import { listNotifications } from "../api/notifications";

export default function NotificationsHistory() {
  const { data } = useQuery({
    queryKey: ["notif-history"],
    queryFn: () => listNotifications({ includeExpired: true }),
  });

  function fmtDateSafe(d?: string | null) {
  if (!d) return "—";
  const x = new Date(d);
  return isNaN(+x) ? "—" : x.toLocaleString("es-AR");
}


  return (
    <div className="card">
      <div className="card-sub" style={{ marginBottom: 8 }}>Historial de notificaciones</div>
      {!data?.length ? (
        <div className="muted">No hay registros.</div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {data!.map((n) => (
            <li key={n._id} style={{ padding: "10px 12px", borderTop: "1px solid var(--border)" }}>
              <div style={{ fontWeight: 800 }}>{n.title}</div>
              {n.body && <div className="muted" style={{ fontSize: 12 }}>{n.body}</div>}
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {fmtDateSafe(n.createdAt)}{" · "}
                {n.seenAt ? " · vista" : " · no vista"}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

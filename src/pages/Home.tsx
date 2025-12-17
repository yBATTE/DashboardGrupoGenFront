// apps/web/src/pages/Home.tsx
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Layout from "../components/Layout";

// API
import { listPaymentsRange, Payment } from "../api/payments";
import { listTeams, Team } from "../api/teams";

import { format as fmt, isBefore, parseISO, differenceInHours } from "date-fns";
import { es } from "date-fns/locale";

function currency(n: number) {
  try {
    return Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
    }).format(n);
  } catch {
    return `$ ${n?.toFixed?.(0) ?? n}`;
  }
}

/* --------- pequeño placeholder reutilizable --------- */
function LoadingCards() {
  return (
    <>
      <div
        className="card"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div>
          <div className="card-sub">Cargando</div>
          <div className="h1" style={{ margin: 0 }}>
            Preparando tu resumen…
          </div>
        </div>
        <div className="chips">
          <span className="chip">Pagos pronto: —</span>
          <span className="chip">Pagos vencidos: —</span>
          <span className="chip">Equipos: —</span>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginTop: 12 }}>
        <div className="card">
          <div className="card-title">Pagos que vencen pronto (≤72 h)</div>
          <div className="muted">Cargando…</div>
        </div>
        <div className="card">
          <div className="card-title">Pagos vencidos</div>
          <div className="muted">Cargando…</div>
        </div>
        <div className="card">
          <div className="card-title">Mis equipos</div>
          <div className="muted">Cargando…</div>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginTop: 12 }}>
        <div className="card">
          <div className="card-title">Accesos rápidos</div>
          <div className="muted">Cargando…</div>
        </div>
      </div>
    </>
  );
}

export default function Home() {
  // ===== Queries base =====
  const { data: payments, isLoading: pLoading } = useQuery({
    queryKey: ["home-payments"],
    queryFn: () => listPaymentsRange({}), // sin rango
  });

  const { data: teams, isLoading: teamsLoading } = useQuery({
    queryKey: ["home-teams"],
    queryFn: listTeams,
  });

  // Mostrar loading inicial SOLO si aún no hay datos y alguna query sigue cargando
  const bootLoading = (!payments && pLoading) || (!teams && teamsLoading);

  // ===== Derivados =====
  const paymentsSoon = useMemo(() => {
    const rows = (payments ?? []) as Payment[];
    const now = new Date();
    return rows
      .filter((p) => p.status !== "paid" && p.dueAt)
      .map((p) => ({ p, hours: differenceInHours(parseISO(p.dueAt!), now) }))
      .filter((x) => x.hours >= 0 && x.hours <= 72)
      .sort((a, b) => a.hours - b.hours)
      .slice(0, 5)
      .map((x) => x.p);
  }, [payments]);

  const paymentsOverdue = useMemo(() => {
    const rows = (payments ?? []) as Payment[];
    const now = new Date();
    return rows
      .filter(
        (p) =>
          p.status !== "paid" &&
          p.dueAt &&
          isBefore(parseISO(p.dueAt!), now)
      )
      .slice(0, 5);
  }, [payments]);

  const myTeams = useMemo(() => (teams ?? []) as Team[], [teams]);

  return (
    <Layout
      title="Inicio"
      actions={
        <div className="btn-row">
          <Link to="/payments" className="btn btn-outline">
            💳 Calendario de pagos
          </Link>
          <Link to="/new/payments" className="btn btn-primary">
            + Nuevo pago
          </Link>
        </div>
      }
    >
      {/* ===== Loading inicial ===== */}
      {bootLoading ? (
        <LoadingCards />
      ) : (
        <>
          {/* Hero / saludo */}
          <div
            className="card"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div>
              <div className="card-sub">Resumen rápido</div>
              <div className="h1" style={{ margin: 0 }}>
                ¡Buen día! Esto es lo más importante ahora
              </div>
            </div>
            <div className="chips">
              <span className="chip">Pagos pronto: {paymentsSoon.length}</span>
              <span className="chip">Pagos vencidos: {paymentsOverdue.length}</span>
              <span className="chip">Equipos: {myTeams.length}</span>
            </div>
          </div>

          {/* Grilla principal */}
          <div className="grid grid-3" style={{ marginTop: 12 }}>
            {/* Col 1: Pagos pronto */}
            <div className="card">
              <div className="card-title">Pagos que vencen pronto (≤72 h)</div>
              {!paymentsSoon.length ? (
                <div className="muted">No hay pagos próximos.</div>
              ) : (
                <ul className="list-separated">
                  {paymentsSoon.map((p) => (
                    <li key={p._id}>
                      <Link
                        to={`/payments/${p._id}`}
                        className="no-underline"
                        style={{ color: "inherit" }}
                      >
                        <div style={{ fontWeight: 800 }}>
                          {p.title}{" "}
                          <span className="muted" style={{ fontWeight: 600 }}>
                            · {currency(p.amount)}
                          </span>
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          Vence:{" "}
                          {p.dueAt
                            ? fmt(parseISO(p.dueAt), "dd/MM HH:mm", {
                                locale: es,
                              })
                            : "—"}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <div className="btn-row" style={{ marginTop: 10 }}>
                <Link to="/payments" className="btn btn-outline">
                  Ver calendario de pagos
                </Link>
              </div>
            </div>

            {/* Col 2: Pagos vencidos */}
            <div className="card">
              <div className="card-title">Pagos vencidos</div>
              {!paymentsOverdue.length ? (
                <div className="muted">No hay pagos vencidos 🎉</div>
              ) : (
                <ul className="list-separated">
                  {paymentsOverdue.map((p) => (
                    <li key={p._id}>
                      <Link
                        to={`/payments/${p._id}`}
                        className="no-underline"
                        style={{ color: "inherit" }}
                      >
                        <div style={{ fontWeight: 800 }}>
                          {p.title}{" "}
                          <span className="muted" style={{ fontWeight: 600 }}>
                            · {currency(p.amount)}
                          </span>
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          Vencía:{" "}
                          {p.dueAt
                            ? fmt(parseISO(p.dueAt), "dd/MM HH:mm", {
                                locale: es,
                              })
                            : "—"}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Col 3: Equipos */}
            <div className="card">
              <div className="card-title">Mis equipos</div>
              {!myTeams.length ? (
                <div className="muted">No integrás equipos todavía.</div>
              ) : (
                <ul className="list-separated">
                  {myTeams.slice(0, 6).map((t) => (
                    <li key={t._id}>
                      <div style={{ fontWeight: 700 }}>{t.name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {t.members?.length ?? 0} miembro/s
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="btn-row" style={{ marginTop: 10 }}>
                <Link to="/teams" className="btn btn-outline">
                  Ver equipos
                </Link>
              </div>
            </div>
          </div>

          {/* Accesos rápidos */}
          <div className="grid grid-3" style={{ marginTop: 12 }}>
            <div className="card">
              <div className="card-title">Accesos rápidos</div>
              <div className="btn-row">
                <Link to="/payments" className="btn btn-outline">
                  💳 Calendario de pagos
                </Link>
                <Link to="/new/payments" className="btn btn-primary">
                  + Nuevo pago
                </Link>
              </div>
              <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
                Tip: podés filtrar el calendario por equipos.
              </div>
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}

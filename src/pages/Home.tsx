// apps/web/src/pages/Home.tsx
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Layout from '../components/Layout';

// ⬇️ cambia estas importaciones si tus nombres difieren
import { listPaymentsRange, Payment } from '../api/payments';
// suponiendo algo como listTasks() o listMyTasks(); ajustá el import real:
import { listTasks } from '../api/tasks';
import { listTeams, Team } from '../api/teams';

import {
  format as fmt,
  isToday,
  isBefore,
  addHours,
  parseISO,
  differenceInHours,
} from 'date-fns';
import { es } from 'date-fns/locale';

function currency(n: number) {
  try {
    return Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(n)
  } catch { return `$ ${n?.toFixed?.(0) ?? n}` }
}

export default function Home() {
  // Datos base
  const { data: tasks, isLoading: tLoading } = useQuery({
    queryKey: ['home-tasks'],
    // si tenés listMyTasks() usalo; también podés pasar rango {from,to}
    queryFn: () => listTasks(),
  });

  const { data: payments, isLoading: pLoading } = useQuery({
    queryKey: ['home-payments'],
    queryFn: () => listPaymentsRange({}), // sin rango para no perder próximos
  });

  const { data: teams } = useQuery({
    queryKey: ['home-teams'],
    queryFn: listTeams,
  });

  // Derivados
  const todayTasks = useMemo(() => {
    const rows = (tasks ?? []) as any[];
    return rows
      .filter(t => t.status !== 'done' && t.dueAt && isToday(parseISO(t.dueAt)))
      .slice(0, 5);
  }, [tasks]);

  const overdueTasks = useMemo(() => {
    const rows = (tasks ?? []) as any[];
    const now = new Date();
    return rows
      .filter(t => t.status !== 'done' && t.dueAt && isBefore(parseISO(t.dueAt), now))
      .slice(0, 5);
  }, [tasks]);

  const paymentsSoon = useMemo(() => {
    const rows = (payments ?? []) as Payment[];
    const now = new Date();
    return rows
      .filter(p => p.status !== 'paid' && p.dueAt)
      .map(p => ({ p, hours: differenceInHours(parseISO(p.dueAt!), now)}))
      .filter(x => x.hours >= 0 && x.hours <= 72) // próximos 3 días (ajustable)
      .sort((a,b) => a.hours - b.hours)
      .slice(0, 5)
      .map(x => x.p);
  }, [payments]);

  const paymentsOverdue = useMemo(() => {
    const rows = (payments ?? []) as Payment[];
    const now = new Date();
    return rows
      .filter(p => p.status !== 'paid' && p.dueAt && isBefore(parseISO(p.dueAt!), now))
      .slice(0, 5);
  }, [payments]);

  const myTeams = useMemo(() => (teams ?? []) as Team[], [teams]);

  return (
    <Layout
      title="Inicio"
      actions={
        <div className="btn-row">
          <Link to="/tasks" className="btn btn-outline">🗓️ Calendario de tareas</Link>
          <Link to="/payments" className="btn btn-outline">💳 Calendario de pagos</Link>
          <Link to="/new" className="btn btn-primary">+ Nueva tarea</Link>
          <Link to="/new/payments" className="btn btn-primary">+ Nuevo pago</Link>
        </div>
      }
    >
      {/* Hero / saludo */}
      <div className="card" style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:12}}>
        <div>
          <div className="card-sub">Resumen rápido</div>
          <div className="h1" style={{margin:0}}>¡Buen día! Esto es lo más importante ahora</div>
        </div>
        <div className="chips">
          <span className="chip">Hoy: {todayTasks.length} tareas</span>
          <span className="chip">Vencidas: {overdueTasks.length}</span>
          <span className="chip">Pagos pronto: {paymentsSoon.length}</span>
          <span className="chip">Pagos vencidos: {paymentsOverdue.length}</span>
        </div>
      </div>

      {/* Grilla principal */}
      <div className="grid grid-3" style={{marginTop:12}}>
        {/* Col 1: Tareas de hoy */}
        <div className="card">
          <div className="card-title">Tareas de hoy</div>
          {!todayTasks.length ? (
            <div className="muted">No tenés tareas para hoy.</div>
          ) : (
            <ul className="list-separated">
              {todayTasks.map(t => (
                <li key={t._id}>
                  <Link to={`/tasks/${t._id}`} className="no-underline" style={{color:'inherit'}}>
                    <div style={{fontWeight:700}}>{t.title}</div>
                    <div className="muted" style={{fontSize:12}}>
                      Vence: {fmt(parseISO(t.dueAt), 'dd/MM HH:mm', {locale: es})} · Estado: {t.status}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="btn-row" style={{marginTop:10}}>
            <Link to="/tasks" className="btn btn-outline">Ver calendario</Link>
          </div>
        </div>

        {/* Col 2: Tareas vencidas */}
        <div className="card">
          <div className="card-title">Tareas vencidas</div>
          {!overdueTasks.length ? (
            <div className="muted">No hay tareas vencidas 🎉</div>
          ) : (
            <ul className="list-separated">
              {overdueTasks.map(t => (
                <li key={t._id}>
                  <Link to={`/tasks/${t._id}`} className="no-underline" style={{color:'inherit'}}>
                    <div style={{fontWeight:700}}>{t.title}</div>
                    <div className="muted" style={{fontSize:12}}>
                      Vencía: {fmt(parseISO(t.dueAt), 'dd/MM HH:mm', {locale: es})} · Estado: {t.status}
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
              {myTeams.slice(0,6).map(t => (
                <li key={t._id}>
                  <div style={{fontWeight:700}}>{t.name}</div>
                  <div className="muted" style={{fontSize:12}}>
                    {t.members?.length ?? 0} miembro/s
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="btn-row" style={{marginTop:10}}>
            <Link to="/teams" className="btn btn-outline">Ver equipos</Link>
          </div>
        </div>
      </div>

      {/* Segunda fila: Pagos */}
      <div className="grid grid-3" style={{marginTop:12}}>
        <div className="card">
          <div className="card-title">Pagos que vencen pronto (≤72 h)</div>
          {!paymentsSoon.length ? (
            <div className="muted">No hay pagos próximos.</div>
          ) : (
            <ul className="list-separated">
              {paymentsSoon.map(p => (
                <li key={p._id}>
                  <Link to={`/payments/${p._id}`} className="no-underline" style={{color:'inherit'}}>
                    <div style={{fontWeight:800}}>{p.title} <span className="muted" style={{fontWeight:600}}>· {currency(p.amount)}</span></div>
                    <div className="muted" style={{fontSize:12}}>
                      Vence: {p.dueAt ? fmt(parseISO(p.dueAt),'dd/MM HH:mm',{locale: es}) : '—'}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="btn-row" style={{marginTop:10}}>
            <Link to="/payments" className="btn btn-outline">Ver calendario de pagos</Link>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Pagos vencidos</div>
          {!paymentsOverdue.length ? (
            <div className="muted">No hay pagos vencidos 🎉</div>
          ) : (
            <ul className="list-separated">
              {paymentsOverdue.map(p => (
                <li key={p._id}>
                  <Link to={`/payments/${p._id}`} className="no-underline" style={{color:'inherit'}}>
                    <div style={{fontWeight:800}}>{p.title} <span className="muted" style={{fontWeight:600}}>· {currency(p.amount)}</span></div>
                    <div className="muted" style={{fontSize:12}}>
                      Vencía: {p.dueAt ? fmt(parseISO(p.dueAt),'dd/MM HH:mm',{locale: es}) : '—'}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="card-title">Accesos rápidos</div>
          <div className="btn-row">
            <Link to="/tasks" className="btn btn-outline">🗓️ Calendario de tareas</Link>
            <Link to="/payments" className="btn btn-outline">💳 Calendario de pagos</Link>
            <Link to="/new" className="btn btn-primary">+ Nueva tarea</Link>
            <Link to="/new/payments" className="btn btn-primary">+ Nuevo pago</Link>
          </div>
          <div className="muted" style={{marginTop:10, fontSize:12}}>
            Tip: podés filtrar en cada calendario por equipos y usuarios.
          </div>
        </div>
      </div>
    </Layout>
  );
}

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/axios';
import Layout from '../components/Layout';

type PopUser = { _id: string; name?: string; email: string };

type Task = {
  _id: string;
  title: string;
  description?: string;
  priority?: 'low'|'medium'|'high';
  createdAt: string;                 // 👈 NUEVO
  completedAt?: string;
  ownerId?: PopUser | string;
};

function ownerLabel(o?: PopUser | string) {
  if (!o) return '-';
  if (typeof o === 'string') return o;
  return o.name || o.email;
}
function fmt(dt?: string) {
  return dt ? new Date(dt).toLocaleString() : '-'
}

export default function MyCompleted() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['my-completed'],
    queryFn: async () => (await api.get('/tasks/my/completed')).data as Task[],
  });

  return (
    <Layout title="Mis tareas finalizadas">
      <div className="btn-row" style={{ marginBottom: 12 }}>
        <Link to="/" className="btn btn-ghost">← Volver</Link>
      </div>

      {isLoading && <div className="card">Cargando…</div>}
      {isError && (
        <div className="card">
          Error. <button className="btn btn-ghost" onClick={()=>refetch()}>Reintentar</button>
        </div>
      )}

      {!data?.length ? (
        <div className="card">No cerraste tareas todavía.</div>
      ) : (
        data.map(t => (
          <div key={t._id} className="card">
            <div style={{ display:'flex', justifyContent:'space-between', gap:10 }}>
              <h3 className="card-title">{t.title}</h3>
              {t.priority && (
                <span className={`badge ${t.priority==='high'?'red':t.priority==='medium'?'amber':'green'}`}>
                  {t.priority}
                </span>
              )}
            </div>

            {/* Creación */}
            <div className="muted" style={{marginTop:4,fontSize:12}}>
              Creada por <b>{ownerLabel(t.ownerId)}</b> — <b>{fmt(t.createdAt)}</b>
            </div>

            {t.description && <div className="muted" style={{marginTop:6}}>{t.description}</div>}
            <div className="muted" style={{marginTop:8,fontSize:12}}>
              Cerrada el <b>{fmt(t.completedAt)}</b>
            </div>
          </div>
        ))
      )}
    </Layout>
  );
}

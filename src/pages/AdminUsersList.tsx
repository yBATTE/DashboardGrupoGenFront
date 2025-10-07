import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { adminListUsers } from '../api/adminUsers';
import Layout from '../components/Layout';

// Helper consistente con el resto de la app
function displayUser(u: any) {
  if (!u) return '—';
  const full = [u.name, u.lastName].filter(Boolean).join(' ');
  return u.displayName || full || u.email || u._id || '—';
}

export default function AdminUsersList() {
  const [q, setQ] = useState('');
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-users', q],
    queryFn: () => adminListUsers(q),
  });

  return (
    <Layout title="Usuarios (admin)">
      <div className="card" style={{ marginBottom: 12 }}>
        <input
          className="input"
          placeholder="Buscar por nombre, apellido o email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {isLoading && <div className="card">Cargando…</div>}
      {isError && (
        <div className="card">
          Error. <button className="btn btn-ghost" onClick={() => refetch()}>Reintentar</button>
        </div>
      )}

      {!isLoading && !isError && (
        <div className="card">
          {!data?.length ? (
            <div className="muted">Sin resultados.</div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {data.map((u: any) => (
                <li key={u._id} style={{ padding: '10px 0', borderTop: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{displayUser(u)}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{u.email} — {u.role}</div>
                    </div>
                    <Link to={`/admin/users/${u._id}`} className="btn btn-outline">Ver</Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Layout>
  );
}

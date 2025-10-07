// apps/web/src/pages/UsersAdmin.tsx
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import Layout from '../components/Layout';
import { createUser } from '../api/users';

type Role = 'member' | 'admin';

export default function UsersAdmin() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [email, setEmail]         = useState('');
  const [role, setRole]           = useState<Role>('member');

  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const mutation = useMutation({
    mutationFn: (payload: {
      name: string;
      email: string;
      role?: Role;
      lastName?: string; // opcional para futuros usos en backend
    }) => createUser(payload),
    onSuccess: () => {
      setOk(true);
      setErr(null);
      // Si querés limpiar los campos:
      // setFirstName(''); setLastName(''); setEmail(''); setRole('member');
    },
    onError: (e: any) => {
      const msg =
        e?.response?.data?.message ??
        e?.message ??
        'Error al crear el usuario';
      setErr(Array.isArray(msg) ? msg.join(', ') : String(msg));
      setOk(false);
    },
  });

  const isValidEmail = (v: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  // Hacemos obligatorio el nombre y el email. El apellido puede quedar opcional.
  const canSubmit = Boolean(
    firstName.trim() && isValidEmail(email) && (role === 'member' || role === 'admin')
  );

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      setErr('Completá nombre, email válido y rol.');
      return;
    }
    setOk(false);
    setErr(null);

    const fn = firstName.trim();
    const ln = lastName.trim();

    mutation.mutate({
      name: firstName,              // mantiene compat con backend actual
      lastName: ln || undefined,   // se envía si existe
      email: email.trim().toLowerCase(),
      role,
    });
  }

  return (
    <Layout title="Crear usuario">
      <form onSubmit={onSubmit} className="card" autoComplete="off">
        <label className="label">Nombre</label>
        <input
          className="input"
          placeholder="Nombre"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />

        <label className="label" style={{ marginTop: 8 }}>
          Apellido
        </label>
        <input
          className="input"
          placeholder="Apellido"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
        />

        <label className="label" style={{ marginTop: 8 }}>
          Email
        </label>
        <input
          className="input"
          type="email"
          placeholder="email@dominio.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label className="label" style={{ marginTop: 8 }}>
          Rol
        </label>
        <select
          className="select"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
        >
          <option value="member">Miembro (solo lectura)</option>
          <option value="admin">Administrador</option>
        </select>

        <div className="muted" style={{ marginTop: 10 }}>
          Se generará una contraseña aleatoria y se enviará por email al usuario,
          junto con el enlace de acceso.
        </div>

        {err && (
          <div
            className="card"
            style={{
              marginTop: 12,
              borderColor: 'var(--danger)',
              background: '#fff4f4',
            }}
          >
            {err}
          </div>
        )}

        {ok && (
          <div
            className="card"
            style={{
              marginTop: 12,
              borderColor: 'var(--success)',
              background: '#f3fff6',
            }}
          >
            Usuario creado. Se envió la contraseña por email.
          </div>
        )}

        <div className="btn-row" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" disabled={mutation.isPending || !canSubmit}>
            {mutation.isPending ? 'Creando…' : 'Crear usuario'}
          </button>
        </div>
      </form>
    </Layout>
  );
}

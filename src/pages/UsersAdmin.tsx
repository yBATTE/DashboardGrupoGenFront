// apps/web/src/pages/UsersAdmin.tsx
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import Layout from '../components/Layout';
import { createUser } from '../api/users';

type Role = 'member' | 'admin';

interface CreateUserResponse {
  _id: string;
  name: string | null;
  email: string;
  roles: Role[];
  provisionalPassword: string; // <-- lo que devuelve tu backend
}

export default function UsersAdmin() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [email, setEmail]         = useState('');
  const [role, setRole]           = useState<Role>('member');

  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: {
      name: string;
      email: string;
      role?: Role;
      lastName?: string;
    }) => createUser(payload),
    onSuccess: (data: CreateUserResponse) => {
      setOk(true);
      setErr(null);
      setGeneratedPassword(data.provisionalPassword); // <-- guardamos la pass
      // si querés limpiar el formulario:
      // setFirstName(''); setLastName(''); setEmail(''); setRole('member');
    },
    onError: (e: any) => {
      const msg =
        e?.response?.data?.message ??
        e?.message ??
        'Error al crear el usuario';
      setErr(Array.isArray(msg) ? msg.join(', ') : String(msg));
      setOk(false);
      setGeneratedPassword(null);
    },
  });

  const isValidEmail = (v: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

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
    setGeneratedPassword(null);

    mutation.mutate({
      name: firstName,
      lastName: lastName || undefined,
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
          Se generará una contraseña provisional y se mostrará aquí para que se la
          compartas al usuario. No se enviará ningún email automático.
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
            <div>Usuario creado correctamente.</div>
            {generatedPassword && (
              <div style={{ marginTop: 8 }}>
                <strong>Contraseña provisional:</strong>{' '}
                <code>{generatedPassword}</code>
              </div>
            )}
          </div>
        )}

        <div className="btn-row" style={{ marginTop: 16 }}>
          <button
            className="btn btn-primary"
            disabled={mutation.isPending || !canSubmit}
          >
            {mutation.isPending ? 'Creando…' : 'Crear usuario'}
          </button>
        </div>
      </form>
    </Layout>
  );
}

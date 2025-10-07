import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { api } from '../api/axios';
import { useAuthStore } from '../store/auth';

export default function Login() {
  const nav = useNavigate();
  const location = useLocation();
  const setAuth = useAuthStore(s => s.setAuth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      const { accessToken, roles } = res.data || {};
      setAuth(accessToken ?? null, roles ?? []);
      const from = (location.state as any)?.from;
      const next = from?.pathname ? `${from.pathname}${from.search ?? ''}${from.hash ?? ''}` : '/';
      nav(next, { replace: true });
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 401) setErr('Email o password incorrectos');
      else {
        const msg = e?.response?.data?.message ?? e.message ?? 'Error desconocido';
        setErr(Array.isArray(msg) ? msg.join(' - ') : msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      {/* Fondo + overlay */}
      <div className="login-bg" />
      <div className="login-overlay" />

      {/* Branding superior */}
      <header className="login-brand">
        {/* Si tenés logo, poné /brand/grupogen-logo.png en public y descomentá la img */}
        <img src="/brand/grupogen-wordmark2.svg" alt="GrupoGen" />
      </header>

      {/* Card */}
      <main className="login-card">
        <h1 className="login-title">Ingresar</h1>
        <p className="login-sub">Accedé al panel de <b>GrupoGen</b></p>

        <form onSubmit={submit} autoComplete="off">
          <label className="label">Email</label>
          <input
            className="input login-input"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="tu@empresa.com"
            required
          />

          <label className="label" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Password</span>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setShowPass(s => !s)}
              style={{ padding: '2px 8px', fontSize: 12 }}
              aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {showPass ? 'Ocultar' : 'Mostrar'}
            </button>
          </label>
          <input
            className="input login-input"
            type={showPass ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />

          {err && (
            <div className="card login-error">
              {err}
            </div>
          )}

          <div className="btn-row" style={{ marginTop: 16 }}>
            <button className="btn btn-primary login-primary" disabled={loading}>
              {loading ? 'Ingresando…' : 'Entrar'}
            </button>
            <Link to="/" className="btn btn-ghost no-underline">← Volver</Link>
          </div>

          <p className="muted" style={{ marginTop: 12, fontSize: 12 }}>
            <Link to="/forgot-password" className="no-underline">¿Olvidaste tu contraseña?</Link>
          </p>
        </form>

        <footer className="login-foot muted">
          © {new Date().getFullYear()} GrupoGen. Todos los derechos reservados.
        </footer>
      </main>
    </div>
  );
}

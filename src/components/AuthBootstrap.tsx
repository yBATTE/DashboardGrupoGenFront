// src/components/AuthBootstrap.tsx
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/auth'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api'

export default function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const token  = useAuthStore(s => s.accessToken)
  const setAuth = useAuthStore(s => s.setAuth)
  const clear   = useAuthStore(s => s.clear)

  const [ready, setReady] = useState(false)
  const location = useLocation()
  const onLogin = location.pathname.startsWith('/login')

  useEffect(() => {
    let ignore = false

    async function boot() {
      if (token) {            // ya tenés un token en memoria
        setReady(true)
        return
      }

      // ✅ Hacemos el refresh con fetch (sin interceptores) para evitar bucles
      try {
        const res = await fetch(`${BASE}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',               // importante para enviar cookie httpOnly
          headers: { 'Content-Type': 'application/json' },
        })

        if (!ignore && res.ok) {
          const data = await res.json()
          if (data?.accessToken) setAuth(data.accessToken, data.roles ?? [])
        } else if (!ignore) {
          clear()
        }
      } catch {
        if (!ignore) clear()
      } finally {
        if (!ignore) setReady(true)
      }
    }

    // añade un **failsafe** de 5s para que nunca quede colgado
    const failsafe = setTimeout(() => { if (!ignore) setReady(true) }, 5000)

    boot()
    return () => { ignore = true; clearTimeout(failsafe) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // se ejecuta una sola vez

  // En /login nunca bloqueamos: se ve siempre el formulario
  if (onLogin) return <>{children}</>

  // En el resto de rutas, esperamos a terminar el intento de restauración
  if (!ready) {
    return (
      <div style={{
        minHeight: '100vh', display: 'grid', placeItems: 'center',
        fontFamily: 'ui-sans-serif, system-ui', color: '#6b7280'
      }}>
        <div>
          <div
            style={{
              width: 28, height: 28, borderRadius: '50%',
              border: '3px solid #e5e7eb', borderTopColor: '#5b21b6',
              animation: 'spin .8s linear infinite', margin: '0 auto 8px'
            }}
          />
          <div>Preparando sesión…</div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

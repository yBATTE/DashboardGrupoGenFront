import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/auth'

export default function PublicOnly({ children }: { children: React.ReactNode }) {
  const isLogged = useAuthStore(s => s.isLoggedIn())
  const location = useLocation()
  if (isLogged) {
    const from = (location.state as any)?.from
    return <Navigate to={from?.pathname ?? '/'} replace />
  }
  return <>{children}</>
}

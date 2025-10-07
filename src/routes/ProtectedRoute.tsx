import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/auth';

export default function ProtectedRoute(){
  const token = useAuthStore(s => s.accessToken);
  return token ? <Outlet/> : <Navigate to="/login" replace/>;
}

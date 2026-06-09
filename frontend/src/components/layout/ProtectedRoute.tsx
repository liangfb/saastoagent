import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores';

export function ProtectedRoute() {
  const username = useAuthStore((s) => s.username);
  const location = useLocation();
  if (!username) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

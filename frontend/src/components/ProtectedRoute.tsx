import { Navigate, Outlet } from "react-router";
import { useAuth } from "../context/AuthContext";

// Penjaga halaman: belum login -> lempar ke /login
export default function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Memuat...
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return <Outlet />;
}

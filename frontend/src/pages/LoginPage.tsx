import { Navigate } from "react-router";
import { useAuth } from "../context/AuthContext";
import { LoginForm } from "@/components/login-form";
import { IndustrialBackground } from "@/components/industrial-background";

export default function LoginPage() {
  const { user } = useAuth();

  // Sudah login -> tidak perlu lihat halaman login
  if (user) return <Navigate to="/" replace />;

  return (
    <div className="relative isolate flex min-h-svh flex-col items-center justify-center gap-6 overflow-hidden p-6 md:p-10">
      <IndustrialBackground />
      <div className="relative z-10 flex w-full max-w-md flex-col gap-6">
        <LoginForm />
      </div>
    </div>
  );
}

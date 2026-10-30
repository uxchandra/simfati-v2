import { Navigate } from "react-router";
import { ShieldCheckIcon } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  const { user } = useAuth();

  // Sudah login -> tidak perlu lihat halaman login
  if (user) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-2 self-center text-lg font-semibold">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheckIcon className="size-4" />
          </div>
          SIMFATI
        </div>
        <LoginForm />
      </div>
    </div>
  );
}

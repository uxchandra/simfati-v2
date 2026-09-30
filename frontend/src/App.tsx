import { BrowserRouter, Route, Routes } from "react-router";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminLayout from "./layouts/AdminLayout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import UsersPage from "./pages/UsersPage";
import ComingSoonPage from "./pages/ComingSoonPage";

export default function App() {
  return (
    // Paling luar supaya halaman login pun ikut tema yang dipilih
    <ThemeProvider>
      <AuthProvider>
        {/* Wajib ada supaya semua <Tooltip> (mis. di sidebar) bisa bekerja */}
        <TooltipProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />

              {/* Semua route di dalam sini wajib login & memakai layout admin */}
              <Route element={<ProtectedRoute />}>
                <Route element={<AdminLayout />}>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/users" element={<UsersPage />} />
                  {/* Menu yang halamannya belum dibuat / URL tidak dikenal */}
                  <Route path="*" element={<ComingSoonPage />} />
                </Route>
              </Route>
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

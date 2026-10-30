import { BrowserRouter, Route, Routes } from "react-router";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "./context/AuthContext";
import { MenuProvider } from "./context/MenuContext";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminLayout from "./layouts/AdminLayout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import UsersPage from "./pages/UsersPage";
import KategoriAsetPage from "./pages/KategoriAsetPage";
import SubcontPage from "./pages/SubcontPage";
import CategoryPage from "./pages/CategoryPage";
import AssetPage from "./pages/AssetPage";
import PicMesinPage from "./pages/PicMesinPage";
import SparepartPage from "./pages/SparepartPage";
import ChecksheetPage from "./pages/ChecksheetPage";
import PreventiveSchedulePage from "./pages/PreventiveSchedulePage";
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
                {/* MenuProvider: submenu dinamis (mis. Data Asset) untuk sidebar & breadcrumb */}
                <Route
                  element={
                    <MenuProvider>
                      <AdminLayout />
                    </MenuProvider>
                  }
                >
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/users" element={<UsersPage />} />
                  <Route path="/data-master/kategori-aset" element={<KategoriAsetPage />} />
                  <Route path="/data-master/subcont" element={<SubcontPage />} />
                  <Route path="/data-master/pic-mesin" element={<PicMesinPage />} />
                  <Route path="/sparepart" element={<SparepartPage />} />
                  <Route path="/data-master/checksheet" element={<ChecksheetPage />} />
                  <Route path="/schedule/preventive" element={<PreventiveSchedulePage />} />
                  <Route
                    path="/schedule/kategori"
                    element={<CategoryPage key="schedule" title="Kategori Schedule" endpoint="/schedule-categories" />}
                  />
                  <Route
                    path="/data-master/kategori-repair"
                    element={<CategoryPage key="repair" title="Kategori Repair" endpoint="/repair-categories" />}
                  />
                  {/* Menu yang halamannya belum dibuat / URL tidak dikenal */}
                  <Route path="/data-asset/:categoryId" element={<AssetPage />} />
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

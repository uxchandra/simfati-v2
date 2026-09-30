import { Fragment } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { AppSidebar } from "@/components/app-sidebar";
import { ModeToggle } from "@/components/mode-toggle";
import { UserMenu } from "@/components/user-menu";
import { findMenuTrail } from "@/config/menus";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

export default function AdminLayout() {
  const { pathname } = useLocation();
  // mis. "/users" -> ["Manajemen User", "Users"]
  const trail = findMenuTrail(pathname);

  return (
    <SidebarProvider>
      <AppSidebar />

      {/* Area konten */}
      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b bg-background px-4">
          {/* Buka/tutup sidebar (di HP jadi drawer) */}
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink asChild>
                  <Link to="/">Admin Panel</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              {trail.map((title, i) => {
                const isLast = i === trail.length - 1;
                return (
                  <Fragment key={title}>
                    {/* Di HP hanya judul halaman terakhir yang tampil */}
                    <BreadcrumbSeparator className="hidden md:block" />
                    <BreadcrumbItem className={isLast ? "" : "hidden md:block"}>
                      {isLast ? <BreadcrumbPage>{title}</BreadcrumbPage> : title}
                    </BreadcrumbItem>
                  </Fragment>
                );
              })}
            </BreadcrumbList>
          </Breadcrumb>

          {/* Kanan header: ganti tema + menu profil */}
          <div className="ml-auto flex items-center gap-1">
            <ModeToggle />
            <UserMenu />
          </div>
        </header>

        <main className="p-4 lg:p-8">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

import * as React from "react"
import { Link } from "react-router"
import { ShieldCheckIcon } from "lucide-react"
import { NavMain } from "@/components/nav-main"
import { useMenus } from "@/context/MenuContext"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { menus } = useMenus()

  return (
    // collapsible="icon": saat ditutup, sidebar menyusut jadi strip ikon
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <ShieldCheckIcon className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">SIMFATI</span>
                  <span className="truncate text-xs">Sistem Maintenance Facility</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <NavMain items={menus} />
      </SidebarContent>

      {/* Garis tipis di tepi sidebar: klik untuk buka/tutup */}
      <SidebarRail />
    </Sidebar>
  )
}

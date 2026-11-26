import * as React from "react"
import { Link } from "react-router"
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
                <img
                  src="/logo.png"
                  alt="Logo"
                  className="h-11 w-16 shrink-0 object-contain group-data-[collapsible=icon]:size-8"
                />
                <span className="truncate font-heading text-xl font-bold tracking-wide">SIMFATI</span>
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

import { NavLink, useLocation } from "react-router"
import { ChevronRightIcon } from "lucide-react"
import type { NavItem } from "@/config/menus"
import { cn } from "@/lib/utils"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar"

// Menu tidak aktif agak pudar, menu aktif teks penuh + latar stone-200
// (mode gelap: neutral-800, karena stone-200 terlalu terang di sidebar gelap)
const itemClass =
  "text-sidebar-foreground/70 data-active:bg-stone-200 data-active:text-sidebar-foreground dark:data-active:bg-neutral-800"

export function NavMain({ items }: { items: NavItem[] }) {
  const { pathname } = useLocation()
  const { state, setOpen, setOpenMobile } = useSidebar()

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Menu</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          // Menu tanpa submenu: langsung link
          if (!item.items) {
            return (
              <SidebarMenuItem key={item.title}>
                {/* tooltip: muncul saat sidebar diciutkan jadi ikon */}
                <SidebarMenuButton
                  asChild
                  tooltip={item.title}
                  isActive={pathname === item.to}
                  className={itemClass}
                >
                  {/* Tutup sidebar di HP setelah pindah halaman */}
                  <NavLink to={item.to!} onClick={() => setOpenMobile(false)}>
                    <item.icon />
                    <span>{item.title}</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          }

          // Menu dengan submenu: grup yang bisa dibuka-tutup
          const hasActiveChild = item.items.some((sub) => pathname === sub.to)

          return (
            <Collapsible
              key={item.title}
              asChild
              defaultOpen={hasActiveChild}
              className="group/collapsible"
            >
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton
                    tooltip={item.title}
                    className={cn(itemClass, hasActiveChild && "font-medium text-sidebar-foreground")}
                    // Saat sidebar diciutkan jadi ikon, klik grup = lebarkan sidebar dulu
                    onClick={() => state === "collapsed" && setOpen(true)}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                    <ChevronRightIcon className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {item.items.map((sub) => (
                      <SidebarMenuSubItem key={sub.to}>
                        <SidebarMenuSubButton
                          asChild
                          isActive={pathname === sub.to}
                          className={itemClass}
                        >
                          <NavLink to={sub.to} onClick={() => setOpenMobile(false)}>
                            <span>{sub.title}</span>
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}

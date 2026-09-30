import { useNavigate } from "react-router"
import { ChevronDownIcon, LogOutIcon } from "lucide-react"
import { useAuth } from "../context/AuthContext"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// "Budi Santoso" -> "BS"
function initials(name: string) {
  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

// Menu profil di kanan navbar: avatar + nama, klik untuk lihat detail & logout
export function UserMenu() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  if (!user) return null

  function handleLogout() {
    logout()
    navigate("/login")
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-auto gap-2 px-2 py-1">
          <Avatar className="size-8 rounded-lg">
            <AvatarFallback className="rounded-lg">{initials(user.name)}</AvatarFallback>
          </Avatar>
          {/* Nama disembunyikan di HP supaya header tidak penuh */}
          <span className="hidden text-sm font-medium sm:inline">{user.name}</span>
          <ChevronDownIcon className="hidden text-muted-foreground sm:inline" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end">
        <DropdownMenuLabel className="font-normal">
          <div className="grid text-sm leading-tight">
            <span className="truncate font-medium">{user.name}</span>
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            <span className="mt-1 text-xs text-muted-foreground">Role: {user.role}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          <LogOutIcon />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

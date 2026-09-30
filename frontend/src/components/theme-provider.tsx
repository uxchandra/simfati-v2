import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

type Theme = "dark" | "light" | "system"

type ThemeContextType = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const STORAGE_KEY = "theme"

const ThemeContext = createContext<ThemeContextType | null>(null)

// Ambil pilihan tema terakhir dari localStorage (default: ikut sistem)
function getInitialTheme(): Theme {
  const saved = localStorage.getItem(STORAGE_KEY)
  return saved === "dark" || saved === "light" || saved === "system" ? saved : "system"
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)

  // Pasang/lepas class "dark" di <html> setiap kali tema berubah.
  // Semua variabel di blok .dark (index.css) & class dark:... ikut aktif.
  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia("(prefers-color-scheme: dark)")

    function apply() {
      const isDark = theme === "dark" || (theme === "system" && media.matches)
      root.classList.toggle("dark", isDark)
    }

    apply()

    // Mode "system": ikut berubah kalau setting OS diganti saat aplikasi terbuka
    if (theme === "system") {
      media.addEventListener("change", apply)
      return () => media.removeEventListener("change", apply)
    }
  }, [theme])

  function setTheme(theme: Theme) {
    localStorage.setItem(STORAGE_KEY, theme)
    setThemeState(theme)
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}

// Hook supaya komponen lain cukup panggil: const { theme, setTheme } = useTheme();
export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme harus dipakai di dalam ThemeProvider")
  return ctx
}

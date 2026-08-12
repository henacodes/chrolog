import { useEffect, useState } from "react"
import { Sun, Moon } from "lucide-react"
import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("chrolog-theme")
      if (stored === "light" || stored === "dark") return stored
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
    }
    return "dark"
  })

  useEffect(() => {
    const root = document.documentElement
    if (theme === "dark") {
      root.classList.add("dark")
    } else {
      root.classList.remove("dark")
    }
    localStorage.setItem("chrolog-theme", theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"))
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggleTheme}
      className="gap-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1C1F23] text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 shadow-sm rounded-xl"
      title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
    >
      {theme === "dark" ? (
        <>
          <Sun className="h-4 w-4 text-[#C6FE1E]" />
          <span className="text-xs font-bold text-slate-100">Light Mode</span>
        </>
      ) : (
        <>
          <Moon className="h-4 w-4 text-slate-700" />
          <span className="text-xs font-bold text-slate-900">Dark Mode</span>
        </>
      )}
    </Button>
  )
}

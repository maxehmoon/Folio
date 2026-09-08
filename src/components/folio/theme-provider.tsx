"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react"

type ThemePreference = "light" | "dark" | "oled" | "system"
type ResolvedTheme = "light" | "dark" | "oled"

type ThemeContextValue = {
  preference: ThemePreference
  resolvedTheme: ResolvedTheme
  setPreference: (preference: ThemePreference) => void
}

const THEME_STORAGE_KEY = "folio-theme"
const THEME_CHANGE_EVENT = "folio-theme-change"
const SERVER_THEME_SNAPSHOT = "light:light"
const ThemeContext = createContext<ThemeContextValue | null>(null)

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark" || value === "oled" || value === "system"
}

function systemTheme(mediaQuery: MediaQueryList): ResolvedTheme {
  return mediaQuery.matches ? "dark" : "light"
}

function applyTheme(preference: ThemePreference, mediaQuery: MediaQueryList) {
  const resolved =
    preference === "system" ? systemTheme(mediaQuery) : preference
  const root = document.documentElement
  root.dataset.theme = resolved
  root.dataset.themePreference = preference
  root.style.colorScheme = resolved === "light" ? "light" : "dark"
  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute(
      "content",
      resolved === "oled" ? "#000000" : resolved === "dark" ? "#070706" : "#f7f7f5",
    )
  return resolved
}

function getThemeSnapshot() {
  const storedPreference =
    document.documentElement.dataset.themePreference ?? null
  const preference = isThemePreference(storedPreference)
    ? storedPreference
    : "light"
  const theme = document.documentElement.dataset.theme
  const resolvedTheme = theme === "dark" || theme === "oled" ? theme : "light"
  return `${preference}:${resolvedTheme}`
}

function subscribeToTheme(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")

  function handleSystemThemeChange() {
    if (document.documentElement.dataset.themePreference === "system") {
      applyTheme("system", mediaQuery)
      onStoreChange()
    }
  }

  function handleStorage(event: StorageEvent) {
    if (event.key !== THEME_STORAGE_KEY) return
    const preference = isThemePreference(event.newValue)
      ? event.newValue
      : "light"
    applyTheme(preference, mediaQuery)
    onStoreChange()
  }

  mediaQuery.addEventListener("change", handleSystemThemeChange)
  window.addEventListener("storage", handleStorage)
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange)

  return () => {
    mediaQuery.removeEventListener("change", handleSystemThemeChange)
    window.removeEventListener("storage", handleStorage)
    window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange)
  }
}

function ThemeProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    () => SERVER_THEME_SNAPSHOT,
  )
  const [preference, resolvedTheme] = snapshot.split(":") as [
    ThemePreference,
    ResolvedTheme,
  ]

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const root = document.documentElement

    root.classList.add("theme-transition")
    window.localStorage.setItem(THEME_STORAGE_KEY, nextPreference)
    applyTheme(nextPreference, mediaQuery)
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT))
    window.setTimeout(() => root.classList.remove("theme-transition"), 180)
  }, [])

  const value = useMemo(
    () => ({ preference, resolvedTheme, setPreference }),
    [preference, resolvedTheme, setPreference],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider")
  }
  return context
}

export {
  ThemeProvider,
  useTheme,
  type ResolvedTheme,
  type ThemePreference,
}

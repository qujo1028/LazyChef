"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"

/** Follows the phone's light/dark setting. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  )
}

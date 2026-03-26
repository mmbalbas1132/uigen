"use client";

// next-themes requiere "use client" porque accede a localStorage y al DOM.
// Este wrapper existe porque layout.tsx es un Server Component y no puede
// importar directamente providers que necesiten el cliente.
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { type ThemeProviderProps } from "next-themes";

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}

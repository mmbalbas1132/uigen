import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "UIGen - Generador de componentes React",
  description: "Genera componentes React con IA y vista previa en tiempo real",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning es obligatorio con next-themes: el servidor
    // no conoce el tema del usuario, por lo que la clase "dark" del <html>
    // será diferente entre servidor y cliente. Este atributo le dice a React
    // que ignore esa diferencia puntual y no lance un warning.
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* attribute="class" → aplica class="dark" al <html>, que es lo que
            lee la variante @custom-variant dark de globals.css.
            defaultTheme="system" → respeta prefers-color-scheme del SO por defecto.
            disableTransitionOnChange → evita flash de transición en el primer render. */}
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}

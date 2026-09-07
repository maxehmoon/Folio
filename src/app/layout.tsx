import type { Metadata, Viewport } from "next";

import { FormValidationProvider } from "@/components/folio/form-validation-provider";
import { ThemeProvider } from "@/components/folio/theme-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Folio",
    template: "%s · Folio",
  },
  description: "Self-hosted invoicing for independent businesses.",
  icons: {
    icon: [{ type: "image/svg+xml", url: "/folio-mark.svg" }],
    shortcut: "/folio-mark.svg",
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: "#f7f7f5",
};

const themeBootstrap = `
  (() => {
    try {
      const stored = localStorage.getItem("folio-theme");
      const preference = stored === "light" || stored === "dark" || stored === "oled" || stored === "system"
        ? stored
        : "light";
      const resolved = preference === "system"
        ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
        : preference;
      const root = document.documentElement;
      root.dataset.theme = resolved;
      root.dataset.themePreference = preference;
      root.style.colorScheme = resolved === "light" ? "light" : "dark";
      document.querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", resolved === "oled" ? "#000000" : resolved === "dark" ? "#070706" : "#f7f7f5");
    } catch {
      document.documentElement.dataset.theme = "light";
      document.documentElement.dataset.themePreference = "light";
    }
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <ThemeProvider>
          {children}
          <FormValidationProvider />
        </ThemeProvider>
      </body>
    </html>
  );
}

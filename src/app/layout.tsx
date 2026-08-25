import type { Metadata } from "next";
import { Public_Sans, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";

import { prisma } from "@/lib/db";
import { cn } from "@/lib/utils";
import { getCurrentTenant } from "@/lib/tenant";
import {
  isThemePresetKey,
  themePresetCss,
  type ThemePresetKey,
} from "@/lib/theme-presets";

import "./globals.css";

const publicSans = Public_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const fallback = process.env.NEXT_PUBLIC_APP_NAME ?? "Rifa Online";
  let name = fallback;
  let description: string | undefined;
  try {
    const tenant = await getCurrentTenant();
    if (tenant) {
      const t = await prisma.tenant.findUnique({
        where: { id: tenant.id },
        select: { name: true, siteDescription: true },
      });
      if (t?.name) name = t.name;
      if (t?.siteDescription) description = t.siteDescription;
    }
  } catch {
    // DB indisponível em build estático: cai no fallback do env.
  }
  return {
    title: { default: name, template: `%s · ${name}` },
    description:
      description ||
      "Participe das nossas rifas online. Pagamento via Pix, sorteios auditáveis.",
  };
}

// Carrega o tema configurado pelo admin do tenant atual. Cached pelo Next.js
// (revalidado quando admin salva via updateThemeAction).
async function loadTheme(): Promise<{
  themeMode: "LIGHT" | "DARK";
  themePreset: ThemePresetKey;
}> {
  try {
    const tenant = await getCurrentTenant();
    if (!tenant) return { themeMode: "LIGHT", themePreset: "orange" };
    const t = await prisma.tenant.findUnique({
      where: { id: tenant.id },
      select: { themeMode: true, themePreset: true },
    });
    const preset =
      t?.themePreset && isThemePresetKey(t.themePreset)
        ? t.themePreset
        : "orange";
    return {
      themeMode: t?.themeMode ?? "LIGHT",
      themePreset: preset,
    };
  } catch {
    // DB indisponível durante build estático → fallback claro/laranja.
    return { themeMode: "LIGHT", themePreset: "orange" };
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { themeMode, themePreset } = await loadTheme();
  const css = themePresetCss(themePreset);

  return (
    <html
      lang="pt-BR"
      className={cn(
        `${publicSans.variable} ${jetbrains.variable} h-full antialiased`,
        themeMode === "DARK" && "dark"
      )}
    >
      <head>
        {/* Injeta as CSS vars do preset escolhido pelo admin. */}
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}

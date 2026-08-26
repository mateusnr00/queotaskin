import type { Metadata } from "next";
import Script from "next/script";
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
  let icone: string | undefined;
  try {
    const tenant = await getCurrentTenant();
    if (tenant) {
      const t = await prisma.tenant.findUnique({
        where: { id: tenant.id },
        select: {
          name: true,
          siteDescription: true,
          faviconUrl: true,
          logoUrl: true,
        },
      });
      if (t?.name) name = t.name;
      if (t?.siteDescription) description = t.siteDescription;
      // Sem favicon próprio, a logo serve: um ícone da marca, ainda que
      // apertado, comunica mais do que o padrão genérico do framework.
      icone = t?.faviconUrl ?? t?.logoUrl ?? undefined;
    }
  } catch {
    // DB indisponível em build estático: cai no fallback do env.
  }
  const descricao =
    description ||
    "Participe das nossas rifas online. Pagamento via Pix, sorteios auditáveis.";

  return {
    title: { default: name, template: `%s · ${name}` },
    description: descricao,
    // Rifa circula por link no WhatsApp, e link sem imagem chega como um
    // retângulo cinza, some no meio da conversa. A logo já resolve o caso
    // geral; a página da campanha sobrescreve com a capa da skin, que vende
    // muito mais.
    openGraph: {
      type: "website",
      siteName: name,
      title: name,
      description: descricao,
      locale: "pt_BR",
      ...(icone ? { images: [{ url: icone, alt: name }] } : {}),
    },
    twitter: {
      card: icone ? "summary_large_image" : "summary",
      title: name,
      description: descricao,
      ...(icone ? { images: [icone] } : {}),
    },
    // Vem do banco, não de um arquivo no repositório: assim trocar o ícone
    // é enviar uma imagem no painel, sem depender de um novo deploy.
    //
    // O ícone padrão mora em public/favicon.ico, não em src/app/. Em src/app
    // o Next injeta um <link rel="icon"> próprio em toda página, que
    // conviveria com o nosso e deixaria o navegador escolhendo entre dois.
    // Em public/ ele fica sendo só o /favicon.ico que o navegador busca
    // sozinho quando nenhum ícone foi cadastrado.
    ...(icone
      ? {
          icons: {
            icon: [{ url: icone }],
            shortcut: [{ url: icone }],
            apple: [{ url: icone }],
          },
        }
      : {}),
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
        {/* react-grab: ferramenta de inspeção pessoal, ligada por variável de
            ambiente em vez de só por NODE_ENV. Só o desenvolvimento não basta,
            porque aqui somos dois: sem a variável, ligaria na máquina do outro
            também, e ninguém pediu uma sobreposição extra em cima da tela.
            REACT_GRAB=1 fica no .env de quem quiser, que é ignorado pelo git.

            Sem NEXT_PUBLIC_ de propósito: isto é lido no servidor, e o prefixo
            público assaria o valor no pacote do navegador sem necessidade. */}
        {process.env.NODE_ENV === "development" &&
          process.env.REACT_GRAB === "1" && (
            <Script
              src="//unpkg.com/react-grab/dist/index.global.js"
              crossOrigin="anonymous"
              strategy="beforeInteractive"
            />
          )}
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

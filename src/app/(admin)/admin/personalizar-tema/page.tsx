import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { ThemeForm } from "@/components/admin/theme-form";
import { isThemePresetKey, type ThemePresetKey } from "@/lib/theme-presets";

export const metadata: Metadata = { title: "Personalizar o tema" };

export default async function CustomizeThemePage() {
  const session = await requireAdmin();
  const tenantId = await getActiveTenantIdForAdmin(session.user);

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      themeMode: true,
      themePreset: true,
      headerAccent: true,
      cardColor: true,
    },
  });

  const preset: ThemePresetKey = isThemePresetKey(tenant.themePreset)
    ? tenant.themePreset
    : "orange";
  const cardColor: "black" | "white" | "accent" =
    tenant.cardColor === "white"
      ? "white"
      : tenant.cardColor === "accent"
      ? "accent"
      : "black";

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          Personalizar o tema
        </h1>
        <nav className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/admin" className="hover:text-foreground">
            Admin
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span>Parâmetros</span>
        </nav>
      </div>

      <ThemeForm
        initialMode={tenant.themeMode}
        initialPreset={preset}
        initialHeaderAccent={tenant.headerAccent}
        initialCardColor={cardColor}
      />
    </div>
  );
}

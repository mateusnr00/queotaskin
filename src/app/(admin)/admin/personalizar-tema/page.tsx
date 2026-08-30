import { CabecalhoDeAdmin } from "@/components/admin/cabecalho";
import type { Metadata } from "next";
import { Palette } from "lucide-react";

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
        <CabecalhoDeAdmin
          etiqueta="Ajustes"
          icone={<Palette aria-hidden className="h-3 w-3" />}
          titulo="Personalizar o tema"
          migalha={[{ rotulo: "Admin", href: "/admin" }, { rotulo: "Tema" }]}
        />
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

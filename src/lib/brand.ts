import { cache } from "react";

import { prisma } from "@/lib/db";
import { getCurrentTenant } from "@/lib/tenant";

// Identidade visual do tenant, num lugar só.
//
// Antes cada tela que mostrava a marca fazia a própria consulta — e a maioria
// simplesmente não mostrava, caindo num ícone genérico de ticket. O resultado
// é que a logo aparecia só no cabeçalho público, e o painel, o login e os
// links compartilhados ficavam sem identidade nenhuma.
//
// `cache` do React: várias chamadas no mesmo render dão uma consulta só.

export interface Marca {
  name: string;
  logoUrl: string | null;
  /** RECTANGLE = faixa com o nome escrito; ROUND = emblema. */
  logoShape: "ROUND" | "RECTANGLE";
}

const PADRAO: Marca = {
  name: process.env.NEXT_PUBLIC_APP_NAME || "QuéOta Skin",
  logoUrl: null,
  logoShape: "RECTANGLE",
};

export const getBrand = cache(async (): Promise<Marca> => {
  try {
    const tenant = await getCurrentTenant();
    if (!tenant) return PADRAO;
    const t = await prisma.tenant.findUnique({
      where: { id: tenant.id },
      select: { name: true, logoUrl: true, logoShape: true },
    });
    if (!t) return PADRAO;
    return {
      name: t.name || PADRAO.name,
      logoUrl: t.logoUrl,
      logoShape: t.logoShape,
    };
  } catch {
    // Banco fora do ar em build estático: a marca não é motivo para a
    // página inteira falhar.
    return PADRAO;
  }
});

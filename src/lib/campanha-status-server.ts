import { cache } from "react";

import { prisma } from "@/lib/db";
import { getCurrentTenant } from "@/lib/tenant";
import {
  CONFIGURACAO_PADRAO,
  type ConfiguracaoDeStatus,
} from "@/lib/campanha-status";

// Carrega os textos e percentuais do selo automático.
//
// Fica separado de campanha-status.ts porque aquele é puro: entra número,
// sai texto, e é isso que o deixa testável sem banco. Aqui mora a parte que
// consulta.
//
// `cache` do React: as várias campanhas da mesma página compartilham uma
// consulta só.
export const getConfiguracaoDeStatus = cache(
  async (): Promise<ConfiguracaoDeStatus> => {
    try {
      const tenant = await getCurrentTenant();
      if (!tenant) return CONFIGURACAO_PADRAO;
      const t = await prisma.tenant.findUnique({
        where: { id: tenant.id },
        select: {
          earlyText: true,
          halfwayText: true,
          almostGoneText: true,
          soldOutText: true,
          halfwayPercent: true,
          almostGonePercent: true,
        },
      });
      return t ?? CONFIGURACAO_PADRAO;
    } catch {
      // Banco fora do ar não pode derrubar a listagem inteira por causa de
      // um selo: cai no padrão e a página segue.
      return CONFIGURACAO_PADRAO;
    }
  }
);

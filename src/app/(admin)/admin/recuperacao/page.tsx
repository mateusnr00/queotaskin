import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth-helpers";
import { listarCasosDeRecuperacao } from "@/server/services/otp/recuperacao";
import { PainelDeRecuperacao } from "@/components/admin/painel-de-recuperacao";

export const metadata: Metadata = { title: "Recuperação de contas" };

// Painel mínimo de suporte (§8). Casos scoped por tenant no backend (§9): o
// contexto vem da sessão admin, nunca do request. Dados do titular mascarados.
export default async function RecuperacaoPage() {
  const sessao = await requireAdmin();
  const casos = await listarCasosDeRecuperacao({
    role: sessao.user.role,
    tenantId: sessao.user.tenantId ?? null,
  });
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <h2 className="text-2xl font-bold tracking-tight">Recuperação de contas legadas</h2>
        <p className="text-sm text-muted-foreground">
          Aprovar emite um link de recuperação; o titular ainda precisa provar o
          novo telefone por código. A aprovação nunca verifica o telefone.
        </p>
      </div>
      <PainelDeRecuperacao casos={casos.map((c) => ({
        ...c, openedAt: c.openedAt.toISOString(), resolvedAt: c.resolvedAt?.toISOString() ?? null,
      }))} />
    </div>
  );
}

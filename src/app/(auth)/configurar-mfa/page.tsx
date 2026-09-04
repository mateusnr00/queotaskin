import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";

import { requireAdminSemTrocaDeSenha } from "@/lib/auth-helpers";
import { mfaAtivo } from "@/server/services/admin/mfa";
import { MfaEnrollForm } from "@/components/admin/mfa-enroll-form";

export const metadata: Metadata = { title: "Configurar MFA" };

// Fora do grupo (admin): o layout do painel manda para ca quem ainda nao tem
// MFA. Se usasse aquele layout, redirecionaria para si mesma em laco.
export default async function ConfigurarMfaPage() {
  await requireAdminSemTrocaDeSenha();
  const jaAtiva = await mfaAtivo((await requireAdminSemTrocaDeSenha()).user.id);
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-emerald-500" />
        <div className="space-y-1.5">
          <h2 className="text-2xl font-bold tracking-tight">Verificacao em duas etapas</h2>
          <p className="text-sm text-muted-foreground">
            O painel exige um aplicativo autenticador (TOTP). Escaneie o codigo,
            confirme e guarde os codigos de recuperacao.
          </p>
        </div>
      </div>
      {jaAtiva ? (
        <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
          A verificacao em duas etapas ja esta ativa nesta conta.
        </p>
      ) : (
        <MfaEnrollForm />
      )}
    </div>
  );
}

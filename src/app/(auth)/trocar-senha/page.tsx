import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";

import { requireAdminSemTrocaDeSenha } from "@/lib/auth-helpers";
import { ChangePasswordForm } from "@/components/admin/change-password-form";

export const metadata: Metadata = { title: "Alterar senha" };

// Fica fora do grupo (admin) de propósito. O layout do painel chama
// requireAdmin, que manda para cá quem tem senha temporária — se esta página
// usasse aquele layout, redirecionaria para si mesma em laço. E, para uma
// troca obrigatória, a tela sem menu é a certa: não há para onde navegar
// antes de resolver.
export default async function TrocarSenhaPage() {
  const sessao = await requireAdminSemTrocaDeSenha();
  const obrigatoria = sessao.mustChangePassword;

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <h2 className="text-2xl font-bold tracking-tight">Alterar senha</h2>
        <p className="text-sm text-muted-foreground">
          A senha vale só para o painel. O site público continua entrando por
          nome e celular.
        </p>
      </div>

      {obrigatoria && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
              Defina uma senha para continuar
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              A senha atual é temporária e foi entregue por fora do sistema.
              Enquanto ela valer, o painel fica bloqueado.
            </p>
          </div>
        </div>
      )}

      <ChangePasswordForm />
    </div>
  );
}

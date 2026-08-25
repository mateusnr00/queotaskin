import Link from "next/link";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";

import { LoginForm } from "@/components/forms/login-form";
import { AdminLoginForm } from "@/components/forms/admin-login-form";
import { isAdminHost } from "@/lib/host";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const sp = await searchParams;
  const redirectQS = sp.redirect
    ? `?redirect=${encodeURIComponent(sp.redirect)}`
    : "";

  // Mesma rota, dois formulários. No host do painel entra-se com e-mail e
  // senha; no site público, com nome e celular. A regra de host é a mesma
  // que o proxy usa para rotear (src/lib/host.ts), então as duas telas não
  // podem discordar sobre onde estão.
  const host = (await headers()).get("host") ?? "";
  const noPainel = isAdminHost(host);

  if (noPainel) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            Painel administrativo
          </span>
          <h2 className="text-2xl font-bold tracking-tight">Entrar</h2>
          <p className="text-sm text-muted-foreground">
            Acesso restrito à equipe. Use o e-mail e a senha da sua conta de
            administrador.
          </p>
        </div>
        <AdminLoginForm />
        <p className="text-center text-xs text-muted-foreground">
          Vai comprar um número? O site fica em{" "}
          <span className="font-medium text-foreground">
            {host.replace(/^(admin|painel)\./i, "")}
          </span>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h2 className="text-2xl font-bold tracking-tight">Entrar</h2>
        <p className="text-sm text-muted-foreground">
          Informe seu nome completo e celular cadastrados. Sem senha.
        </p>
      </div>
      <LoginForm />
      <p className="text-center text-sm text-muted-foreground">
        Ainda não tem conta?{" "}
        <Link
          href={`/registro${redirectQS}`}
          className="font-medium text-foreground hover:text-primary"
        >
          Criar conta
        </Link>
      </p>
    </div>
  );
}

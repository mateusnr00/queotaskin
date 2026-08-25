import Link from "next/link";
import type { Metadata } from "next";

import { LoginForm } from "@/components/forms/login-form";

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

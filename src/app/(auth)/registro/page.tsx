import Link from "next/link";
import type { Metadata } from "next";

import { RegisterForm } from "@/components/forms/register-form";

export const metadata: Metadata = { title: "Criar conta" };

export default async function RegisterPage({
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
        <h2 className="text-2xl font-bold tracking-tight">Criar conta</h2>
        <p className="text-sm text-muted-foreground">
          Preencha seus dados pra começar. Pra entrar depois é só nome
          completo e celular.
        </p>
      </div>
      <RegisterForm />
      <p className="text-center text-sm text-muted-foreground">
        Já tem conta?{" "}
        <Link
          href={`/login${redirectQS}`}
          className="font-medium text-foreground hover:text-primary"
        >
          Entrar
        </Link>
      </p>
    </div>
  );
}

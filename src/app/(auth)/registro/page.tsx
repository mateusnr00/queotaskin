import Link from "next/link";
import { cookies } from "next/headers";
import type { Metadata } from "next";

import { RegisterForm } from "@/components/forms/register-form";
import { CartaoDeAuth } from "@/components/auth/cartao-de-auth";
import { COOKIE_DE_INDICACAO, normalizarCodigo } from "@/lib/afiliados";

export const metadata: Metadata = { title: "Criar conta" };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; ref?: string }>;
}) {
  const sp = await searchParams;
  const redirectQS = sp.redirect
    ? `?redirect=${encodeURIComponent(sp.redirect)}`
    : "";

  // O CÓDIGO DE QUEM INDICOU, DECIDIDO NO SERVIDOR.
  //
  // A URL primeiro, porque é o clique de agora. O cookie depois, porque é o
  // clique de dias atrás: quem entrou pelo link, olhou as campanhas e só
  // voltou para criar conta na semana seguinte tem o vínculo aqui, e sem
  // isto o campo apareceria vazio para ela. Os dois passam pela mesma
  // normalização, então o que a tela mostra é exatamente o que o cadastro
  // vai usar.
  const codigoTravado =
    normalizarCodigo(sp.ref ?? "") ||
    normalizarCodigo((await cookies()).get(COOKIE_DE_INDICACAO)?.value ?? "") ||
    null;

  return (
    <CartaoDeAuth>
      <div className="space-y-5">
        <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
          Você está quase lá!
        </p>

        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Crie sua conta
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            É rápido: três campos e você já pode escolher seus números.
          </p>
        </div>

        <RegisterForm codigoTravado={codigoTravado} />

        {/* Separador com rótulo no meio. As duas barras são irmãs do texto
            num flex, e não um pseudo-elemento por cima: assim o "ou" fica
            sempre centrado, com qualquer largura de cartão. */}
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">ou</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Já possui uma conta?{" "}
          <Link
            href={`/login${redirectQS}`}
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            Entrar
          </Link>
        </p>
      </div>
    </CartaoDeAuth>
  );
}

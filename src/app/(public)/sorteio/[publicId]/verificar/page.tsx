// A página de conferência do sorteio.
//
// Endereço próprio, e não uma aba dentro da transmissão, porque ela é o que se
// manda para quem duvidou: "abre esse link e confere você mesmo". Um link que
// abre já mostrando o resultado da conferência vale mais do que qualquer
// explicação nossa.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { idPublicoValido } from "@/lib/sorteio-ao-vivo";
import { carregarEstadoPublico } from "@/server/services/sorteio-ao-vivo";
import { ConferenciaDoSorteio } from "@/components/sorteio/conferencia";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ publicId: string }>;
}): Promise<Metadata> {
  const { publicId } = await params;
  return {
    title: idPublicoValido(publicId)
      ? `Conferir o sorteio ${publicId}`
      : "Conferir sorteio",
    description:
      "Refaça o sorteio no seu próprio navegador e confira o resultado.",
  };
}

export default async function PaginaDeConferencia({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  if (!idPublicoValido(publicId)) notFound();

  const estado = await carregarEstadoPublico(publicId);
  if (!estado) notFound();

  return (
    <div className="palco-do-sorteio">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-10">
        <Link
          href={`/sorteio/${publicId}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/60 transition-colors hover:text-white"
        >
          <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
          Voltar para o sorteio
        </Link>

        <header className="mt-4 space-y-2">
          <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold tracking-[0.14em] text-emerald-300 uppercase">
            Transparência
          </span>
          <h1 className="text-balance text-xl leading-tight font-extrabold tracking-tight text-white sm:text-2xl">
            Conferir o sorteio de {estado.campanha.titulo}
          </h1>
          <p className="text-sm leading-relaxed text-white/70">
            Você não precisa acreditar só no que a gente diz. Esta página refaz
            o sorteio inteiro no seu navegador, com os números publicados aqui,
            e mostra se o resultado bate.
          </p>
        </header>

        <div className="mt-5">
          <ConferenciaDoSorteio estado={estado} />
        </div>
      </div>
    </div>
  );
}

"use client";

// O chamado para a transmissão, na página da campanha.
//
// Existe porque havia um buraco de dez minutos: a campanha encerrava, a venda
// fechava, e a página não dizia o que ia acontecer nem quando. Quem entrava
// nesse intervalo via só uma campanha esgotada.
//
// É cliente por um motivo só: a contagem até o sorteio. O resto do bloco
// poderia ser servidor, mas um relógio renderizado no servidor congela no
// instante em que a página foi gerada.

import Link from "next/link";
import { Radio } from "lucide-react";
import { useEffect, useState } from "react";

import { formatarContagemCurta, segundosAte } from "@/lib/sorteio-ao-vivo";
import type { EstadoDoSorteio } from "@/lib/sorteio-ao-vivo";

export function SeloDeTransmissao({
  publicId,
  status,
  drawStartsAt,
  elegiveis,
}: {
  publicId: string;
  status: EstadoDoSorteio;
  drawStartsAt: string;
  elegiveis: number;
}) {
  const acabou = status === "FINISHED" || status === "ERROR";
  // Começa no instante da renderização no servidor e passa a andar assim que
  // o componente monta. O relógio do navegador basta AQUI, e só aqui: este
  // número é uma prévia para decidir se vale abrir a transmissão, e lá dentro
  // a contagem que vale é acertada com a do servidor.
  const [agora, setAgora] = useState<Date | null>(null);

  useEffect(() => {
    if (acabou) return;
    // A primeira leitura vai num temporizador de zero, e não no corpo do
    // efeito: mudar estado de forma síncrona ali dispara uma renderização em
    // cascata, e o compilador do React recusa com razão.
    const marcar = () => setAgora(new Date());
    const primeira = setTimeout(marcar, 0);
    const id = setInterval(marcar, 1000);
    return () => {
      clearTimeout(primeira);
      clearInterval(id);
    };
  }, [acabou]);

  const faltam = agora ? segundosAte(new Date(drawStartsAt), agora) : null;
  const aoVivo = status === "COUNTDOWN" || status === "DRAWING" || status === "REVEALING";

  return (
    <Link
      href={`/sorteio/${publicId}`}
      className="block rounded-2xl border border-white/10 bg-[#101317] p-4 transition-colors hover:border-white/20 sm:p-5"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-400 ring-1 ring-red-500/25">
          <Radio aria-hidden className="h-5 w-5" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] text-white/50 uppercase">
            {aoVivo && <span aria-hidden className="ponto-ao-vivo" />}
            {acabou ? "Sorteio realizado" : aoVivo ? "Ao vivo agora" : "Sorteio confirmado"}
          </p>
          <p className="mt-0.5 truncate text-sm font-bold text-white">
            {status === "FINISHED"
              ? "Ver o resultado e o certificado"
              : aoVivo
                ? "Assistir ao sorteio"
                  : faltam == null
                  ? "O sorteio começa em instantes"
                  : `O sorteio começa em ${formatarContagemCurta(faltam)}`}
          </p>
          {!acabou && (
            <p className="mt-0.5 truncate text-xs text-white/55">
              {elegiveis.toLocaleString("pt-BR")} títulos disputando
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

"use client";

// O comprovante do sorteio.
//
// É o bloco que responde "como sei que isso não foi combinado". Ele não prova
// nada sozinho, nenhum comprovante prova, mas registra em público o que
// permite conferir depois: quantos títulos disputaram, como o número foi
// escolhido, em que instante, e a impressão digital da lista que disputou.
//
// A impressão digital é o detalhe que importa. `snapshotHash` é o SHA-256 dos
// números elegíveis: se a lista tivesse sido mexida entre o encerramento e o
// sorteio, ela daria outro valor. Publicá-la junto do resultado é o que
// transforma "confie em nós" em algo que alguém pode checar.
//
// Aparece só depois da revelação. Antes disso ele estaria falando de um
// resultado que ninguém pode ver, e o hash seria pista sobre a lista.

import { ShieldCheck } from "lucide-react";

import type { EstadoPublicoDoSorteio } from "@/server/services/sorteio-ao-vivo";

function dataCompleta(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(iso));
}

export function CertificadoDoSorteio({
  estado,
}: {
  estado: EstadoPublicoDoSorteio;
}) {
  if (!estado.resultado || !estado.drawExecutedAt) return null;

  const linhas: { rotulo: string; valor: string; mono?: boolean }[] = [
    { rotulo: "Sorteio", valor: estado.publicId, mono: true },
    { rotulo: "Campanha", valor: estado.campanha.titulo },
    { rotulo: "Realizado em", valor: dataCompleta(estado.drawExecutedAt) },
    {
      rotulo: "Número sorteado",
      valor: String(estado.resultado.numero),
      mono: true,
    },
    {
      rotulo: "Títulos elegíveis",
      valor: estado.eligibleTicketCount.toLocaleString("pt-BR"),
    },
    { rotulo: "Método", valor: estado.rngMethod, mono: true },
    { rotulo: "Versão do sorteio", valor: String(estado.drawVersion) },
  ];

  return (
    <section className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck aria-hidden className="h-4 w-4 text-emerald-400" />
        <h2 className="text-[11px] font-bold tracking-[0.16em] text-white/60 uppercase">
          Certificado do sorteio
        </h2>
      </div>

      <dl className="mt-4 divide-y divide-white/5">
        {linhas.map((linha) => (
          <div
            key={linha.rotulo}
            className="flex items-baseline justify-between gap-4 py-2"
          >
            <dt className="shrink-0 text-xs text-white/55">{linha.rotulo}</dt>
            <dd
              className={
                linha.mono
                  ? "truncate font-mono text-xs font-semibold text-white/90"
                  : "truncate text-xs font-semibold text-white/90"
              }
            >
              {linha.valor}
            </dd>
          </div>
        ))}
      </dl>

      {estado.snapshotHash && (
        <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3">
          <p className="text-[10px] font-bold tracking-[0.12em] text-white/55 uppercase">
            Impressão digital dos títulos elegíveis (SHA-256)
          </p>
          {/* Quebra em qualquer caractere: são sessenta e quatro hexadecimais
              sem espaço nenhum, e sem isto eles esticariam a página inteira
              no celular. */}
          <p className="mt-1 font-mono text-[10px] leading-relaxed break-all text-white/55">
            {estado.snapshotHash}
          </p>
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-white/55">
        Resultado confirmado e definitivo. O número foi escolhido pelo servidor
        no instante acima, antes de qualquer animação, e não pode ser alterado.
      </p>
    </section>
  );
}

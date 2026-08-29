// A chave do sorteio, travada e visível enquanto as cotas são vendidas.
//
// Este bloco é a razão de o sorteio ser verificável, e ele precisa aparecer
// AQUI, na página onde a pessoa compra, não só no comprovante depois. O valor
// do compromisso está na ordem: o hash existe publicamente antes de existir
// uma lista de participantes, então quem opera o site não pode escolher a
// chave depois de ver quem ganharia.
//
// Publicar isso só no fim seria a mesma coisa que não publicar.
//
// Componente de servidor: é texto e um link, sem nada que dependa do relógio
// ou de clique.

import Link from "next/link";
import { ShieldCheck } from "lucide-react";

function dataCurta(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

export function SeloDeCompromisso({
  hash,
  desde,
  publicId,
}: {
  hash: string;
  desde: string;
  /** Quando o sorteio já existe, o selo vira link para a conferência. */
  publicId: string | null;
}) {
  const conteudo = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/20">
        <ShieldCheck aria-hidden className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
          Sorteio verificável
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          A chave deste sorteio foi travada em {dataCurta(desde)}, antes da
          primeira venda.{" "}
          {publicId
            ? "Confira o resultado você mesmo."
            : "No fim, ela é publicada e qualquer um refaz a conta."}
        </span>
        {/* O hash inteiro, e não um pedaço: um resumo cortado não serve para
            comparar com nada, e comparar é a única coisa que ele existe para
            permitir. */}
        <span className="mt-1 block font-mono text-[10px] leading-relaxed break-all text-muted-foreground/70">
          {hash}
        </span>
      </span>
    </>
  );

  if (publicId) {
    return (
      <Link
        href={`/sorteio/${publicId}/verificar`}
        className="flex items-start gap-3 rounded-2xl border bg-card p-4 transition-colors hover:border-emerald-500/40"
      >
        {conteudo}
      </Link>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-2xl border bg-card p-4">
      {conteudo}
    </div>
  );
}

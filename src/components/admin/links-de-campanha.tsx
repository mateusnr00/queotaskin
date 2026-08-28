"use client";

// Um link por canal de divulgação do sorteio, com o que cada um trouxe.
//
// A referência mostrava só "Views". Aqui vêm três números, porque visita
// sozinha engana: um canal com muita visita e nenhuma venda atrai a pessoa
// errada, e isso só aparece quando o dinheiro está ao lado do tráfego. A
// conversão fecha a conta, e é ela que diz onde vale investir.

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { linkDoCanal } from "@/lib/canais-de-campanha";
import { formatBRL } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface LinhaDeCanal {
  id: string;
  rotulo: string;
  visitas: number;
  vendas: number;
  valor: number;
}

export function LinksDeCampanha({
  base,
  slug,
  linhas,
}: {
  base: string;
  slug: string;
  linhas: LinhaDeCanal[];
}) {
  const [copiado, setCopiado] = useState<string | null>(null);

  async function copiar(canal: string, link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(canal);
      toast.success("Link copiado");
      setTimeout(() => setCopiado((c) => (c === canal ? null : c)), 2500);
    } catch {
      toast.error("Não foi possível copiar. Selecione o link");
    }
  }

  const totalVisitas = linhas.reduce((s, l) => s + l.visitas, 0);
  const totalVendas = linhas.reduce((s, l) => s + l.vendas, 0);

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3 md:px-5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {linhas.length} canais
        </p>
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground tabular-nums">
            {totalVisitas.toLocaleString("pt-BR")}
          </span>{" "}
          visita(s) ·{" "}
          <span className="font-semibold text-foreground tabular-nums">
            {totalVendas.toLocaleString("pt-BR")}
          </span>{" "}
          venda(s) por link de campanha
        </p>
      </div>

      <div className="divide-y">
        {linhas.map((linha) => {
          const link = linkDoCanal(base, slug, linha.id);
          const conversao =
            linha.visitas > 0
              ? Math.round((linha.vendas / linha.visitas) * 100)
              : null;
          return (
            <div
              key={linha.id}
              className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-muted/30 md:flex-row md:items-center md:gap-4 md:px-5"
            >
              <div className="min-w-0 md:w-52 md:shrink-0">
                <p className="truncate text-sm font-semibold">{linha.rotulo}</p>
                {/* Os três lado a lado: tráfego, dinheiro e a razão entre os
                    dois. Sem a conversão, dois canais com a mesma venda
                    parecem iguais mesmo quando um gastou dez vezes mais
                    tráfego para chegar lá. */}
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                  <span className="tabular-nums">
                    {linha.visitas.toLocaleString("pt-BR")} visita(s)
                  </span>
                  <span aria-hidden>·</span>
                  <span
                    className={cn(
                      "tabular-nums",
                      linha.vendas > 0 && "font-semibold text-emerald-500",
                    )}
                  >
                    {linha.vendas.toLocaleString("pt-BR")} venda(s)
                  </span>
                  {linha.valor > 0 && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="tabular-nums">
                        {formatBRL(linha.valor)}
                      </span>
                    </>
                  )}
                  {conversao !== null && linha.vendas > 0 && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="tabular-nums">{conversao}%</span>
                    </>
                  )}
                </p>
              </div>

              <p className="min-w-0 flex-1 select-all truncate rounded-lg border bg-muted/40 px-3 py-2 font-mono text-[11px] text-muted-foreground">
                {link}
              </p>

              <button
                type="button"
                onClick={() => copiar(linha.id, link)}
                aria-label={`Copiar o link de ${linha.rotulo}`}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-md border px-3 text-xs font-semibold transition-colors hover:bg-muted md:self-auto"
              >
                {copiado === linha.id ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copiado === linha.id ? "Copiado" : "Copiar"}
              </button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

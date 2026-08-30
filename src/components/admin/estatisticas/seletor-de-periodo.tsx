import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Seletor do período da seção de análise. É servidor puro: os presets são
// links que trocam a query, e o intervalo custom é um form GET — mesmo padrão
// da busca de /admin/relatorios, sobrevive ao recarregar e dá para compartilhar
// por URL. O teto de 180 dias é aplicado no servidor, ao ler a query.

const PRESETS = [7, 30, 90, 180] as const;

export function SeletorDePeriodo({
  diasAtivo,
  de,
  ate,
  base = "",
}: {
  /** Preset ativo (7/30/90/180) ou null quando o recorte é custom. */
  diasAtivo: number | null;
  de?: string;
  ate?: string;
  /** Prefixo de outros params a preservar (ex.: "raffleId=x&"). */
  base?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex gap-1">
        {PRESETS.map((d) => (
          <Link
            key={d}
            href={`?${base}dias=${d}`}
            className={cn(
              buttonVariants({
                variant: diasAtivo === d ? "default" : "outline",
                size: "sm",
              }),
            )}
          >
            {d}d
          </Link>
        ))}
      </div>
      <form method="GET" className="flex items-end gap-1.5">
        <label className="flex flex-col gap-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          De
          <input
            type="date"
            name="de"
            defaultValue={de}
            className="h-8 rounded-md border bg-background px-2 text-xs text-foreground"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          Até
          <input
            type="date"
            name="ate"
            defaultValue={ate}
            className="h-8 rounded-md border bg-background px-2 text-xs text-foreground"
          />
        </label>
        <button className={buttonVariants({ variant: "outline", size: "sm" })}>
          Aplicar
        </button>
      </form>
    </div>
  );
}

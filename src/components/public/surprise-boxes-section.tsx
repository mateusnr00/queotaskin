"use client";

// Caixas surpresas na página da campanha.
//
// Existia só o componente de ABRIR a caixa, no comprovante de quem comprou.
// Quem estava decidindo se compra não via nada: cadastrar cinquenta prêmios
// no painel não mudava uma linha da página pública. E é justamente essa
// lista que sustenta a decisão, porque ela mostra o que já saiu e para quem.
//
// Segue o mesmo desenho de Títulos Premiados: contador de sorteados sobre o
// total, lista com "mostrar mais", e a linha ganha destaque quando o prêmio
// já tem dono.

import { useState } from "react";
import { ChevronDown, Trophy } from "lucide-react";

import { CaixaSurpresaArte } from "@/components/public/caixa-surpresa-arte";
import { cn } from "@/lib/utils";

const VISIVEIS_FECHADO = 5;

export interface CaixaPublica {
  /** O que sai para o ganhador. */
  premio: string;
  /** Nome de quem levou, quando já foi aberta. */
  ganhador: string | null;
}

export function SurpriseBoxesSection({ caixas }: { caixas: CaixaPublica[] }) {
  const [aberto, setAberto] = useState(false);
  if (caixas.length === 0) return null;

  const sorteados = caixas.filter((c) => c.ganhador).length;
  const visiveis =
    aberto || caixas.length <= VISIVEIS_FECHADO
      ? caixas
      : caixas.slice(0, VISIVEIS_FECHADO);
  const daParaFechar = caixas.length > VISIVEIS_FECHADO;

  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4 md:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold">
          {/* Mesma arte do contador dos degraus, e não o presente genérico:
              são a mesma caixa, e desenho diferente para a mesma coisa faz
              parecer que são duas. */}
          <CaixaSurpresaArte tamanho={28} />
          Caixas surpresas
          <span className="text-xs font-normal text-muted-foreground">
            ganhadores
          </span>
        </h2>
        {/* Sorteados sobre o total: "12/500" diz de relance quanto ainda há
            em jogo, que é o que interessa a quem está decidindo comprar. */}
        <span className="shrink-0 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs font-bold tabular-nums text-primary">
          {sorteados}
          <span className="text-[10px] font-normal opacity-70">
            /{caixas.length}
          </span>
        </span>
      </div>

      <ul className="space-y-2">
        {visiveis.map((c, i) => {
          const temDono = Boolean(c.ganhador);
          return (
            <li
              key={i}
              className={cn(
                "flex items-center gap-2.5 rounded-lg border px-2.5 py-2",
                temDono
                  ? "border-emerald-500/50 bg-emerald-500/15"
                  : "border-transparent bg-muted/30"
              )}
            >
              {/* O prêmio em pílula, como na referência: separa o item do
                  estado e mantém a coluna da direita alinhada mesmo com nome
                  comprido. */}
              <span
                className={cn(
                  "min-w-0 flex-1 truncate rounded-full border px-2.5 py-1 text-xs font-bold",
                  temDono
                    ? "border-emerald-500/40 bg-background/70"
                    : "border-border bg-background/60"
                )}
              >
                {c.premio}
              </span>
              {temDono ? (
                <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <span className="max-w-28 truncate">{c.ganhador}</span>
                  <Trophy className="h-3.5 w-3.5" />
                </span>
              ) : (
                <span className="shrink-0 text-xs text-muted-foreground">
                  disponível
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {daParaFechar && (
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="flex w-full items-center justify-center gap-1 text-xs font-semibold text-primary transition-colors hover:text-primary/80"
        >
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform", aberto && "rotate-180")}
          />
          {aberto ? "Mostrar menos" : `Mostrar mais (${caixas.length - VISIVEIS_FECHADO})`}
        </button>
      )}
    </section>
  );
}

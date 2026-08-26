"use client";

import { useMemo } from "react";

import { cn } from "@/lib/utils";

interface NumberGridProps {
  totalNumbers: number;
  takenNumbers: number[];
  selected: number[];
  onChange: (selected: number[]) => void;
  maxSelectable?: number;
}

// Grade responsiva: 5 colunas no mobile, 10 colunas no desktop.
// Sem toggle manual, o layout se adapta sozinho ao tamanho da tela.
export function NumberGrid({
  totalNumbers,
  takenNumbers,
  selected,
  onChange,
  maxSelectable,
}: NumberGridProps) {
  const takenSet = useMemo(() => new Set(takenNumbers), [takenNumbers]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const padTo = useMemo(() => String(totalNumbers).length, [totalNumbers]);

  if (totalNumbers > 500) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Rifa com {totalNumbers.toLocaleString("pt-BR")} números. Muito grande para grade visual.
      </div>
    );
  }

  function toggle(n: number) {
    if (takenSet.has(n)) return;
    if (selectedSet.has(n)) {
      onChange(selected.filter((x) => x !== n));
      return;
    }
    if (maxSelectable && selected.length >= maxSelectable) return;
    onChange([...selected, n].sort((a, b) => a - b));
  }

  const numbers = Array.from({ length: totalNumbers }, (_, i) => i + 1);

  return (
    <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
      {numbers.map((n) => {
        const taken = takenSet.has(n);
        const isSelected = selectedSet.has(n);
        const atLimit =
          !isSelected &&
          !taken &&
          maxSelectable !== undefined &&
          selected.length >= maxSelectable;

        return (
          <button
            key={n}
            type="button"
            onClick={() => toggle(n)}
            disabled={taken || atLimit}
            aria-label={`Número ${n}`}
            aria-pressed={isSelected}
            className={cn(
              "aspect-square rounded-md text-xs font-semibold tabular-nums transition-all",
              "min-h-[36px] flex items-center justify-center",
              "border",
              taken &&
                "bg-muted/60 text-muted-foreground/30 line-through cursor-not-allowed border-transparent",
              !taken &&
                !isSelected &&
                "bg-background hover:bg-accent hover:border-foreground/30 cursor-pointer border-border",
              isSelected &&
                "bg-foreground text-background border-foreground shadow-sm scale-105",
              atLimit && "opacity-40 cursor-not-allowed"
            )}
          >
            {String(n).padStart(padTo, "0")}
          </button>
        );
      })}
    </div>
  );
}

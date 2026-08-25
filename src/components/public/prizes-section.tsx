"use client";

// Seção pública "Prêmios". Renderiza só um botão full-width; clique abre
// um Dialog com a lista ordenada (1º, 2º, …). Igual ao padrão do
// SkinsLendarias — economiza espaço acima do form de reserva.
//
// Quando o prêmio traz metadados de skin de CS2, o item da lista vira um
// SkinCard completo (moldura na cor da raridade, float, StatTrak, valor).

import { Trophy } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SkinCard, type SkinPrize } from "@/components/cs2/skin-card";
import { buttonVariants } from "@/components/ui/button";
import { hasSkinData } from "@/lib/cs2";
import { cn } from "@/lib/utils";

interface Props {
  prizes: SkinPrize[];
}

export function PrizesSection({ prizes }: Props) {
  if (prizes.length === 0) return null;

  const anySkin = prizes.some(hasSkinData);

  return (
    <Dialog>
      <DialogTrigger
        className={cn(
          buttonVariants({ size: "sm" }),
          "w-full h-11 font-semibold"
        )}
      >
        <Trophy className="mr-2 h-4 w-4" />
        {anySkin ? "Ver as skins premiadas" : "Prêmios"}
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="inline-flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            {anySkin ? "Skins premiadas" : "Prêmios"}
          </DialogTitle>
        </DialogHeader>
        <ol className="space-y-2">
          {prizes.map((prize, idx) =>
            hasSkinData(prize) ? (
              <li key={idx}>
                <SkinCard prize={prize} />
              </li>
            ) : (
              <li
                key={idx}
                className="flex items-start gap-3 rounded-lg border bg-muted/30 px-3 py-2"
              >
                <span className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-extrabold text-primary tabular-nums">
                  {prize.position}º
                </span>
                <span className="text-sm leading-snug pt-0.5">
                  {prize.description}
                </span>
              </li>
            )
          )}
        </ol>
      </DialogContent>
    </Dialog>
  );
}

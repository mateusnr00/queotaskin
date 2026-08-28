// O selo de campanha exclusiva, no card da listagem.
//
// Sem ele, a campanha exclusiva só se revelava depois do clique. Quem estava
// navegando não tinha como saber que existe coisa reservada para rank mais
// alto, e é justamente essa visão que faz alguém querer subir: o que não
// aparece na vitrine não vira meta.
//
// Vale para a campanha que a pessoa ainda não alcançou e também para a que
// ela já pode entrar. É por isso que ele não tenta dizer "liberado" ou
// "bloqueado": a listagem é servida igual para todo mundo e não sabe quem
// está olhando. Quem trata os dois estados é a página da campanha, com o
// portão e com o selo de liberado.

import { Lock } from "lucide-react";

import { degrauDoRank } from "@/lib/rank";
import { cn } from "@/lib/utils";

export function SeloDeExclusiva({
  minLevel,
  className,
}: {
  minLevel: number | null;
  className?: string;
}) {
  const degrau = degrauDoRank(minLevel);
  if (!degrau) return null;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        className,
      )}
      style={{
        color: degrau.color,
        borderColor: `${degrau.color}59`,
        backgroundColor: `${degrau.color}1f`,
      }}
    >
      <Lock aria-hidden className="h-3 w-3 shrink-0" />
      {degrau.label}
    </span>
  );
}

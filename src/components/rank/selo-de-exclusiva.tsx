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

import { RankBadge } from "@/components/rank/rank-badge";
import { degrauDoRank, rankFromXp } from "@/lib/rank";
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
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-[10px] font-bold uppercase tracking-wider",
        className,
      )}
      style={{
        color: degrau.color,
        borderColor: `${degrau.color}59`,
        backgroundColor: `${degrau.color}1f`,
      }}
    >
      {/* O selo do nível no lugar do cadeado: falar de nível sem mostrar o
          desenho dele desperdiça a única coisa que a pessoa reconhece de
          longe, e o cadeado só dizia "fechado", que é o que menos importa
          aqui. */}
      <RankBadge rank={rankFromXp(degrau.xp)} size="xs" />
      {/* Rótulo fixo "LEVEL" (o `uppercase` do selo cuida da caixa), em vez do
          nome do degrau ("Prata III", "Ouro"...): o número do nível já está no
          desenho do selo ao lado, então o conjunto lê "[N] LEVEL", igual em
          toda campanha. Sem o nome do tier, o selo também para de variar de
          largura entre um card e outro. */}
      <span className="truncate">Level</span>
    </span>
  );
}

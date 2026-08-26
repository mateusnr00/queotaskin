import Link from "next/link";

import { RankBadge, RankMeter } from "@/components/rank/rank-badge";
import { rankProgress } from "@/lib/rank";

/**
 * Chip compacto do rank para o header: selo, nome, patente e a barra até o
 * próximo degrau numa linha só. É a leitura de relance, o detalhe fica em
 * /minha-conta, para onde ele leva.
 */
export function RankChip({
  name,
  xp,
  xpPerBrl,
}: {
  name: string;
  xp: number;
  xpPerBrl: number;
}) {
  const progress = rankProgress(xp, xpPerBrl);
  const { rank } = progress;

  return (
    <Link
      href="/minha-conta"
      title={`${rank.label} · ${xp.toLocaleString("pt-BR")} XP`}
      className="group relative flex items-center gap-2.5 overflow-hidden rounded-r-md border border-l-0 border-[#232730] bg-[#141619] py-1.5 pr-3 pl-2.5 transition-colors hover:bg-[#181b1f]"
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[2px]"
        style={{ backgroundColor: rank.color }}
      />

      <RankBadge rank={rank} size="sm" className="relative" />

      <span className="relative flex min-w-0 flex-col gap-1">
        <span className="flex items-baseline gap-1.5">
          <span className="max-w-20 truncate text-xs leading-none font-semibold">
            {name}
          </span>
          <span
            className="font-mono text-[10px] leading-none font-bold tracking-[0.06em] whitespace-nowrap"
            style={{ color: rank.color }}
          >
            {/* No prestígio o numeral romano sozinho não diz nada fora de
                contexto, o nome da patente comunica melhor. */}
            {rank.prestige ? rank.prestige.label.toUpperCase() : `NV.${rank.numeral}`}
          </span>
        </span>

        <RankMeter
          percent={progress.percent}
          color={rank.color}
          height={3}
          className="w-full min-w-24"
          label={progress.nextLabel ?? "Patente máxima"}
        />
      </span>
    </Link>
  );
}

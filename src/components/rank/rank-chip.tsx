"use client";

import Link from "next/link";
import { useId } from "react";

import { RankBadge, RankMeter } from "@/components/rank/rank-badge";
import { ModBadge } from "@/components/rank/mod-badge";
import { rankProgress } from "@/lib/rank";

/**
 * Verde-água do selo de moderador.
 *
 * Fica fora da faixa das raridades, que vai do roxo ao vermelho, para que a
 * faixa e o texto do chip digam junto com o selo que aquilo é cargo e não
 * degrau comprado.
 */
const COR_DO_MOD = "#29DFA9";

/**
 * Chip compacto do rank para o header: selo, nome, patente e a barra até o
 * próximo degrau numa linha só. É a leitura de relance, o detalhe fica em
 * /minha-conta, para onde ele leva.
 */
export function RankChip({
  name,
  xp,
  xpPerBrl,
  compact = false,
  mod = false,
}: {
  name: string;
  xp: number;
  xpPerBrl: number;
  /**
   * Troca o selo de nível pelo de moderador.
   *
   * Substitui em vez de somar: dois selos lado a lado no cabeçalho do
   * celular não cabem, e o cargo é o que identifica a pessoa ali. O nível
   * continua inteiro em /minha-conta, para onde o chip leva.
   */
  mod?: boolean;
  /**
   * Versão para o cabeçalho do celular: só selo e nível.
   *
   * Ali o espaço entre a logo e o menu não comporta nome e barra de
   * progresso, e sem essa variante o rank simplesmente não apareceria no
   * aparelho de onde vem a maior parte do tráfego.
   */
  compact?: boolean;
}) {
  // Cada chip precisa dos próprios IDs de gradiente: o SVG resolve url(#id)
  // pelo documento inteiro, e o cabeçalho renderiza a versão de celular e a
  // de desktop na mesma página.
  const uid = useId().replace(/:/g, "");
  const progress = rankProgress(xp, xpPerBrl);
  const { rank } = progress;
  const patente = mod
    ? "MOD"
    : rank.prestige
      ? rank.prestige.label.toUpperCase()
      : `NV.${rank.numeral}`;
  // Verde-água do selo de moderador, para a faixa e o texto acompanharem o
  // selo em vez de continuarem na cor do nível.
  const cor = mod ? COR_DO_MOD : rank.color;

  if (compact) {
    return (
      <Link
        href="/minha-conta"
        title={`${rank.label} · ${xp.toLocaleString("pt-BR")} XP`}
        aria-label={`Seu rank: ${rank.label}`}
        className="relative flex items-center gap-2 overflow-hidden rounded-lg border border-[#232730] bg-[#141619] py-1.5 pr-2.5 pl-2 transition-colors active:bg-[#181b1f]"
      >
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[2px]"
          style={{ backgroundColor: cor }}
        />

        {mod ? (
          <ModBadge size={26} uid={uid} className="relative" />
        ) : (
          <RankBadge rank={rank} size="sm" className="relative" />
        )}

        <span className="relative flex flex-col gap-1">
          <span
            className="font-mono text-[10px] leading-none font-bold tracking-[0.06em] whitespace-nowrap"
            style={{ color: cor }}
          >
            {patente}
          </span>
          {/* Quanto falta em XP não vai escrito: a barra já diz o quanto
              falta, e o número exigiria espaço que o cabeçalho do celular
              não tem. O texto do label serve a leitor de tela, não à tela. */}
          <RankMeter
            percent={progress.percent}
            color={cor}
            height={3}
            className="w-20"
            label={progress.nextLabel ?? "Patente máxima"}
          />
        </span>
      </Link>
    );
  }

  return (
    <Link
      href="/minha-conta"
      title={`${rank.label} · ${xp.toLocaleString("pt-BR")} XP`}
      className="group relative flex items-center gap-2.5 overflow-hidden rounded-r-md border border-l-0 border-[#232730] bg-[#141619] py-1.5 pr-3 pl-2.5 transition-colors hover:bg-[#181b1f]"
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[2px]"
        style={{ backgroundColor: cor }}
      />

      {mod ? (
          <ModBadge size={26} uid={uid} className="relative" />
        ) : (
          <RankBadge rank={rank} size="sm" className="relative" />
        )}

      <span className="relative flex min-w-0 flex-col gap-1">
        <span className="flex items-baseline gap-1.5">
          <span className="max-w-20 truncate text-xs leading-none font-semibold">
            {name}
          </span>
          <span
            className="font-mono text-[10px] leading-none font-bold tracking-[0.06em] whitespace-nowrap"
            style={{ color: cor }}
          >
            {patente}
          </span>
        </span>

        <RankMeter
          percent={progress.percent}
          color={cor}
          height={3}
          className="w-full min-w-24"
          label={progress.nextLabel ?? "Patente máxima"}
        />
      </span>
    </Link>
  );
}

// Quanto a conta andou com esta compra, mostrado no comprovante pago.
//
// Existe porque o XP era invisível no momento em que ele acontece. A pessoa
// pagava, ganhava XP e só descobriria isso se fosse até "Minha conta" por
// conta própria. Mostrar aqui fecha o ciclo no único instante em que ela
// está olhando e sabe que acabou de fazer algo.
//
// Componente de servidor: não tem estado nem interação, e o cálculo todo já
// vem pronto de quem renderiza.

import { Sparkles, TrendingUp } from "lucide-react";

import { RankBadge, RankMeter } from "@/components/rank/rank-badge";
import { rankProgress } from "@/lib/rank";

export function XpGanho({
  ganho,
  total,
  xpPerBrl,
}: {
  /** XP creditado por esta compra. */
  ganho: number;
  /** XP acumulado depois dela. */
  total: number;
  xpPerBrl: number;
}) {
  // Nada creditado, nada a dizer. Acontece em sorteio gratuito e quando o
  // rank está desligado no painel, e um "+0 XP" ali seria pior do que a
  // ausência do bloco: parece defeito.
  if (ganho <= 0) return null;

  const depois = rankProgress(total, xpPerBrl);
  const antes = rankProgress(Math.max(0, total - ganho), xpPerBrl);

  // O rótulo é o que a pessoa lê na tela, e comparar por ele cobre os dois
  // tipos de degrau numa checagem só: "Prata Elite" vira "Ouro I", e "Lenda
  // Global" vira "MVP".
  const subiu = antes.rank.label !== depois.rank.label;

  return (
    <div className="rounded-2xl border bg-card p-4 md:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">
            {subiu ? "Você subiu de patente" : "Sua conta avançou"}
          </span>
        </div>
        <span className="text-lg font-extrabold tabular-nums text-primary">
          +{ganho.toLocaleString("pt-BR")} XP
        </span>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <RankBadge rank={depois.rank} size="md" className="shrink-0" />

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span
              className="truncate text-sm font-bold"
              style={{ color: depois.rank.color }}
            >
              {depois.rank.label}
            </span>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {total.toLocaleString("pt-BR")} XP
            </span>
          </div>

          <RankMeter
            percent={depois.percent}
            color={depois.rank.color}
            label={depois.nextLabel ?? "Patente máxima"}
          />

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {depois.atMax ? (
              "Você está na patente máxima."
            ) : (
              <>
                Faltam{" "}
                <strong className="text-foreground tabular-nums">
                  {depois.xpToNext.toLocaleString("pt-BR")} XP
                </strong>{" "}
                para {depois.nextLabel}.
              </>
            )}
          </p>
        </div>
      </div>

      {subiu && (
        <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
          <TrendingUp className="h-3.5 w-3.5 shrink-0" />
          De {antes.rank.label} para {depois.rank.label} com esta compra.
        </p>
      )}
    </div>
  );
}

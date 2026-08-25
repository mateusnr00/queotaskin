import { Lock, Trophy } from "lucide-react";

import { RankBadge } from "@/components/rank/rank-badge";
import { rankFromXp, rankProgress, xpForLevel } from "@/lib/rank";

/**
 * Aviso de campanha exclusiva por nível.
 *
 * Esconder o formulário é só apresentação — quem decide é a guarda no
 * servidor, em createReservationAction. Aqui o objetivo é o oposto de
 * esconder: mostrar exatamente quanto falta, para virar motivação.
 */
export function MinLevelGate({
  minLevel,
  xp,
  xpPerBrl,
  isLoggedIn,
}: {
  minLevel: number;
  xp: number;
  xpPerBrl: number;
  isLoggedIn: boolean;
}) {
  const rank = rankFromXp(xp);
  const xpNeeded = Math.max(0, xpForLevel(minLevel) - xp);
  const brlNeeded = Math.ceil(xpNeeded / (xpPerBrl > 0 ? xpPerBrl : 10));
  const progress = rankProgress(xp, xpPerBrl);

  return (
    <div className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
      <div className="flex items-start gap-3">
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
        <div className="min-w-0">
          <h2 className="font-bold text-amber-700 dark:text-amber-300">
            Campanha exclusiva — nível {minLevel} ou acima
          </h2>
          <p className="text-sm text-amber-700/80 dark:text-amber-300/80">
            {isLoggedIn ? (
              <>
                Você está no <strong>{rank.label.toLowerCase()}</strong>. Faltam{" "}
                <strong>{xpNeeded.toLocaleString("pt-BR")} XP</strong> — cerca de{" "}
                <strong>R$ {brlNeeded.toLocaleString("pt-BR")}</strong> em outras
                campanhas para liberar esta.
              </>
            ) : (
              <>
                Entre na sua conta para ver o seu nível. O XP vem das compras
                pagas: cada R$ 1 vale {xpPerBrl} XP.
              </>
            )}
          </p>
        </div>
      </div>

      {isLoggedIn && (
        <div className="flex items-center gap-3 border-t border-amber-500/25 pt-3">
          <RankBadge rank={rank} size="md" showLabel={false} />
          <div
            className="h-2 flex-1 overflow-hidden rounded-full bg-amber-500/20"
            role="progressbar"
            aria-valuenow={progress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Progresso até o nível ${minLevel}`}
          >
            <div
              className="h-full rounded-full bg-amber-500"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <Trophy className="h-4 w-4 shrink-0 text-amber-500" />
          <span className="shrink-0 text-xs font-bold text-amber-700 tabular-nums dark:text-amber-300">
            {minLevel}
          </span>
        </div>
      )}
    </div>
  );
}

import { Lock } from "lucide-react";

import { RankBadge, RankMeter } from "@/components/rank/rank-badge";
import { rankFromXp, tierForLevel, xpForLevel } from "@/lib/rank";

/**
 * Aviso de campanha exclusiva por nível.
 *
 * Esconder o formulário é apresentação — quem autoriza é a guarda no
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
  const target = tierForLevel(minLevel);
  const required = xpForLevel(minLevel);
  const xpNeeded = Math.max(0, required - xp);
  const brlNeeded = Math.ceil(xpNeeded / (xpPerBrl > 0 ? xpPerBrl : 10));
  const percent = required > 0 ? Math.min(100, (xp / required) * 100) : 0;

  return (
    <div className="relative overflow-hidden rounded-r-md border border-l-0 border-[#232730] bg-[#141619] p-4">
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[2px]"
        style={{ backgroundColor: target.color }}
      />

      <div className="flex items-start gap-3">
        <Lock className="mt-0.5 h-4 w-4 shrink-0" style={{ color: target.color }} />
        <div className="min-w-0">
          <h2 className="text-sm font-bold">
            Exclusiva — nível {minLevel} ou acima
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {isLoggedIn ? (
              <>
                Você está no <b className="font-semibold text-foreground">{rank.label}</b>.
                Faltam{" "}
                <b className="font-semibold text-foreground">
                  {xpNeeded.toLocaleString("pt-BR")} XP
                </b>{" "}
                — cerca de{" "}
                <b className="font-semibold text-foreground">
                  R$ {brlNeeded.toLocaleString("pt-BR")}
                </b>{" "}
                em outras campanhas.
              </>
            ) : (
              <>
                Entre para ver o seu nível. Cada R$ 1 em números pagos vale{" "}
                {xpPerBrl} XP.
              </>
            )}
          </p>
        </div>
      </div>

      {isLoggedIn && (
        <div className="mt-4 flex items-center gap-3 border-t border-[#232730] pt-3">
          <RankBadge rank={rank} size="sm" />
          <RankMeter
            percent={percent}
            color={target.color}
            className="flex-1"
            label={`Progresso até o nível ${minLevel}`}
          />
          <RankBadge
            xp={required}
            size="sm"
            variant="outline"
            className="opacity-60"
          />
        </div>
      )}
    </div>
  );
}

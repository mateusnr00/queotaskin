// O portão da campanha exclusiva, para quem ainda não alcançou o rank.
//
// A versão anterior começava pelo cadeado e pela conta: "Exclusiva: nível 5 ou
// acima. Você está no Nível 0. Faltam 11.920 XP, cerca de R$ 1.192 em outras
// campanhas."
//
// Dois problemas nisso, e o segundo é o grave.
//
// O REAL EM TELA VIRAVA PREÇO
//
// "cerca de R$ 1.192" lia como etiqueta: pague isto para entrar. Uma campanha
// que é um presente para quem já comprou passava a parecer a coisa mais cara
// da página, e o número é grande justamente para quem está no começo, ou seja,
// aparece maior para quem menos deveria se assustar. O XP que falta continua,
// porque mede progresso; o dinheiro saiu, porque mede preço.
//
// A OFERTA VINHA DEPOIS DA RECUSA
//
// A primeira coisa dita era o que a pessoa não pode fazer. Quem chega numa
// campanha gratuita exclusiva precisa entender, antes de tudo, que existe
// sorteio que não custa nada para quem sobe de nível. Agora a manchete é a
// oferta, e o selo do nível alvo é o maior elemento do bloco: o rank deixa de
// ser palavra escrita e vira a imagem da coisa que se quer alcançar.

import { Sparkles } from "lucide-react";

import { RankBadge, RankMeter } from "@/components/rank/rank-badge";
import { degrauDoRank, rankFromXp } from "@/lib/rank";

export function MinLevelGate({
  minLevel,
  xp,
  isLoggedIn,
  gratuita,
  jaGarantiram,
}: {
  minLevel: number;
  xp: number;
  isLoggedIn: boolean;
  /** Muda a manchete: presente para quem subiu, ou porta fechada. */
  gratuita: boolean;
  /** Quantos já entraram. Prova de que a campanha está andando sem você. */
  jaGarantiram: number;
}) {
  const rank = rankFromXp(xp);
  const alvo = degrauDoRank(minLevel);
  if (!alvo) return null;

  const faltamXp = Math.max(0, alvo.xp - xp);
  const percent = alvo.xp > 0 ? Math.min(100, (xp / alvo.xp) * 100) : 0;

  return (
    <div className="relative overflow-hidden rounded-xl border p-5 text-center">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(120% 80% at 50% 0%, ${alvo.color}26, transparent 70%)`,
        }}
      />

      <div className="relative">
        {/* O selo do nível alvo, grande. É o objeto de desejo do bloco, e
            antes aparecia com 26px no rodapé, do tamanho de um ícone. */}
        <span className="selo-alvo relative inline-flex">
          <RankBadge rank={rankFromXp(alvo.xp)} size="xl" />
        </span>

        <p
          className="mt-3 text-[11px] font-bold uppercase tracking-[0.18em]"
          style={{ color: alvo.color }}
        >
          {gratuita ? "Grátis a partir do" : "Exclusiva a partir do"}
        </p>
        <h2 className="text-2xl font-extrabold leading-tight">{alvo.label}</h2>

        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
          {gratuita ? (
            <>
              Esta campanha{" "}
              <b className="font-semibold text-foreground">não custa nada</b>{" "}
              para quem já chegou no {alvo.label}. É a recompensa de quem
              comprou nas outras.
            </>
          ) : (
            <>
              Reservada para quem já chegou no {alvo.label}. Continue comprando
              nas outras campanhas para liberar.
            </>
          )}
        </p>

        {/* A prova de que está andando. Só entra com número de verdade: fila
            vazia anunciada como fila é o tipo de urgência que a pessoa
            desmente na primeira olhada. */}
        {jaGarantiram > 0 && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles aria-hidden className="h-3.5 w-3.5 shrink-0" />
            {jaGarantiram.toLocaleString("pt-BR")}{" "}
            {jaGarantiram === 1 ? "já garantiu" : "já garantiram"} sem pagar
          </p>
        )}

        {isLoggedIn ? (
          <div className="mt-5 border-t pt-4">
            <div className="flex items-center gap-3">
              <RankBadge rank={rank} size="md" />
              <RankMeter
                percent={percent}
                color={alvo.color}
                height={8}
                className="rank-meter-cresce flex-1"
                label={`Progresso até ${alvo.label}`}
              />
              {/* Apagado: é o degrau que ainda não é dela. */}
              <RankBadge rank={rankFromXp(alvo.xp)} size="md" muted />
            </div>
            <p className="mt-2.5 text-xs text-muted-foreground">
              Você está no{" "}
              <b className="font-semibold text-foreground">{rank.label}</b>.
              Faltam{" "}
              {/* Só o XP. O valor em reais saiu daqui: virava etiqueta de
                  preço numa campanha que é presente. */}
              <b className="font-semibold text-foreground">
                {faltamXp.toLocaleString("pt-BR")} XP
              </b>
              .
            </p>
          </div>
        ) : (
          <p className="mt-5 border-t pt-4 text-xs text-muted-foreground">
            Entre na sua conta para ver quanto falta para o seu rank.
          </p>
        )}
      </div>
    </div>
  );
}

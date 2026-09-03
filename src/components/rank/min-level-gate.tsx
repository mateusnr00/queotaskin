// O portão da campanha exclusiva, para quem ainda não alcançou o rank.
//
// SEM CARTÃO DENTRO DE CARTÃO.
//
// Este bloco já é renderizado dentro do cartão da caixa de compra, e mesmo
// assim desenhava a própria borda, o próprio arredondamento e o próprio
// padding: duas molduras concêntricas em volta do mesmo conteúdo, e a de
// dentro sem função nenhuma além de empurrar tudo para baixo. Agora ele
// devolve só o conteúdo, e a moldura é a que a página já tem.
//
// A ALTURA ERA O PROBLEMA, E ELA VINHA DE UM SELO DE 92 PIXELS.
//
// O selo do nível alvo ocupava um terço do bloco, centralizado, com o texto
// embaixo. Num telefone isso empurrava o botão de participar para fora da
// tela: o portão explicava a espera ocupando o lugar da ação. O selo continua
// sendo a imagem do degrau, em 38 pixels, ao lado do texto em vez de acima
// dele, e a linha horizontal aproveita a largura que sobrava dos dois lados.
//
// O REAL EM TELA VIRAVA PREÇO
//
// Antes dizia "faltam 11.920 XP, cerca de R$ 1.192". O real lia como etiqueta:
// pague isto para entrar. Uma campanha que é presente para quem já comprou
// passava a ser a coisa mais cara da página, e o número é maior justamente
// para quem está começando. O XP ficou, porque mede progresso; o dinheiro
// saiu, porque mede preço. É por isso que este componente não converte nada
// e não precisa de régua de XP.

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
    <div className="space-y-3">
      {/* O cabeçalho na horizontal: selo, rótulo e degrau numa fileira só.
          Empilhado, os três gastavam três alturas de linha e um espaço morto
          de cada lado do selo centralizado. */}
      <div className="flex items-center gap-3">
        <RankBadge rank={rankFromXp(alvo.xp)} size="md" />
        <div className="min-w-0 flex-1">
          <p
            className="text-[10px] leading-none font-bold tracking-[0.16em] uppercase"
            style={{ color: alvo.color }}
          >
            {gratuita ? "Grátis a partir do" : "Exclusiva a partir do"}
          </p>
          <h2 className="mt-1 truncate text-lg leading-tight font-extrabold">
            {alvo.label}
          </h2>
        </div>

        {/* A prova de que está andando, encaixada no espaço que sobra à
            direita do título em vez de virar mais uma linha. Só entra com
            número de verdade: fila vazia anunciada como fila é o tipo de
            urgência que a pessoa desmente na primeira olhada. */}
        {jaGarantiram > 0 && (
          <p className="hidden shrink-0 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary sm:inline-flex">
            <Sparkles aria-hidden className="h-3 w-3 shrink-0" />
            {jaGarantiram.toLocaleString("pt-BR")} sem pagar
          </p>
        )}
      </div>

      {/* Uma frase, e curta. A anterior repetia "não custa nada" logo abaixo
          da faixa GRÁTIS, que diz isso em corpo 24. */}
      <p className="text-xs leading-relaxed text-muted-foreground">
        {gratuita
          ? `Disponível gratuitamente para quem já alcançou o ${alvo.label}.`
          : `Reservada para quem já alcançou o ${alvo.label}.`}
      </p>

      {isLoggedIn ? (
        // Sem divisor: o espaçamento já separa, e a linha horizontal era mais
        // uma régua atravessando um bloco de 400 pixels de altura.
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <RankBadge rank={rank} size="sm" />
            <RankMeter
              percent={percent}
              color={alvo.color}
              height={6}
              className="rank-meter-cresce flex-1"
              label={`Progresso até ${alvo.label}`}
            />
            {/* Apagado: é o degrau que ainda não é dela. */}
            <RankBadge rank={rankFromXp(alvo.xp)} size="sm" muted />
          </div>
          <p className="text-xs text-muted-foreground">
            Você está no{" "}
            <b className="font-semibold text-foreground">{rank.label}</b> ·
            faltam{" "}
            <b className="font-semibold text-foreground">
              {faltamXp.toLocaleString("pt-BR")} XP
            </b>
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Entre na sua conta para ver quanto falta para o seu rank.
        </p>
      )}
    </div>
  );
}

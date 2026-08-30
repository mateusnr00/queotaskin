import { Medal } from "lucide-react";

import { Moldura } from "@/components/ui/moldura";
import { RankBadge, RankMeter } from "@/components/rank/rank-badge";
import {
  MAX_LEVEL,
  PRESTIGE_RANKS,
  nomeDoNivel,
  TIERS,
  rankFromXp,
  rankProgress,
  xpForLevel,
} from "@/lib/rank";

/**
 * Painel do rank, na moldura do site, com a aresta de acento à esquerda.
 *
 * A borda cinza de 1px era de outro tempo: o resto do site (entrar, entregas,
 * relatórios, meus títulos) usa a moldura de borda em gradiente, e esta era a
 * única página que ainda misturava os dois desenhos.
 *
 * A aresta colorida fica: ela é a única coisa da tela que muda de cor com a
 * patente, e é o que faz Prata e Global não parecerem o mesmo cartão.
 */
function Panel({
  color,
  children,
  className = "",
}: {
  color: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Moldura className={className}>
      <section className="relative">
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{ backgroundColor: color }}
        />
        {children}
      </section>
    </Moldura>
  );
}

/**
 * Cartão de progresso do participante.
 *
 * SEM VALOR EM REAIS.
 *
 * Ele mostrava "faltam 920 XP, cerca de R$ 92 em números". O real lia como
 * etiqueta de preço do nível, e o número é maior justamente para quem está
 * começando, ou seja, aparecia maior para quem menos deveria se assustar. A
 * régua de conversão é interna: existe no servidor, e não na tela.
 */
export function RankCard({
  xp,
  totalSpent = 0,
  multiplicador,
}: {
  xp: number;
  /** Só para resolver o GOAT. Nunca é exibido. */
  totalSpent?: number;
  /** Boost atual, para a linha de baixo. */
  multiplicador?: number;
}) {
  const progress = rankProgress(xp);
  // rankProgress ainda não conhece a exigência de gasto do GOAT, então o
  // selo sai daqui: os dois precisam concordar, senão a página mostra GOAT
  // num usuário que o servidor não reconhece como GOAT.
  const rank = rankFromXp(xp, totalSpent);

  return (
    <Panel color={rank.color}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(420px 120px at 0% 0%, color-mix(in srgb, ${rank.color} 11%, transparent), transparent 70%)`,
        }}
      />

      <div className="relative p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <RankBadge rank={rank} size="lg" />

          <div className="min-w-0">
            {/* Um ponto menor no celular do que era: o título passou de
                "Nível 13" para nomes de duas palavras ("Águia Mestre", "AK
                Cruzada"), e a 20px eles quebravam em duas linhas num
                telefone de 360, levando junto o rótulo do XP ao lado. */}
            <h2 className="text-lg leading-tight font-bold tracking-tight sm:text-2xl">
              {rank.label}
            </h2>
            <p
              className="text-[11px] font-bold tracking-[0.12em] uppercase"
              style={{ color: rank.color }}
            >
              {/* Fora do prestígio vai o número do nível: agora que o
                  título é o nome da patente ("Xerife"), repetir o grupo
                  embaixo seria eco nos grupos de um nível só, e o número é o
                  que as campanhas exclusivas usam como requisito.

                  No prestígio não vai nada. Ia a descrição da patente, e ela
                  saiu: explicava a metáfora, não o degrau. */}
              {rank.prestige ? null : `Nível ${rank.level}`}
            </p>
          </div>

          {/* shrink-0 no XP: sem isso o flex espremia "XP acumulado" em duas
              linhas para dar espaço ao nome, e as duas colunas brigavam pela
              mesma sobra. Aqui o número tem largura fixa e o nome fica com o
              resto. */}
          <div className="ml-auto shrink-0 text-right">
            <p className="text-[9.5px] font-bold tracking-[0.16em] text-muted-foreground uppercase">
              {/* "XP" no celular. O rótulo inteiro custa uns sessenta pixels
                  da mesma linha em que agora mora um nome de duas palavras, e
                  o número embaixo já diz o que ele é. No desktop sobra
                  espaço, e lá ele volta por extenso. */}
              <span className="sm:hidden">XP</span>
              <span className="hidden sm:inline">XP acumulado</span>
            </p>
            <p className="font-mono text-lg font-bold tracking-tight tabular-nums sm:text-xl">
              {xp.toLocaleString("pt-BR")}
            </p>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-baseline justify-between gap-3 text-xs">
            <span className="text-muted-foreground">
              {progress.atMax ? (
                "Patente máxima atingida"
              ) : (
                <>
                  Próximo:{" "}
                  <b className="font-semibold text-foreground">
                    {progress.nextLabel}
                  </b>
                </>
              )}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {progress.atMax ? "MÁX" : `${progress.percent}%`}
            </span>
          </div>

          <RankMeter
            percent={progress.percent}
            color={rank.color}
            height={6}
            label={progress.nextLabel ?? "Patente máxima"}
          />
        </div>

        <div className="mt-3 space-y-1 border-t border-[#232730] pt-3 text-xs text-muted-foreground">
          {!progress.atMax && (
            <p>
              Faltam{" "}
              <b className="font-semibold text-foreground">
                {progress.xpToNext.toLocaleString("pt-BR")} XP
              </b>{" "}
              para o {progress.nextLabel}.
            </p>
          )}
          {multiplicador != null && (
            <p>
              Seu boost atual é{" "}
              <b className="font-semibold text-foreground">
                {multiplicador.toLocaleString("pt-BR", {
                  minimumFractionDigits: 1,
                })}
                x
              </b>
              . Mantenha sua sequência para acumular XP mais rápido.
            </p>
          )}
        </div>
      </div>
    </Panel>
  );
}

/** A escada completa: as faixas de nível e as patentes acima delas. */
export function RankLadder({ xp }: { xp: number }) {
  const current = rankProgress(xp).rank;

  return (
    <Moldura>
      <section className="p-4 md:p-5">
        {/* Título no mesmo formato das outras seções da conta. Em caixa alta
            pequena ele lia como rótulo de campo, e não como o cabeçalho da
            maior seção da página. */}
        <h2 className="flex items-center gap-2 text-base font-bold">
          <Medal aria-hidden className="h-4 w-4 text-muted-foreground" />
          Patentes
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          22 níveis. Uma missão: chegar ao Global. Depois disso, começa o
          prestígio.
        </p>
        {/* Para que serve, e não só quais são. A escada estava listando patentes
          sem dizer o que a pessoa ganha ao subir, e patente sem prêmio é só
          enfeite. */}
        <p className="mt-2 mb-4 text-xs leading-relaxed text-muted-foreground">
          Cada compra soma XP e te faz subir de patente. Patente alta libera
          campanha exclusiva, inclusive sorteio grátis reservado para quem já
          chegou lá.
        </p>

        <ol className="space-y-2.5">
          {TIERS.map((tier, index) => {
            const last = TIERS[index + 1]
              ? TIERS[index + 1].from - 1
              : MAX_LEVEL;
            const active =
              current.prestige == null &&
              current.level >= tier.from &&
              current.level <= last;

            return (
              <li key={tier.name} className="flex items-center gap-3">
                <span
                  className="w-20 shrink-0 text-[11px] font-bold uppercase leading-tight tracking-[0.08em] sm:w-24"
                  style={{ color: active ? tier.color : undefined }}
                  data-active={active}
                >
                  <span className={active ? "" : "text-muted-foreground"}>
                    {tier.name}
                  </span>
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: last - tier.from + 1 }, (_, i) => {
                    const level = tier.from + i;
                    // Apaga só o que ainda não foi conquistado. Quem chegou ao
                    // prestígio passou por toda a escada, apagá-la inteira
                    // faria a conquista parecer o contrário do que é.
                    const reached = xp >= xpForLevel(level);
                    const isCurrent = active && current.level === level;
                    return (
                      <span
                        key={level}
                        title={`${nomeDoNivel(level)} · nível ${level}`}
                        className={
                          isCurrent
                            ? "rounded-full ring-2 ring-offset-2 ring-offset-[#141619]"
                            : undefined
                        }
                        style={
                          isCurrent
                            ? { ["--tw-ring-color" as string]: current.color }
                            : undefined
                        }
                      >
                        <RankBadge
                          xp={xpForLevel(level)}
                          size="md"
                          muted={!reached}
                        />
                      </span>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ol>

        <ol className="mt-4 space-y-1.5 border-t border-[#232730] pt-4">
          {PRESTIGE_RANKS.map((prestige) => {
            const reached = xp >= prestige.xp;
            return (
              <li
                key={prestige.key}
                className="flex items-center gap-3 rounded-md border px-3 py-2"
                style={{
                  borderColor: reached ? `${prestige.color}55` : "#232730",
                  backgroundColor: reached ? `${prestige.color}0f` : undefined,
                }}
              >
                <RankBadge xp={prestige.xp} size="md" muted={!reached} />
                <div className="min-w-0 flex-1">
                  <p
                    className="text-xs font-bold"
                    style={{ color: reached ? prestige.color : undefined }}
                  >
                    <span className={reached ? "" : "text-muted-foreground"}>
                      {prestige.label}
                    </span>
                  </p>
                </div>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
                  {prestige.xp.toLocaleString("pt-BR")}
                </span>
              </li>
            );
          })}
        </ol>
      </section>
    </Moldura>
  );
}

"use client";

// O card de Boost de XP, na página "Minha conta".
//
// As cinco faixas em fila, a atual em destaque, e cada uma clicável para
// explicar o que ela é. É o mesmo desenho mental do C6 Átomos: a escada
// inteira visível de uma vez, para a pessoa saber onde está e o que vem
// depois, em vez de descobrir o próximo degrau só ao chegar nele.
//
// NENHUM VALOR EM REAIS AQUI.
//
// A régua de conversão é interna. Este componente recebe pontos, faixa e
// multiplicador já resolvidos pelo servidor; ele não calcula multiplicador,
// justamente para a regra não existir em dois lugares e desandar.

import { useState } from "react";
import { Moldura } from "@/components/ui/moldura";
import { Flame, Shield, Sparkles, Target } from "lucide-react";

import { cn } from "@/lib/utils";

/** Explicação de cada faixa. Sem valor de compra, por regra. */
const EXPLICACOES: Record<string, string> = {
  Base: "Este é o multiplicador inicial. Participe das campanhas e mantenha sua atividade para aumentar seu boost.",
  Aquecido:
    "Mantenha uma participação frequente e conclua atividades para alcançar esta faixa.",
  Ativo:
    "Combine frequência, sequência de participação e missões para aumentar sua pontuação.",
  Turbo:
    "Reservado para participantes com alta frequência e constância durante o ciclo.",
  Lendário:
    "O maior multiplicador regular de XP, conquistado por participantes altamente ativos.",
};

export interface FaixaVisivel {
  name: string;
  minBoostPoints: number;
  multiplier: number;
}

export interface DadosDoBoost {
  boostPoints: number;
  multiplicador: number;
  faixaAtual: string;
  proximaFaixaNome: string | null;
  pontosParaProximaFaixa: number | null;
  sequencia: number;
  recorde: number;
  protecaoDisponivel: boolean;
  diasAtivosNoCiclo: number;
  campanhasNoCiclo: number;
  boostDeSorteAtivo: boolean;
  boostDeSorteExpiraEm: string | null;
  participouHoje: boolean;
}

function formatarMultiplicador(v: number) {
  return `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1 })}x`;
}

/** Horas que faltam para o boost temporário acabar. */
function horasRestantes(iso: string | null): number | null {
  if (!iso) return null;
  const restam = Date.parse(iso) - Date.now();
  if (Number.isNaN(restam) || restam <= 0) return null;
  return Math.ceil(restam / 3_600_000);
}

export function CardDeBoost({
  dados,
  faixas,
  tetoDePontos,
}: {
  dados: DadosDoBoost;
  faixas: FaixaVisivel[];
  tetoDePontos: number;
}) {
  const [aberta, setAberta] = useState<string>(dados.faixaAtual);
  const escolhida = faixas.find((f) => f.name === aberta) ?? faixas[0];
  const percentual = Math.min(
    100,
    Math.max(0, (dados.boostPoints / tetoDePontos) * 100),
  );
  const horas = horasRestantes(dados.boostDeSorteExpiraEm);

  return (
    <Moldura>
      <section className="p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold">Boost de XP</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Aumente sua pontuação mantendo frequência, sequência e completando
              missões.
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-sm font-bold tabular-nums text-primary">
            {formatarMultiplicador(dados.multiplicador)}
          </span>
        </div>

        {/* A barra atrás das faixas: uma linha só, para a posição na escada ser
          lida de relance antes de qualquer número. */}
        <div className="mt-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#20242b]">
            <div
              className="rank-meter-cresce h-full rounded-full bg-primary transition-[width] duration-700"
              style={{ width: `${percentual}%` }}
            />
          </div>

          {/* Rolagem horizontal no telefone: cinco faixas não cabem em 320px, e
            encolher a fonte até caber tornaria a escada ilegível. */}
          <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
            {faixas.map((faixa) => {
              const alcancada = dados.boostPoints >= faixa.minBoostPoints;
              const atual = faixa.name === dados.faixaAtual;
              const selecionada = faixa.name === aberta;
              return (
                <button
                  key={faixa.name}
                  type="button"
                  onClick={() => setAberta(faixa.name)}
                  aria-pressed={selecionada}
                  className={cn(
                    "min-w-[84px] flex-1 rounded-lg border px-2 py-2 text-center transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    selecionada
                      ? "border-primary bg-primary/10"
                      : "border-[#232730] hover:bg-[#1a1d22]",
                  )}
                >
                  <span
                    className={cn(
                      "block text-[11px] font-bold uppercase tracking-wide",
                      atual
                        ? "text-primary"
                        : alcancada
                          ? "text-foreground"
                          : "text-muted-foreground",
                    )}
                  >
                    {faixa.name}
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 block text-sm font-extrabold tabular-nums",
                      alcancada
                        ? "text-foreground"
                        : "text-muted-foreground/60",
                    )}
                  >
                    {formatarMultiplicador(faixa.multiplier)}
                  </span>
                  {atual && (
                    <span className="mt-1 block text-[9px] font-bold uppercase tracking-wider text-primary">
                      Você
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <p
            aria-live="polite"
            className="mt-2 rounded-lg bg-[#1a1d22] p-3 text-xs leading-relaxed text-muted-foreground"
          >
            <b className="font-semibold text-foreground">
              {escolhida.name}: {formatarMultiplicador(escolhida.multiplier)}
            </b>
            <br />
            {EXPLICACOES[escolhida.name] ?? ""}
          </p>
        </div>

        {/* Resumo de atividade. Cada linha é uma alavanca que a pessoa pode
          puxar, e nenhuma delas menciona dinheiro. */}
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[#232730] pt-4 text-xs sm:grid-cols-4">
          <Numero rotulo="Pontos de boost" valor={`${dados.boostPoints}`} />
          <Numero
            rotulo="Sequência"
            valor={`${dados.sequencia} dia${dados.sequencia === 1 ? "" : "s"}`}
          />
          <Numero rotulo="Melhor sequência" valor={`${dados.recorde}`} />
          <Numero
            rotulo="Dias ativos no ciclo"
            valor={`${dados.diasAtivosNoCiclo}`}
          />
        </dl>

        <ul className="mt-3 space-y-1.5 text-xs text-muted-foreground">
          {dados.protecaoDisponivel ? (
            <Aviso icone={<Shield className="h-3.5 w-3.5" />}>
              Sua sequência está protegida por mais uma ausência.
            </Aviso>
          ) : (
            <Aviso icone={<Shield className="h-3.5 w-3.5" />}>
              Proteção de sequência já utilizada. Ela volta depois de mais dias
              ativos.
            </Aviso>
          )}

          {!dados.participouHoje && dados.sequencia > 0 && (
            <Aviso icone={<Target className="h-3.5 w-3.5" />}>
              Participe em mais um dia diferente para avançar sua sequência.
            </Aviso>
          )}

          {dados.proximaFaixaNome && dados.pontosParaProximaFaixa != null && (
            <Aviso icone={<Flame className="h-3.5 w-3.5" />}>
              Você está próximo da faixa{" "}
              <b className="font-semibold text-foreground">
                {dados.proximaFaixaNome}
              </b>
              .
            </Aviso>
          )}

          {dados.boostDeSorteAtivo && horas != null && (
            <Aviso icone={<Sparkles className="h-3.5 w-3.5" />}>
              Seu Boost de Sorte está ativo por mais {horas} hora
              {horas === 1 ? "" : "s"}.
            </Aviso>
          )}
        </ul>

        <details className="mt-4 border-t border-[#232730] pt-3">
          <summary className="cursor-pointer text-xs font-semibold text-primary">
            Como funciona o XP?
          </summary>
          <div className="mt-2 space-y-2 text-xs leading-relaxed text-muted-foreground">
            <p>
              Você recebe XP ao participar das campanhas. Sua frequência,
              sequência, missões, eventos e boosts temporários podem aumentar a
              quantidade recebida. Seu multiplicador pode variar ao longo do
              tempo conforme sua atividade.
            </p>
            {/* Frase obrigatória, e não decorativa: benefício que mexe em XP não
              pode ser confundido com benefício que mexe em sorteio. */}
            <p>
              Os multiplicadores aumentam somente o XP recebido e não alteram
              suas chances nos sorteios.
            </p>
          </div>
        </details>
      </section>
    </Moldura>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {rotulo}
      </dt>
      <dd className="mt-0.5 text-sm font-bold tabular-nums">{valor}</dd>
    </div>
  );
}

function Aviso({
  icone,
  children,
}: {
  icone: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-2">
      <span aria-hidden className="mt-0.5 shrink-0 text-primary">
        {icone}
      </span>
      <span>{children}</span>
    </li>
  );
}

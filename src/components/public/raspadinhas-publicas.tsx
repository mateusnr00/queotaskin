"use client";

// Raspadinhas premiadas na página da campanha.
//
// A mecânica estava ligada, os prêmios cadastrados, e a página não dizia uma
// palavra sobre isso: quem decidia quantos títulos comprar não via nem quantas
// raspadinhas cada degrau dá, nem o que dá para ganhar nelas. A caixa surpresa
// já mostrava as duas coisas, e a raspadinha ficou pelo caminho.
//
// Segue o mesmo desenho da caixa, de propósito: são duas mecânicas irmãs, na
// mesma página, e desenho diferente para a mesma ideia faz parecer que uma
// delas é outra coisa. Reaproveita a linha de prêmio e o contador, que já
// servem aos títulos premiados e às caixas.

import type { SkinRarity } from "@prisma/client";
import type { TimeDeCS2 } from "@/lib/times-cs2";
import { useState } from "react";
import { ChevronDown, Ticket } from "lucide-react";

import {
  ContadorDePremios,
  LinhaDePremio,
} from "@/components/public/linha-de-premio";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";

const VISIVEIS_FECHADO = 5;

export interface ComboDeRaspadinha {
  titulos: number;
  raspadinhas: number;
}

/**
 * Quantos títulos dão quantas raspadinhas.
 *
 * "A partir de", e nunca "a cada": diferente da caixa, o combo da raspadinha
 * não acumula, vale só o maior degrau alcançado (ver gerarRaspadinhasParaReserva).
 * Escrever "a cada 10" prometeria três lotes a quem compra 30 e entregaria um.
 */
export function RaspadinhasCombos({
  combos,
  precoPorNumero,
}: {
  combos: ComboDeRaspadinha[];
  precoPorNumero: number;
}) {
  if (combos.length === 0) return null;

  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4 md:p-5">
      <h2 className="text-base font-bold">Raspadinhas premiadas</h2>

      <ul className="space-y-2">
        {combos.map((c) => (
          <li
            key={c.titulos}
            className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-3 py-2.5"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
              <Ticket className="h-5 w-5" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-lg leading-tight font-extrabold text-primary">
                {c.raspadinhas.toLocaleString("pt-BR")}{" "}
                {c.raspadinhas === 1 ? "raspadinha" : "raspadinhas"}
              </p>
              <p className="text-xs leading-tight text-muted-foreground">
                a partir de{" "}
                <span className="font-semibold text-foreground">
                  {c.titulos.toLocaleString("pt-BR")}{" "}
                  {c.titulos === 1 ? "título" : "títulos"}
                </span>
              </p>
            </div>

            <p className="shrink-0 text-base font-bold tabular-nums">
              {formatBRL(precoPorNumero * c.titulos)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface PremioDeRaspadinha {
  /** O que sai para quem raspar. */
  premio: string;
  /** Preenchida quando o nome bate com o catálogo. Pinta o nome. */
  raridade: SkinRarity | null;
  /** Nome de quem levou, quando já saiu. */
  ganhador: string | null;
  /** O prêmio já tem dono, mas a unidade ainda não foi aberta. */
  reservado?: boolean;
  /** Time do ganhador, resolvido no servidor. Nulo quando não há conta. */
  time: TimeDeCS2 | null;
}

export function RaspadinhasSection({
  premios,
}: {
  premios: PremioDeRaspadinha[];
}) {
  const [aberto, setAberto] = useState(false);
  if (premios.length === 0) return null;

  // Reservado conta como saído: o prêmio já tem dono, mesmo que o nome só
  // apareça depois da raspagem. Contá-lo como disponível prometeria ao próximo
  // comprador um prêmio que não existe mais no bolo.
  const sorteados = premios.filter((p) => p.ganhador || p.reservado).length;
  const visiveis =
    aberto || premios.length <= VISIVEIS_FECHADO
      ? premios
      : premios.slice(0, VISIVEIS_FECHADO);
  const daParaFechar = premios.length > VISIVEIS_FECHADO;

  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4 md:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
            <Ticket className="h-4 w-4" />
          </span>
          Raspadinhas
          <span className="text-xs font-normal text-muted-foreground">
            ganhadores
          </span>
        </h2>
        <ContadorDePremios feitos={sorteados} total={premios.length} />
      </div>

      <ul className="space-y-2">
        {visiveis.map((p, i) => (
          <LinhaDePremio
            key={i}
            premio={p.premio}
            raridade={p.raridade}
            ganhador={p.ganhador}
            time={p.time}
            reservado={p.reservado}
            rotuloVago="Disponível"
          />
        ))}
      </ul>

      {daParaFechar && (
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/5"
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
              aberto && "rotate-180",
            )}
          />
          {aberto
            ? "Mostrar menos"
            : `Mostrar mais (${premios.length - VISIVEIS_FECHADO})`}
        </button>
      )}
    </section>
  );
}

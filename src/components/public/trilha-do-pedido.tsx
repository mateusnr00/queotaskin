import { Check, Clock, X } from "lucide-react";

import { cn } from "@/lib/utils";

// O cabeçalho comum às três telas do comprovante.
//
// Antes cada estado abria de um jeito: a de aguardar tinha um selo pulsando
// e o título do sorteio, a de paga abria num quadro verde de 8 de padding, a
// de expirada num quadro âmbar igual. Quem pagava via a página se remontar
// inteira, e quem chegava pelo link não tinha como saber em que ponto do
// caminho estava.
//
// A trilha resolve as duas coisas. É o mesmo desenho nos três estados, e diz
// onde a pessoa está: reservou, falta pagar, acabou. É a regra de "indicação
// de progresso" que a busca de UX marca como média: passo a passo ou barra,
// nunca deixar sem sinal de onde se está.
//
// A cor separa os estados, e é por isso que a de expirada deixou de ser
// âmbar: âmbar era a de aguardar, e as duas telas ficavam parecidas
// justamente onde a diferença mais importa.

export type EstadoDoPedido = "aguardando" | "pago" | "encerrado";

const PASSOS = ["Reserva", "Pagamento", "Confirmação"] as const;

/** Até onde a trilha está acesa, por estado. */
const ATE_ONDE: Record<EstadoDoPedido, number> = {
  aguardando: 1,
  pago: 3,
  encerrado: 1,
};

const CORES: Record<
  EstadoDoPedido,
  { aceso: string; texto: string; selo: string }
> = {
  aguardando: {
    aceso: "bg-primary",
    texto: "text-primary",
    selo: "border-primary/40 bg-primary/10 text-primary",
  },
  pago: {
    aceso: "bg-emerald-500",
    texto: "text-emerald-600 dark:text-emerald-400",
    selo:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  encerrado: {
    aceso: "bg-muted-foreground",
    texto: "text-muted-foreground",
    selo: "border-border bg-muted text-muted-foreground",
  },
};

const SELO: Record<EstadoDoPedido, { icone: typeof Check; texto: string }> = {
  aguardando: { icone: Clock, texto: "Aguardando pagamento" },
  pago: { icone: Check, texto: "Pagamento confirmado" },
  encerrado: { icone: X, texto: "Reserva encerrada" },
};

export function TrilhaDoPedido({
  estado,
  titulo,
}: {
  estado: EstadoDoPedido;
  /** O nome da campanha. É o contexto que diz de que compra se trata. */
  titulo: string;
}) {
  const cor = CORES[estado];
  const { icone: Icone, texto } = SELO[estado];
  const ate = ATE_ONDE[estado];

  return (
    <header className="space-y-4">
      <div className="space-y-2 text-center">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider",
            cor.selo
          )}
        >
          {estado === "aguardando" ? (
            // Ponto pulsando só enquanto há espera: nos outros dois estados
            // nada mais vai acontecer, e piscar ali prometeria movimento.
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
          ) : (
            <Icone className="h-3.5 w-3.5" />
          )}
          {texto}
        </span>
        <h1 className="text-balance text-lg font-bold leading-tight tracking-tight">
          {titulo}
        </h1>
      </div>

      {/* Trilha. Os traços são o progresso e os rótulos ficam embaixo, para
          a linha continuar legível quando o nome do passo é comprido. */}
      <ol className="flex items-start gap-1.5" aria-label="Etapas do pedido">
        {PASSOS.map((passo, i) => {
          const aceso = i < ate;
          return (
            <li key={passo} className="flex-1 space-y-1.5">
              <div
                className={cn(
                  "h-1 rounded-full transition-colors",
                  aceso ? cor.aceso : "bg-border"
                )}
                aria-hidden
              />
              <p
                className={cn(
                  // Os rótulos apagados eram muted-foreground/60 e mediam
                  // 3,40:1 no pixel composto, abaixo do mínimo de 4,5 para
                  // texto pequeno. A opacidade saiu: apagado aqui é o tom
                  // secundário, não um tom secundário rebaixado de novo.
                  "text-[11px] font-semibold uppercase tracking-wider",
                  aceso ? cor.texto : "text-muted-foreground"
                )}
              >
                {passo}
              </p>
            </li>
          );
        })}
      </ol>
    </header>
  );
}

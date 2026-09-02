import { Check, X } from "lucide-react";

import { cn } from "@/lib/utils";

// O cabeçalho comum às três telas do comprovante.
//
// Antes cada estado abria de um jeito: a de aguardar tinha um selo pulsando e
// o título do sorteio, a de paga abria num quadro verde, a de expirada num
// quadro âmbar igual. Quem pagava via a página se remontar inteira, e quem
// chegava pelo link não tinha como saber em que ponto do caminho estava.
//
// A trilha resolve as duas coisas. É o mesmo desenho nos três estados, e diz
// onde a pessoa está: reservou, falta pagar, acabou.
//
// DE TRÊS TRAÇOS PARA TRÊS ESTAÇÕES
//
// A primeira versão eram três barrinhas de 4px lado a lado. Barra é medida de
// quantidade ("68% pago"), e aqui não há quantidade nenhuma: há três momentos,
// e a pessoa está num deles. Três traços iguais também não distinguiam o passo
// FEITO do passo ATUAL, então a tela de aguardando pagamento acendia dois
// terços da barra sem dizer que o segundo terço é justamente o que falta.
//
// Agora cada passo é uma estação: círculo com visto quando já passou, círculo
// vazado pulsando no que está acontecendo agora, círculo apagado no que ainda
// vem. O fio entre eles só acende no trecho já percorrido, então o caminho se
// lê de uma vez, da esquerda para a direita.
//
// A COR SEPARA OS ESTADOS
//
// Laranja enquanto se espera o pagamento, verde quando ele cai, cinza quando a
// reserva morre. A de expirada deixou de ser âmbar por isso: âmbar era a de
// aguardar, e as duas telas ficavam parecidas justamente onde a diferença mais
// importa.

export type EstadoDoPedido = "aguardando" | "pago" | "encerrado";

const PASSOS = ["Reserva", "Pagamento", "Confirmação"] as const;

/** Quantos passos já foram cumpridos, por estado. */
const CUMPRIDOS: Record<EstadoDoPedido, number> = {
  aguardando: 1,
  pago: 3,
  encerrado: 1,
};

/**
 * Qual passo está acontecendo agora, por estado.
 *
 * Pago e encerrado não têm passo atual: nos dois o caminho acabou, um por bem
 * e outro por mal, e um círculo pulsando ali prometeria que ainda vai
 * acontecer alguma coisa.
 */
const ATUAL: Record<EstadoDoPedido, number | null> = {
  aguardando: 1,
  pago: null,
  encerrado: null,
};

const CORES: Record<
  EstadoDoPedido,
  { fundo: string; fio: string; texto: string; selo: string; brilho: string }
> = {
  aguardando: {
    fundo: "bg-primary text-primary-foreground",
    fio: "bg-primary",
    texto: "text-primary",
    selo: "border-primary/40 bg-primary/10 text-primary",
    brilho: "shadow-[0_0_12px_-1px_var(--primary)]",
  },
  pago: {
    fundo: "bg-emerald-500 text-white",
    fio: "bg-emerald-500",
    texto: "text-emerald-600 dark:text-emerald-400",
    selo:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    brilho: "shadow-[0_0_12px_-1px_var(--color-emerald-500)]",
  },
  encerrado: {
    fundo: "bg-muted-foreground text-background",
    fio: "bg-muted-foreground",
    texto: "text-muted-foreground",
    selo: "border-border bg-muted text-muted-foreground",
    brilho: "",
  },
};

const SELO: Record<EstadoDoPedido, { icone: typeof Check; texto: string }> = {
  aguardando: { icone: Check, texto: "Aguardando pagamento" },
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
  const cumpridos = CUMPRIDOS[estado];
  const atual = ATUAL[estado];

  return (
    <header className="space-y-4">
      <div className="space-y-2.5 text-center">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold tracking-wider uppercase",
            cor.selo,
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

        {/* O nome da campanha é o título da página, e agora tem tamanho de
            título: ele responde "que compra é esta?", que é a primeira
            pergunta de quem abre o link no meio do dia seguinte. */}
        <h1 className="text-xl font-extrabold leading-tight tracking-tight text-balance sm:text-2xl">
          {titulo}
        </h1>
      </div>

      <ol className="flex items-start" aria-label="Etapas do pedido">
        {PASSOS.map((passo, i) => {
          const feito = i < cumpridos;
          const agora = atual === i;
          const aceso = feito || agora;
          return (
            <li key={passo} className="flex-1 space-y-2">
              <p
                className={cn(
                  // Os rótulos apagados eram muted-foreground/60 e mediam
                  // 3,40:1 no pixel composto, abaixo do mínimo de 4,5 para
                  // texto pequeno. A opacidade saiu: apagado aqui é o tom
                  // secundário, não um tom secundário rebaixado de novo.
                  "text-center text-[10px] font-bold tracking-wider uppercase sm:text-[11px]",
                  aceso ? cor.texto : "text-muted-foreground",
                )}
              >
                {passo}
              </p>

              {/* O fio nasce e morre no CENTRO dos círculos vizinhos, e não
                  na borda da célula: por isso são dois pedaços, um de cada
                  lado, escondidos nas pontas da trilha. Um fio só, atrás de
                  tudo, apareceria sobrando meia estação para fora. */}
              <div className="relative flex h-7 items-center justify-center">
                {i > 0 && (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute top-1/2 right-1/2 left-0 h-0.5 -translate-y-1/2",
                      feito || agora ? cor.fio : "bg-border",
                    )}
                  />
                )}
                {i < PASSOS.length - 1 && (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute top-1/2 right-0 left-1/2 h-0.5 -translate-y-1/2",
                      i + 1 < cumpridos || atual === i + 1
                        ? cor.fio
                        : "bg-border",
                    )}
                  />
                )}

                <span
                  className={cn(
                    "relative z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors",
                    feito && `border-transparent ${cor.fundo}`,
                    // O passo do meio, na tela de aguardando, é o único
                    // vazado: ele diz "é aqui que você está" sem afirmar que
                    // já aconteceu.
                    agora && `border-current bg-background ${cor.texto}`,
                    !aceso && "border-border bg-background",
                    // O brilho fica só no ÚLTIMO passo cumprido, que é onde a
                    // leitura para. Em todos, viraria três lâmpadas.
                    feito && i === cumpridos - 1 && cor.brilho,
                  )}
                >
                  {feito ? (
                    <Check className="h-4 w-4" strokeWidth={3} />
                  ) : agora ? (
                    <span className="h-2 w-2 rounded-full bg-current motion-safe:animate-pulse" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-border" />
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </header>
  );
}

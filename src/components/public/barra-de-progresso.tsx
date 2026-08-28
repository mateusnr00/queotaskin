// A barra de vendas da campanha.
//
// A versão anterior tinha `transition-all duration-500` e nunca animou uma vez
// sequer: a largura vem do servidor já no valor final, então não existe
// mudança para a transição pegar. A barra nascia parada no número dela.
//
// Agora ela CRESCE ao chegar. É o movimento que diz "isto está vendendo", e é
// de longe o que mais rende aqui: a pessoa vê a barra correr até onde a
// campanha está, em vez de encontrar um número já escrito.
//
// TUDO EM CSS, E SEM JAVASCRIPT
//
// A primeira versão disto animava por estado do React, num componente de
// cliente. Fazia a mesma coisa custando um componente de cliente inteiro no
// pacote, e tinha um problema real: com a largura saindo do estado, o HTML do
// servidor vinha com a barra zerada. Sem JavaScript, ou antes dele carregar, a
// campanha aparecia como se nada tivesse sido vendido.
//
// Em CSS o servidor entrega a largura certa e a animação parte de zero por
// cima dela. Funciona sem JavaScript, não custa nada no pacote, e o
// prefers-reduced-motion desliga pelo mesmo lugar que o resto do site.
//
// O rótulo da porcentagem entra depois que a barra assenta. Ele é pintado em
// duas camadas, clara sobre o trilho e escura sobre o preenchimento, e o
// recorte entre elas é fixo no valor final: aparecendo durante a corrida, ele
// ficaria escuro sobre o trilho escuro por meio segundo.
//
// O orçamento de movimento é pequeno de propósito. Animar tudo cansa e tira o
// sentido de cada coisa, então só esta barra se mexe nesta dobra.
//
// Zero por cento não vira barra vazia com um zero no meio. Campanha recém
// publicada assim parece abandonada, e é o oposto do que ela é.

import { Flame } from "lucide-react";

import { cn } from "@/lib/utils";

/** A partir de quanto vendido a barra entra em modo "acabando". */
const LIMITE_QUENTE = 80;

export function BarraDeProgresso({
  percent,
  soldCount,
  remaining,
}: {
  percent: number;
  soldCount: number;
  remaining: number;
}) {
  const quente = percent >= LIMITE_QUENTE;
  const vazia = percent === 0;
  const esgotada = remaining <= 0;

  return (
    <div className="space-y-1.5">
      <div
        className={cn(
          "relative h-7 w-full overflow-hidden rounded-full bg-muted ring-1 ring-border/60 md:h-8",
          quente && "barra-quente",
        )}
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${percent}% dos números vendidos`}
      >
        {percent > 0 && (
          <div
            className={cn(
              "barra-cresce absolute inset-y-0 left-0 overflow-hidden rounded-full",
              quente
                ? "bg-gradient-to-r from-orange-600 via-primary to-amber-400"
                : "bg-gradient-to-r from-primary/85 via-primary to-primary",
            )}
            style={{ width: `${percent}%` }}
          >
            {/* As listras andam por transform, e não por background-position:
                assim o trabalho fica no compositor, e a barra não repinta a
                cada quadro enquanto a página inteira rola. */}
            <span
              aria-hidden
              className="barra-listras absolute inset-y-0 -left-1/2 w-[200%]"
            />
            {/* O brilho na ponta é o que faz a barra parecer viva parada. */}
            <span
              aria-hidden
              className="absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white/45 to-transparent"
            />
          </div>
        )}

        <span className="barra-rotulo absolute inset-0 flex items-center justify-center text-xs font-bold tabular-nums text-foreground/70">
          {percent}%
        </span>
        <span
          className="barra-rotulo absolute inset-0 flex items-center justify-center text-xs font-bold tabular-nums text-primary-foreground"
          style={{ clipPath: `inset(0 ${100 - percent}% 0 0)` }}
          aria-hidden
        >
          {percent}%
        </span>
      </div>

      <div className="flex items-center justify-between gap-3 text-xs tabular-nums text-muted-foreground">
        <span>
          {vazia ? (
            // Nada vendido ainda vira convite, e não um zero sozinho.
            <span className="font-semibold text-primary">
              Seja o primeiro a garantir
            </span>
          ) : (
            <>
              <strong className="text-foreground">
                {soldCount.toLocaleString("pt-BR")}
              </strong>{" "}
              vendidos
            </>
          )}
        </span>
        <span
          className={cn(
            "flex items-center gap-1",
            (quente || esgotada) && "font-semibold text-primary",
          )}
        >
          {esgotada ? (
            // "0 restando" com chama é alarme sobre nada: acabou, e o que a
            // pessoa precisa saber é que acabou.
            "Esgotado"
          ) : (
            <>
              {quente && <Flame aria-hidden className="h-3.5 w-3.5" />}
              <strong className={cn(!quente && "text-foreground")}>
                {remaining.toLocaleString("pt-BR")}
              </strong>{" "}
              {quente ? "restando" : "disponíveis"}
            </>
          )}
        </span>
      </div>
    </div>
  );
}

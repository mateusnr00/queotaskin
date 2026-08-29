"use client";

// A faixa da promoção em dobro, no formato que o dono do site pediu.
//
// Eu tinha feito outra coisa: fundo escuro, texto à esquerda, relógio de um
// lado e barra do outro. Ele mandou a referência e pediu praticamente
// idêntica, então é isto: cartão laranja, tudo centralizado, e o relógio DENTRO
// da barra, com ela esvaziando por trás do texto.
//
// O relógio dentro da barra é a parte que faz diferença. Separados, são duas
// informações que a pessoa precisa juntar; sobrepostos, o número e o quanto
// falta chegam de uma vez só.
//
// CONTRASTE
//
// O texto é marrom bem escuro sobre o laranja, e não branco. Branco sobre
// laranja fica em torno de 2:1, que é ilegível no sol do celular; o escuro
// passa de 8:1 sobre os dois tons da barra, tanto na parte cheia quanto na
// vazia. É o mesmo desenho da referência, sem o problema dela.
//
// SOBRE O MOVIMENTO
//
// Só a barra e o número mudam. Nada pisca, nada pula, e a transição de largura
// é linear de um segundo, do tamanho exato do tique do relógio, para a barra
// deslizar em vez de saltar.

import { useEffect, useState } from "react";

import {
  contagemEmPalavras,
  contagemRegressiva,
  formatarContagem,
  percentualDecorrido,
  percentualRestante,
  type Contagem,
} from "@/lib/promocao-em-dobro";
import { cn } from "@/lib/utils";
import { Chama } from "@/components/public/chama";

/** "07/08/2026 às 15:59", no fuso oficial. */
function dataPorExtenso(iso: string): string {
  const f = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
  // O Intl entrega "07/08/2026, 15:59"; a referência usa "às".
  return f.replace(", ", " às ");
}

export function FaixaDeDobro({
  /** Quando a promoção começou. É o que dá escala para a barra. */
  inicio,
  /** Quando a promoção acaba. Nulo quer dizer "sem prazo". */
  fim,
  className,
}: {
  inicio: string | null;
  fim: string | null;
  className?: string;
}) {
  const fimEmData = fim ? new Date(fim) : null;
  const inicioEmData = inicio ? new Date(inicio) : null;
  const [agora, setAgora] = useState<Date>(() => new Date());

  useEffect(() => {
    if (!fim) return;
    const relogio = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(relogio);
  }, [fim]);

  const contagem: Contagem | null = fimEmData
    ? contagemRegressiva(fimEmData, agora)
    : null;
  const restante = percentualRestante(inicioEmData, fimEmData, agora);
  // A barra enche com o que JÁ PASSOU, e não com o que resta. Do restante ela
  // só poderia encolher, e a borda andaria da direita para a esquerda, que é o
  // contrário de como se lê uma linha do tempo.
  const decorrido = percentualDecorrido(inicioEmData, fimEmData, agora);

  // Acabou com a pessoa na página: a faixa some em vez de mentir.
  if (contagem && contagem.total <= 0) return null;

  // O modo "acabando" só entra quando está mesmo acabando. Alarme permanente
  // vira ruído, e a pessoa aprende a ignorar justamente na hora que importa.
  const acabando = restante != null && restante <= 10;

  return (
    <section
      aria-labelledby="dobro-titulo"
      className={cn(
        "overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 p-4 text-center shadow-lg shadow-orange-500/20 md:p-5",
        className,
      )}
    >
      <h2
        id="dobro-titulo"
        className="text-lg font-extrabold tracking-tight text-amber-950 md:text-xl"
      >
        {/* As chamas ficam num flex com o texto para as três coisas
            partilharem a mesma linha de base. Soltas no meio do texto, o
            desenho de 30px empurrava a altura da linha. */}
        <span className="inline-flex items-center justify-center gap-1.5">
          <Chama />
          Chance em dobro!
          <Chama />
        </span>
      </h2>

      {contagem && (
        <div className="mt-3">
          {/* O relógio dentro da barra: a barra é o trilho, o texto fica por
              cima, e o preenchimento passa por trás dele. */}
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={
              decorrido == null ? undefined : Math.round(decorrido)
            }
            aria-label="Tempo já decorrido da promoção"
            className={cn(
              // O trilho é escurecido de leve, e não em 25%: o relógio é
              // escuro e fica por cima dele, e a 25% o contraste caía para
              // 3,7:1, abaixo do mínimo. Medido no navegador, não estimado.
              // Escurecer menos aumenta o contraste com o texto escuro, e o
              // preenchimento continua se distinguindo porque é bem mais claro.
              "relative h-9 w-full overflow-hidden rounded-lg bg-amber-950/10 md:h-10",
              acabando && "barra-quente",
            )}
          >
            {decorrido != null && (
              <div
                className={cn(
                  "absolute inset-y-0 left-0 overflow-hidden transition-[width] duration-1000 ease-linear",
                  acabando
                    ? "bg-gradient-to-r from-red-400 to-red-300"
                    : "bg-gradient-to-r from-amber-300 to-amber-200",
                )}
                style={{ width: `${decorrido}%` }}
              >
                {/* As listras são as mesmas da barra de vendas: a página fala
                    uma língua só para dizer "isto está correndo agora". */}
                <span
                  aria-hidden
                  className="barra-listras absolute inset-y-0 -left-1/2 w-[200%] opacity-70"
                />
                {/* O brilho que atravessa. Fica preso ao trecho preenchido,
                    então ele percorre o tempo que resta, e não a barra toda. */}
                <span
                  aria-hidden
                  className="dobro-brilho absolute inset-y-0 left-0 w-full"
                />
                {/* A ponta acesa, na fronteira do que falta. */}
                <span
                  aria-hidden
                  className={cn(
                    "dobro-ponta absolute inset-y-0 right-0 w-2 rounded-full blur-[2px]",
                    acabando ? "bg-red-100" : "bg-white",
                  )}
                />
              </div>
            )}
            <p
              aria-hidden
              className="relative flex h-full items-center justify-center text-base font-bold tabular-nums text-amber-950 md:text-lg"
            >
              Encerra em {formatarContagem(contagem)}
            </p>
          </div>
          {/* O relógio pisca a cada segundo e é enfeite para quem ouve. A
              frase abaixo diz a mesma coisa, uma vez só. */}
          <p className="sr-only" role="status">
            {contagemEmPalavras(contagem)}
          </p>
        </div>
      )}

      <p className="mt-3 text-base font-bold text-amber-950 md:text-lg">
        Compre agora e ganhe o dobro!
      </p>

      {(inicio || fim) && (
        <p className="mt-1 text-xs font-medium text-amber-950/80">
          Válido{inicio ? ` de ${dataPorExtenso(inicio)}` : ""}
          {fim ? ` até ${dataPorExtenso(fim)}` : ""}
        </p>
      )}
    </section>
  );
}

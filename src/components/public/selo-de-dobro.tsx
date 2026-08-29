// O selo que explica a conta da promoção em dobro no pedido.
//
// O problema que ele resolve: a tela dizia "22 números" ao lado de "R$ 11,00"
// e deixava a pessoa juntar as pontas sozinha. Quem não lembrava da promoção
// lia aquilo como erro de cobrança, e quem lembrava não tinha confirmação de
// que o dobro tinha sido aplicado no pedido dela.
//
// Aqui a frase é a conta inteira, com os dois números lado a lado e a seta
// entre eles: paguei por 11, recebo 22. Não é um lembrete da campanha, é o
// recibo da promoção neste pedido.

import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";

export function SeloDeDobro({
  /** Quantos bilhetes o pedido tem no total, já com o bônus. */
  total,
  /**
   * Onde o pedido está.
   *
   * O tempo do verbo não é detalhe: numa tela que ainda pede o Pix, "você
   * pagou" afirma um pagamento que não aconteceu, e quem lê fica sem saber se
   * já quitou. Antes do pagamento a frase é sobre o que está em curso e o que
   * vem depois; com o Pix confirmado, sobre o que aconteceu.
   */
  estado = "pago",
  className,
}: {
  total: number;
  estado?: "pagando" | "pago";
  className?: string;
}) {
  // Metade arredondada para cima: quando um número de brinde colide com o de
  // outro comprador ele não entra, e o pedido fica com um ímpar. Nesse caso
  // sobra do lado pago, nunca do lado do bônus.
  const pagos = Math.ceil(total / 2);
  const bonus = total - pagos;
  if (bonus <= 0) return null;

  return (
    <div
      className={cn(
        "rounded-xl border border-amber-400/40 bg-gradient-to-r from-amber-500/15 to-orange-500/10 px-3.5 py-2.5",
        className,
      )}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
        Promoção em dobro aplicada
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="text-muted-foreground">
          {estado === "pagando" ? "Você está pagando por" : "Você pagou por"}{" "}
          <b className="font-bold tabular-nums text-foreground">{pagos}</b>
        </span>
        <ArrowRight
          aria-hidden
          className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
        />
        <span className="font-bold tabular-nums text-amber-600 dark:text-amber-400">
          {estado === "pagando" ? "receberá" : "recebeu"} {total} números
        </span>
      </p>
      {/* A frase inteira de novo, corrida, para quem ouve a página: a seta é
          desenho e some na leitura, e "11 22 números" não diz nada. */}
      <span className="sr-only">
        Promoção em dobro:{" "}
        {estado === "pagando"
          ? `você está pagando por ${pagos} números e receberá ${total}.`
          : `você pagou por ${pagos} números e recebeu ${total}.`}
      </span>
    </div>
  );
}

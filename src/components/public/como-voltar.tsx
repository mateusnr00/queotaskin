"use client";

// A saída da tela de espera.
//
// Tabulando dentro do <main> dessa página havia dois pontos de parada, e os
// dois eram ações: copiar o código e verificar o pagamento. Nenhum link para
// a campanha, nenhum para "Meus títulos", que existe e já lista reservas
// pendentes. Quem fecha a aba perde um cuid de vinte e cinco caracteres que
// ninguém redigita, e o pagamento fica órfão.
//
// O texto muda com quem está comprando, porque a promessa tem que ser
// verdadeira nos dois casos: `Reservation.userId` é opcional, existe compra
// anônima, e mandar um visitante sem conta para "Meus títulos" é mandá-lo
// para uma tela de login que não vai reconhecê-lo. Para esse, o que resolve
// é guardar o endereço, e é isso que o botão faz.

import { useState } from "react";
import Link from "next/link";
import { Check, Link2, TicketCheck } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

const FOCO =
  "rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function ComoVoltar({ temConta }: { temConta: boolean }) {
  const [copiado, setCopiado] = useState(false);

  async function copiarEndereco() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiado(true);
      toast.success("Endereço copiado. Guarde para voltar ao pagamento");
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      toast.error("Não foi possível copiar. Salve a página nos favoritos");
    }
  }

  return (
    <p className="text-center text-xs leading-relaxed text-muted-foreground">
      Fechou a página sem querer?{" "}
      {temConta ? (
        <>
          Este pedido continua em{" "}
          <Link
            href="/meus-titulos"
            className={cn(
              "inline-flex items-center gap-1 font-semibold text-foreground underline underline-offset-4 hover:text-primary",
              FOCO
            )}
          >
            <TicketCheck className="h-3.5 w-3.5" aria-hidden />
            Meus títulos
          </Link>
          .
        </>
      ) : (
        <>
          Você comprou sem conta, então só se volta por este endereço.{" "}
          <button
            type="button"
            onClick={copiarEndereco}
            className={cn(
              "inline-flex items-center gap-1 font-semibold text-foreground underline underline-offset-4 hover:text-primary",
              FOCO
            )}
          >
            {copiado ? (
              <Check className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Link2 className="h-3.5 w-3.5" aria-hidden />
            )}
            {copiado ? "Endereço copiado" : "Copiar o endereço"}
          </button>
        </>
      )}
    </p>
  );
}

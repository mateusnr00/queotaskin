"use client";

// Botão "Marcar como paga" no admin, usado quando o webhook do gateway
// falhou e o admin precisa confirmar manualmente. Pede confirmação com
// dialog do browser pra evitar clique acidental.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";

import { markReservationPaidAction } from "@/server/actions/reservations";
import { Button } from "@/components/ui/button";

interface Props {
  reservationId: string;
  participantName: string;
}

export function MarkReservationPaidButton({
  reservationId,
  participantName,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function onClick() {
    if (!confirming) {
      setConfirming(true);
      // Auto-reset após 4s caso o admin desista.
      setTimeout(() => setConfirming(false), 4000);
      return;
    }
    startTransition(async () => {
      const result = await markReservationPaidAction({ reservationId, motivo: "override manual", totp: "" });
      if (!result.ok) {
        toast.error(result.error);
        setConfirming(false);
        return;
      }
      const recreated = result.data?.recreatedTickets;
      if (recreated && recreated.length > 0) {
        toast.success(
          `${participantName}: marcada como paga. Números recriados: ${recreated
            .map((n) => String(n).padStart(2, "0"))
            .join(", ")}`,
          { duration: 8000 }
        );
      } else {
        toast.success(`Reserva de ${participantName} marcada como paga`);
      }
      setConfirming(false);
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant={confirming ? "default" : "outline"}
      size="sm"
      onClick={onClick}
      disabled={isPending}
      title="Marcar como paga manualmente"
    >
      <CheckCircle2 className="h-4 w-4 mr-1.5" />
      {isPending
        ? "Marcando..."
        : confirming
        ? "Confirmar?"
        : "Marcar paga"}
    </Button>
  );
}

"use client";

// Override manual de pagamento. CRITICAL: exige motivo + step-up (MFA). O
// backend (markReservationPaidAction) recusa sem step-up; esta UI apenas
// coleta a prova. Pular a UI e chamar a action sem step-up FALHA.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";

import { markReservationPaidAction } from "@/server/actions/reservations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminStepUp } from "@/components/admin/admin-step-up";

interface Props {
  reservationId: string;
  participantName: string;
}

export function MarkReservationPaidButton({ reservationId, participantName }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");

  function executar(totp: string) {
    startTransition(async () => {
      const result = await markReservationPaidAction({ reservationId, motivo, totp });
      if (!result.ok) { toast.error(result.error); return; }
      const recriados = result.data?.recreatedTickets;
      toast.success(
        recriados && recriados.length > 0
          ? `${participantName}: marcada como paga. Números recriados: ${recriados.map((n) => String(n).padStart(2, "0")).join(", ")}`
          : `Reserva de ${participantName} marcada como paga`,
        { duration: 6000 },
      );
      setAberto(false); setMotivo("");
      router.refresh();
    });
  }

  if (aberto) {
    return (
      <div className="space-y-3">
        <Input placeholder="Motivo do pagamento manual (obrigatório)" value={motivo}
          onChange={(e) => setMotivo(e.target.value)} className="h-10" />
        <AdminStepUp
          titulo="Confirmar pagamento manual"
          pending={isPending}
          onConfirmar={(totp) => { if (motivo.trim().length < 3) { toast.error("Informe o motivo."); return; } executar(totp); }}
          onCancelar={() => { setAberto(false); setMotivo(""); }}
        />
      </div>
    );
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={() => setAberto(true)} disabled={isPending}
      title="Marcar como paga manualmente">
      <CheckCircle2 className="h-4 w-4 mr-1.5" />
      Marcar paga
    </Button>
  );
}

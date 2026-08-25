"use client";

// Banner exibido na página do comprovante quando a cobrança Pix não foi
// gerada (ex.: env não configurada, gateway recusou, contrato de API
// mudou). Mostra a mensagem real do erro + botão pra tentar novamente.

import { useState, useTransition } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { retryPixForReservationAction } from "@/server/actions/reservations";

interface Props {
  reservationId: string;
  error: string;
}

export function PixError({ reservationId, error }: Props) {
  const [pending, startTransition] = useTransition();
  const [currentError, setCurrentError] = useState(error);

  function onRetry() {
    startTransition(async () => {
      const result = await retryPixForReservationAction(reservationId);
      if (result.ok) {
        toast.success("Pix gerado com sucesso");
        setCurrentError("");
      } else {
        setCurrentError(result.error ?? "Falha ao gerar Pix");
        toast.error(result.error ?? "Falha ao gerar Pix");
      }
    });
  }

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="flex-1 space-y-3">
          <div>
            <p className="font-semibold">Cobrança Pix indisponível</p>
            <p className="mt-1 text-xs">{currentError}</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={onRetry}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${pending ? "animate-spin" : ""}`} />
            {pending ? "Gerando..." : "Tentar novamente"}
          </Button>
        </div>
      </div>
    </div>
  );
}

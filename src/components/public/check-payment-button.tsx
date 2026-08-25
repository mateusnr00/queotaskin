"use client";

// Botão "Já paguei". Força consulta de status no gateway (ignora o
// throttle de 15s). Usado quando o webhook não chegou e o polling
// passivo ainda não confirmou.

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { checkPaymentStatusAction } from "@/server/actions/reservations";

interface Props {
  reservationId: string;
}

export function CheckPaymentButton({ reservationId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onCheck() {
    startTransition(async () => {
      const result = await checkPaymentStatusAction(reservationId);
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível verificar");
        return;
      }
      if (result.data?.status === "APPROVED") {
        toast.success("Pagamento confirmado!");
        router.refresh();
      } else if (result.data?.status === "REJECTED") {
        toast.error("Pagamento recusado pelo gateway");
        router.refresh();
      } else {
        toast.info(
          "Ainda não consta como pago no gateway. Tente de novo em alguns segundos."
        );
      }
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className="w-full"
      onClick={onCheck}
      disabled={pending}
    >
      {pending ? (
        <>
          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          Verificando...
        </>
      ) : (
        <>
          <CheckCircle2 className="mr-2 h-4 w-4" />
          Já paguei, verificar
        </>
      )}
    </Button>
  );
}

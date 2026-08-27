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

  // Discreto de propósito: é a saída de emergência para quando o webhook
  // demora, não a ação da tela. Cheio e do mesmo tamanho do "Copiar código",
  // competia com ele e convidava a pessoa a clicar antes de pagar.
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-9 w-full text-xs text-muted-foreground hover:text-foreground"
      onClick={onCheck}
      disabled={pending}
    >
      {pending ? (
        <>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          Verificando...
        </>
      ) : (
        <>
          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
          Já paguei, verificar agora
        </>
      )}
    </Button>
  );
}

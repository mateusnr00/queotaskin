"use client";

// Componente sentinela: enquanto a reserva está PENDING, força um
// router.refresh() a cada N segundos. Quando o webhook do SyncPay
// confirma o pagamento e marca a Reservation como PAID, o próximo
// refresh server-side rerenderiza a página com o badge "Pago".
//
// O componente desmonta naturalmente quando o pai re-renderiza com
// status diferente (ele só é montado quando status === "PENDING").

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface Props {
  intervalMs?: number;
}

export function PaymentPoller({ intervalMs = 6000 }: Props) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}

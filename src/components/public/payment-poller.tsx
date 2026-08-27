"use client";

// Componente sentinela: enquanto a reserva está PENDING, força um
// router.refresh() de tempos em tempos. Quando o webhook do SyncPay
// confirma o pagamento e marca a Reservation como PAID, o próximo
// refresh server-side rerenderiza a página com o estado "Pago".
//
// O componente desmonta naturalmente quando o pai re-renderiza com
// status diferente (ele só é montado quando status === "PENDING").
//
// Duas correções em relação ao setInterval fixo de 6s que havia aqui:
//
// 1. Ele batia com a aba escondida. E é exatamente aí que a pessoa está:
//    ela saiu para o app do banco. Numa reserva de quinze minutos dava até
//    cerca de cento e cinquenta refreshes RSC, quase todos para uma tela
//    que ninguém está olhando: servidor e bateria pagando por nada.
//    Agora não busca escondido, e busca uma vez assim que a aba volta,
//    que é o instante em que a resposta importa.
//
// 2. O intervalo era o mesmo do primeiro ao último minuto. Pagamento Pix
//    cai em segundos quando cai; passados os dois primeiros minutos, quem
//    ainda está aqui está com algum problema, e insistir de seis em seis
//    segundos não resolve mais rápido. Depois desse ponto o passo afrouxa.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface Props {
  /** Passo enquanto o pagamento é recente. */
  intervalMs?: number;
  /** Passo depois de `rapidoAteMs`. */
  intervaloLongoMs?: number;
  /** Por quanto tempo vale o passo curto. */
  rapidoAteMs?: number;
}

export function PaymentPoller({
  intervalMs = 6_000,
  intervaloLongoMs = 15_000,
  rapidoAteMs = 120_000,
}: Props) {
  const router = useRouter();

  useEffect(() => {
    const inicio = Date.now();
    let id: ReturnType<typeof setTimeout>;

    // Cadeia de timeouts em vez de setInterval, porque o passo muda no meio.
    function agendar() {
      const passo =
        Date.now() - inicio < rapidoAteMs ? intervalMs : intervaloLongoMs;
      id = setTimeout(() => {
        if (!document.hidden) router.refresh();
        agendar();
      }, passo);
    }
    agendar();

    function aoTrocarDeVisibilidade() {
      if (document.hidden) return;
      // Voltou para a aba: responde na hora e reinicia a contagem, para não
      // buscar de novo um segundo depois só porque o timer estava no fim.
      clearTimeout(id);
      router.refresh();
      agendar();
    }

    document.addEventListener("visibilitychange", aoTrocarDeVisibilidade);
    return () => {
      clearTimeout(id);
      document.removeEventListener("visibilitychange", aoTrocarDeVisibilidade);
    };
  }, [router, intervalMs, intervaloLongoMs, rapidoAteMs]);

  return null;
}

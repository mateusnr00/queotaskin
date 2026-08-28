"use client";

// Avisa a Meta que uma compra foi concluída.
//
// Fica no comprovante pago, e não no webhook: o evento do navegador é o que
// a Meta associa a quem clicou no anúncio, porque é ali que estão os cookies
// dela. Disparado do servidor, chegaria sem dono e não fecharia o ciclo.
//
// Uma vez por reserva, e não por render. A página do comprovante se atualiza
// sozinha enquanto o pagamento não cai, e sem esta trava a mesma compra
// seria reportada a cada atualização, inflando o retorno do anúncio e
// ensinando a Meta a coisa errada.

import { useEffect } from "react";

import { eventoDaMeta } from "@/components/public/pixel-da-meta";

const CHAVE = "qos_compras_reportadas";

function jaReportada(id: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    const lista = JSON.parse(
      window.sessionStorage.getItem(CHAVE) ?? "[]",
    ) as string[];
    if (lista.includes(id)) return true;
    // Guarda as últimas, e não todas: a lista é de uma aba só e não precisa
    // crescer sem fim.
    window.sessionStorage.setItem(
      CHAVE,
      JSON.stringify([...lista, id].slice(-20)),
    );
    return false;
  } catch {
    // Armazenamento bloqueado: melhor reportar do que perder a conversão.
    return false;
  }
}

export function EventoDeCompra({
  reservationId,
  valor,
  quantidade,
}: {
  reservationId: string;
  valor: number;
  quantidade: number;
}) {
  useEffect(() => {
    if (jaReportada(reservationId)) return;
    eventoDaMeta("Purchase", {
      value: valor,
      currency: "BRL",
      content_type: "product",
      num_items: quantidade,
      order_id: reservationId,
    });
  }, [reservationId, valor, quantidade]);

  return null;
}

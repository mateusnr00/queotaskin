"use client";

// Avisa o servidor que uma página do site foi aberta, e guarda de onde a
// pessoa veio.
//
// Dispara a cada troca de caminho, e não uma vez por sessão: quem entra na
// home, abre um sorteio e volta viu três páginas, e é isso que o painel
// chama de visita. A troca de página no App Router não recarrega o site, e
// sem olhar o caminho o segundo e o terceiro acesso não seriam contados.
//
// keepalive porque o aviso costuma sair no mesmo instante em que a pessoa
// clica para outro lugar: sem ele o navegador cancela a requisição ao
// trocar de página, e justamente a visita mais curta seria a que sumiria.

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { guardarOuRecuperarMarcas } from "@/lib/utm";

export function ContadorDeVisita() {
  const caminho = usePathname();
  const busca = useSearchParams();
  // Guarda o último caminho contado para o modo estrito do React, que monta
  // o componente duas vezes em desenvolvimento, não contar em dobro.
  const ultimo = useRef<string | null>(null);

  useEffect(() => {
    // A origem é guardada NA CHEGADA, e não na hora de reservar.
    //
    // Quem clica no anúncio cai no sorteio com as marcas na URL, navega para
    // outra página e só então compra. A leitura acontecia só no envio da
    // reserva, quando a URL já era outra: medido, o utm chegava vazio.
    guardarOuRecuperarMarcas(new URLSearchParams(busca.toString()));

    if (ultimo.current === caminho) return;
    ultimo.current = caminho;
    fetch("/api/visita", { method: "POST", keepalive: true }).catch(() => {
      // Contador é secundário: se falhar, a pessoa não pode nem saber.
    });
  }, [caminho, busca]);

  return null;
}

"use client";

// Troca o título da aba enquanto esta tela está montada e devolve o
// original ao sair.
//
// Por que isto existe: a tela de pagamento nasceu para ser abandonada. A
// pessoa sai para o app do banco e volta para uma fileira de abas, e todas
// as do site se chamavam "Comprovante de reserva · QuéOta Skin", que na
// largura de uma aba vira "Comprovante d...". O que ela precisa ler dali é
// quanto falta e quanto pagar, e o título é a única parte da tela que ela
// enxerga sem trocar de aba.
//
// Por isso o texto do estado pendente não leva o nome do site: cada
// caractere gasto no sufixo é um caractere a menos do relógio.

import { useEffect, useState } from "react";

/**
 * Mantém `document.title` igual a `texto` enquanto o componente vive.
 * Passar `null` deixa o título em paz.
 */
export function useTituloDaAba(texto: string | null) {
  // Capturado no render, e não num efeito, porque o efeito abaixo já teria
  // sobrescrito o título antes de qualquer cleanup rodar. Na hidratação o
  // valor lido é o que o Next serviu; no SSR não há document e fica vazio,
  // que é inofensivo: só se restaura o que se leu.
  const [original] = useState(() =>
    typeof document === "undefined" ? "" : document.title
  );

  useEffect(() => {
    if (!texto) return;
    document.title = texto;

    // O Next escreve o <title> vindo do `metadata` da rota durante o commit,
    // e esse commit pode acontecer depois deste efeito: medido, o estado
    // pago voltava para "Comprovante de reserva · QuéOta Skin" logo após a
    // hidratação. O pendente escapava por acidente, porque o cronômetro
    // reescreve o título a cada segundo e ganhava a corrida.
    //
    // Em vez de tentar chegar depois com um timeout, que é adivinhação,
    // observa o <head>: se alguém trocar o título, reescreve. Escrever de
    // dentro do observador não gera laço, porque na segunda passagem o
    // título já é o esperado e nada acontece.
    const observador = new MutationObserver(() => {
      if (document.title !== texto) document.title = texto;
    });
    observador.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => observador.disconnect();
  }, [texto]);

  // Restauração por último de propósito: na desmontagem o React roda as
  // limpezas na ordem em que os efeitos foram declarados, então o observador
  // acima já se desligou quando esta linha devolve o título. Na ordem
  // inversa, ele desfaria a restauração.
  useEffect(() => {
    if (!original) return;
    return () => {
      document.title = original;
    };
  }, [original]);
}

/** Versão declarativa, para estados cujo título não muda com o tempo. */
export function TituloDaAba({ texto }: { texto: string }) {
  useTituloDaAba(texto);
  return null;
}

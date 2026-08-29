"use client";

// O som da transmissão, sintetizado na hora.
//
// Sem arquivo de áudio: são três sons curtos, e um oscilador resolve os três
// com zero bytes de download. Numa página que abre no celular alguns minutos
// antes do sorteio, isso importa mais do que o timbre.
//
// AUTOPLAY
//
// Navegador não deixa tocar som antes de a pessoa interagir, e está certo.
// Por isso o contexto de áudio só nasce dentro do clique no botão de ligar o
// som, que é o gesto que o navegador aceita. Enquanto ninguém clicar, nada é
// criado e nada toca.
//
// E o som é decoração: tudo o que ele diz, a tela também diz. Quem estiver no
// mudo, no ônibus, ou com leitor de tela não perde nada.

import { useCallback, useEffect, useRef, useState } from "react";

type Efeito = "tique" | "tique-final" | "rolagem" | "revelacao";

interface JanelaComAudio extends Window {
  webkitAudioContext?: typeof AudioContext;
}

export interface ControleDeSom {
  ligado: boolean;
  alternar: () => void;
  /** Toca um efeito. Silencioso quando o som está desligado. */
  tocar: (efeito: Efeito) => void;
}

export function useSom(): ControleDeSom {
  const [ligado, setLigado] = useState(false);
  const contexto = useRef<AudioContext | null>(null);

  const alternar = useCallback(() => {
    setLigado((antes) => {
      const agora = !antes;
      if (agora && !contexto.current) {
        const Fabrica =
          window.AudioContext ?? (window as JanelaComAudio).webkitAudioContext;
        if (Fabrica) contexto.current = new Fabrica();
      }
      // O iOS entrega o contexto suspenso mesmo criado no clique.
      void contexto.current?.resume();
      return agora;
    });
  }, []);

  const tocar = useCallback(
    (efeito: Efeito) => {
      const ctx = contexto.current;
      if (!ligado || !ctx) return;

      const agora = ctx.currentTime;
      const osc = ctx.createOscillator();
      const volume = ctx.createGain();
      osc.connect(volume);
      volume.connect(ctx.destination);

      // Cada efeito é um envelope curto. Volumes baixos de propósito: isto
      // toca no fone de alguém que não escolheu o volume.
      switch (efeito) {
        case "tique":
          osc.type = "sine";
          osc.frequency.setValueAtTime(880, agora);
          volume.gain.setValueAtTime(0.08, agora);
          volume.gain.exponentialRampToValueAtTime(0.001, agora + 0.08);
          osc.start(agora);
          osc.stop(agora + 0.09);
          break;
        case "tique-final":
          // Os dez últimos segundos: mesma batida, uma oitava acima.
          osc.type = "sine";
          osc.frequency.setValueAtTime(1320, agora);
          volume.gain.setValueAtTime(0.14, agora);
          volume.gain.exponentialRampToValueAtTime(0.001, agora + 0.12);
          osc.start(agora);
          osc.stop(agora + 0.13);
          break;
        case "rolagem":
          osc.type = "square";
          osc.frequency.setValueAtTime(220, agora);
          volume.gain.setValueAtTime(0.03, agora);
          volume.gain.exponentialRampToValueAtTime(0.001, agora + 0.04);
          osc.start(agora);
          osc.stop(agora + 0.05);
          break;
        case "revelacao":
          osc.type = "triangle";
          osc.frequency.setValueAtTime(523.25, agora);
          osc.frequency.exponentialRampToValueAtTime(1046.5, agora + 0.35);
          volume.gain.setValueAtTime(0.16, agora);
          volume.gain.exponentialRampToValueAtTime(0.001, agora + 0.9);
          osc.start(agora);
          osc.stop(agora + 0.95);
          break;
      }
    },
    [ligado],
  );

  useEffect(() => {
    return () => {
      void contexto.current?.close();
      contexto.current = null;
    };
  }, []);

  return { ligado, alternar, tocar };
}

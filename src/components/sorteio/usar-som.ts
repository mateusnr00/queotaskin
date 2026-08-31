"use client";

// O som da transmissão.
//
// Nasceu sintetizado: três sons curtos que um oscilador resolve com zero
// bytes de download. Numa página que abre no celular alguns minutos antes do
// sorteio, isso importa mais do que o timbre, e continua sendo o padrão.
//
// O que mudou é que cada momento pode ter um arquivo próprio, cadastrado no
// painel (vinheta, aplauso, trilha de suspense). Momento sem arquivo continua
// no oscilador, então a transmissão nunca fica muda por falta de upload, e
// quem não quiser som nenhum desliga tudo em Configurações.
//
// AUTOPLAY
//
// Navegador não deixa tocar som antes de a pessoa interagir, e está certo.
// Por isso tanto o contexto de áudio quanto os arquivos só são criados e
// destravados dentro do clique no botão de ligar o som, que é o gesto que o
// navegador aceita. Enquanto ninguém clicar, nada é criado e nada toca.
//
// E o som é decoração: tudo o que ele diz, a tela também diz. Quem estiver no
// mudo, no ônibus, ou com leitor de tela não perde nada.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Efeito = "tique" | "tique-final" | "rolagem" | "revelacao";

/** Os arquivos cadastrados no painel. Nulo = som sintetizado. */
export interface SonsDoSorteio {
  /** Desligado, o botão de som some e nada toca. */
  ativo: boolean;
  contagem: string | null;
  contagemFinal: string | null;
  rolagem: string | null;
  revelacao: string | null;
}

export const SEM_SONS: SonsDoSorteio = {
  ativo: true,
  contagem: null,
  contagemFinal: null,
  rolagem: null,
  revelacao: null,
};

interface JanelaComAudio extends Window {
  webkitAudioContext?: typeof AudioContext;
}

export interface ControleDeSom {
  /** Falso quando o painel desligou o som: não mostre o botão. */
  disponivel: boolean;
  ligado: boolean;
  alternar: () => void;
  /** Toca um efeito. Silencioso quando o som está desligado. */
  tocar: (efeito: Efeito) => void;
}

const ARQUIVO_DO_EFEITO: Record<Efeito, keyof Omit<SonsDoSorteio, "ativo">> = {
  tique: "contagem",
  "tique-final": "contagemFinal",
  rolagem: "rolagem",
  revelacao: "revelacao",
};

export function useSom(sons: SonsDoSorteio): ControleDeSom {
  const [ligado, setLigado] = useState(false);
  const contexto = useRef<AudioContext | null>(null);
  const elementos = useRef(new Map<Efeito, HTMLAudioElement>());

  // Os campos entram um a um nas dependências, e não o objeto inteiro: a
  // transmissão redesenha quatro vezes por segundo, e depender da identidade
  // do objeto recriaria os elementos de áudio no meio da contagem se algum
  // dia ele passar a ser montado no render.
  const { ativo, contagem, contagemFinal, revelacao } = sons;
  const rolagemUrl = sons.rolagem;
  const arquivos = useMemo(
    () => ({
      ativo,
      contagem,
      contagemFinal,
      rolagem: rolagemUrl,
      revelacao,
    }),
    [ativo, contagem, contagemFinal, rolagemUrl, revelacao],
  );

  const pararRolagem = useCallback(() => {
    const el = elementos.current.get("rolagem");
    if (!el) return;
    el.pause();
    el.currentTime = 0;
  }, []);

  const alternar = useCallback(() => {
    setLigado((antes) => {
      const agora = !antes;
      if (!agora) {
        for (const el of elementos.current.values()) {
          el.pause();
          el.currentTime = 0;
        }
        return false;
      }

      if (!contexto.current) {
        const Fabrica =
          window.AudioContext ?? (window as JanelaComAudio).webkitAudioContext;
        if (Fabrica) contexto.current = new Fabrica();
      }
      // O iOS entrega o contexto suspenso mesmo criado no clique.
      void contexto.current?.resume();

      // Os arquivos são destravados AQUI, no gesto: tocar e pausar na hora
      // dá ao navegador o consentimento que ele exige, e depois disso a
      // transmissão consegue disparar cada som na hora certa sozinha.
      for (const efeito of Object.keys(ARQUIVO_DO_EFEITO) as Efeito[]) {
        const url = arquivos[ARQUIVO_DO_EFEITO[efeito]];
        if (!url || elementos.current.has(efeito)) continue;
        const el = new Audio(url);
        el.preload = "auto";
        // A rolagem repete do começo do giro até o número aparecer. Um
        // arquivo disparado a cada título que passa viraria ruído sobreposto.
        el.loop = efeito === "rolagem";
        el.volume = efeito === "rolagem" ? 0.45 : 0.7;
        void el
          .play()
          .then(() => {
            el.pause();
            el.currentTime = 0;
          })
          .catch(() => {
            // Sem permissão ainda: o arquivo continua servindo, só não fica
            // pré-destravado. Não há o que fazer aqui além de não quebrar.
          });
        elementos.current.set(efeito, el);
      }
      return true;
    });
  }, [arquivos]);

  const tocarArquivo = useCallback((efeito: Efeito): boolean => {
    const el = elementos.current.get(efeito);
    if (!el) return false;
    if (efeito === "rolagem") {
      // Já está girando: deixa seguir, em vez de reiniciar a cada título.
      if (!el.paused) return true;
    } else {
      el.currentTime = 0;
    }
    void el.play().catch(() => {});
    return true;
  }, []);

  const tocar = useCallback(
    (efeito: Efeito) => {
      if (!ligado || !arquivos.ativo) return;

      // O número na tela encerra o giro, tenha ele vindo de arquivo ou não.
      if (efeito === "revelacao") pararRolagem();

      if (tocarArquivo(efeito)) return;

      const ctx = contexto.current;
      if (!ctx) return;

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
    [ligado, arquivos, pararRolagem, tocarArquivo],
  );

  useEffect(() => {
    const abertos = elementos.current;
    return () => {
      for (const el of abertos.values()) {
        el.pause();
        el.src = "";
      }
      abertos.clear();
      void contexto.current?.close();
      contexto.current = null;
    };
  }, []);

  return { disponivel: arquivos.ativo, ligado, alternar, tocar };
}

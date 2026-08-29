"use client";

// O carretel do sorteio: títulos passando na vertical até parar num.
//
// Substituiu um contador que trocava dígitos no lugar. A diferença não é
// enfeite: dígito trocando é um número aleatório piscando, e não se parece com
// nada; um carretel que corre e freia é o gesto de tirar um papel do pote, que
// é o que está acontecendo. E a freada dá tempo de a tensão subir, que era o
// que faltava.
//
// NADA AQUI DECIDE COISA ALGUMA. Os títulos que passam são uma amostra dos que
// disputaram, entregue pelo servidor só para a fita ter números de verdade. O
// vencedor foi escolhido, gravado e assinado antes do primeiro quadro. Quando
// ele chega, o carretel para nele; enquanto não chega, ele gira.
//
// A DESACELERAÇÃO
//
// Cada passo demora `48 + fração^3.4 * 380` milissegundos. O expoente alto é o
// que faz quase nada mudar no primeiro terço e a freada inteira acontecer no
// fim, que é onde ela vira tensão. Linear parece defeito, como se a página
// estivesse travando.

import { useEffect, useRef, useState } from "react";

import { casasDoTitulo } from "@/lib/titulo";

/** Altura de cada linha. Três visíveis: a de cima, a do meio e a de baixo. */
const ALTURA = 62;
const VISIVEIS = 3;
/** Quantos passos até parar. Junto com a curva, dá pouco mais de três segundos. */
const PASSOS = 25;

function preencher(numero: number, casas: number): string {
  return String(numero).padStart(casas, "0");
}

function montarFita(amostra: readonly number[], total: number): number[] {
  const bolo =
    amostra.length > 0
      ? amostra
      : Array.from({ length: 40 }, () => 1 + Math.floor(Math.random() * total));
  return Array.from(
    { length: PASSOS },
    () => bolo[Math.floor(Math.random() * bolo.length)],
  );
}

export function CarretelDeTitulos({
  totalNumbers,
  /** Amostra de títulos que disputaram, para a fita não ser inventada. */
  amostra,
  /** O número real. Enquanto nulo, o carretel gira. */
  numeroFinal,
  /** Chamado a cada passo, para o efeito sonoro. */
  aoPassar,
}: {
  totalNumbers: number;
  amostra: readonly number[];
  numeroFinal: number | null;
  aoPassar?: () => void;
}) {
  const casas = casasDoTitulo(totalNumbers);
  const [fita] = useState(() => montarFita(amostra, totalNumbers));
  const [passo, setPasso] = useState(0);
  const [duracao, setDuracao] = useState(55);

  const passarRef = useRef(aoPassar);
  useEffect(() => {
    passarRef.current = aoPassar;
  });

  useEffect(() => {
    if (numeroFinal != null) return;
    // Quem pediu menos movimento não vê a fita correr. O TEMPO do sorteio não
    // muda: a revelação continua no mesmo segundo para todo mundo.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const alvo = fita.length - 1;
    let cancelado = false;
    let id: ReturnType<typeof setTimeout>;

    const andar = (n: number) => {
      if (cancelado) return;
      const fracao = n / alvo;
      setPasso(n);
      setDuracao(Math.round(50 + fracao ** 3.4 * 360));
      passarRef.current?.();
      if (n >= alvo) return;
      id = setTimeout(() => andar(n + 1), Math.round(48 + fracao ** 3.4 * 380));
    };
    andar(0);

    return () => {
      cancelado = true;
      clearTimeout(id);
    };
  }, [fita.length, numeroFinal]);

  // Quando o número real chega, ele vira a linha do meio e a fita para.
  const linhas =
    numeroFinal != null
      ? [fita[Math.max(0, passo - 1)], numeroFinal, fita[0]]
      : fita;
  const indice = numeroFinal != null ? 1 : passo;
  const deslocamento = -(indice - 1) * ALTURA;
  const mascara =
    "linear-gradient(180deg, transparent, #000 24%, #000 76%, transparent)";

  return (
    <div className="relative w-full" aria-hidden>
      <div
        className="relative overflow-hidden"
        style={{
          height: ALTURA * VISIVEIS,
          WebkitMaskImage: mascara,
          maskImage: mascara,
        }}
      >
        {/* A varredura que desce pela janela enquanto a fita corre. Some no
            instante em que o número para, senão continuaria passando por cima
            do resultado. */}
        {numeroFinal == null && (
          <span className="carretel-varredura pointer-events-none absolute inset-x-0 top-0 z-[2] h-28" />
        )}

        <div
          style={{
            transform: `translateY(${deslocamento}px)`,
            transition: `transform ${duracao}ms cubic-bezier(0.16, 1, 0.3, 1)`,
          }}
        >
          {linhas.map((numero, i) => {
            const ativo = i === indice;
            return (
              <div
                key={`${i}-${numero}`}
                className="flex items-center justify-center font-mono font-black tabular-nums transition-[opacity,transform] duration-200"
                style={{
                  height: ALTURA,
                  opacity: ativo ? 1 : 0.26,
                  transform: ativo ? "scale(1)" : "scale(0.84)",
                  fontSize: ativo ? 40 : 30,
                  color: ativo ? "#fbbf24" : "#fff",
                }}
              >
                {preencher(numero, casas)}
              </div>
            );
          })}
        </div>
      </div>

      {/* A moldura da posição do meio: é ela que diz onde o título vai parar. */}
      <div
        className="pointer-events-none absolute inset-x-0 rounded-2xl border-2 border-amber-400/70"
        style={{
          top: ALTURA,
          height: ALTURA,
          boxShadow:
            "0 0 26px rgba(251,191,36,0.28), inset 0 0 18px rgba(251,191,36,0.18)",
        }}
      />
    </div>
  );
}


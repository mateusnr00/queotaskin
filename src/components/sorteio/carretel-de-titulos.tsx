"use client";

// O carretel do sorteio: títulos passando na vertical até parar no vencedor.
//
// NADA AQUI DECIDE COISA ALGUMA. Os títulos que passam são uma amostra dos que
// disputaram, entregue pelo servidor só para a fita ter números de verdade. O
// vencedor foi escolhido, gravado e assinado antes do primeiro quadro. O que
// este componente faz é ATERRISSAR nele.
//
// O DEFEITO QUE ISTO CONSERTA
//
// A fita tinha vinte e cinco passos e desacelerava até o último, que era um
// número qualquer da amostra. Ela parava ali, esperava o resultado chegar do
// servidor, e então o número trocava de repente para o vencedor. Foi
// exatamente o que se viu: parou no 039 e virou 080 do nada. Duas coisas
// erradas ao mesmo tempo, e a segunda pior que a primeira: o movimento
// quebrava, e o número em que a fita parou não era o que ganhou.
//
// COMO FUNCIONA AGORA
//
// Duas fases, e a segunda só começa quando o resultado chega.
//
// 1. GIRANDO. A fita corre em velocidade constante, sem fim e sem alvo. Não
//    existe "último item" para ela travar: enquanto o servidor não respondeu,
//    ela roda. Dura o que tiver que durar.
//
// 2. ATERRISSANDO. O vencedor chega, e aí a fita ganha um trecho final com
//    ele no fim. Os últimos passos vão freando com a curva de sempre, e o
//    movimento morre exatamente no número que ganhou.
//
// O número em que a fita para é o número que ganhou. Não há troca, não há
// corte, e a única coisa que a chegada do resultado faz é dizer onde frear.

import { useEffect, useRef, useState } from "react";

import { casasDoTitulo } from "@/lib/titulo";

/** Altura de cada linha. Três visíveis: a de cima, a do meio e a de baixo. */
const ALTURA = 62;
const VISIVEIS = 3;

/** Intervalo entre trocas enquanto a fita só corre. */
const PASSO_GIRANDO = 55;

/** Quantos passos a frenagem leva depois que o vencedor chega. */
const PASSOS_DA_FREADA = 9;

/**
 * A curva da freada.
 *
 * De 60ms a 620ms entre passos, com expoente 3. Quase nada muda nos primeiros
 * passos e a freada inteira acontece nos últimos, que é onde ela vira tensão.
 * Linear pareceria defeito, como se a página estivesse travando.
 */
function intervaloDaFreada(passo: number): number {
  const fracao = passo / PASSOS_DA_FREADA;
  return Math.round(60 + fracao ** 3 * 560);
}

function preencher(numero: number, casas: number): string {
  return String(numero).padStart(casas, "0");
}

/** Um título qualquer da amostra, para a fita ter números de verdade. */
function sortear(amostra: readonly number[], total: number): number {
  if (amostra.length > 0) {
    return amostra[Math.floor(Math.random() * amostra.length)];
  }
  return 1 + Math.floor(Math.random() * Math.max(1, total));
}

export function CarretelDeTitulos({
  totalNumbers,
  /** Amostra de títulos que disputaram, para a fita não ser inventada. */
  amostra,
  /** O vencedor. Enquanto nulo, a fita corre sem alvo. */
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

  // A janela mostra três linhas: a que saiu, a do meio e a que entra. Guardar
  // só essas três, e não a fita inteira, é o que permite a fita ser infinita.
  const [linhas, setLinhas] = useState<number[]>(() => [
    sortear(amostra, totalNumbers),
    sortear(amostra, totalNumbers),
    sortear(amostra, totalNumbers),
  ]);
  const [duracao, setDuracao] = useState(PASSO_GIRANDO);
  const [parado, setParado] = useState(false);

  const passarRef = useRef(aoPassar);
  useEffect(() => {
    passarRef.current = aoPassar;
  });

  // O vencedor numa ref, para o laço enxergar a chegada dele sem ser
  // reiniciado: recriar o efeito no meio do giro cortaria o movimento, que é
  // justamente o defeito que este componente veio consertar.
  const vencedorRef = useRef<number | null>(numeroFinal);
  useEffect(() => {
    vencedorRef.current = numeroFinal;
  }, [numeroFinal]);

  useEffect(() => {
    // Quem pediu menos movimento não vê a fita correr. O TEMPO do sorteio não
    // muda: a revelação continua no mesmo segundo para todo mundo.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let cancelado = false;
    let id: ReturnType<typeof setTimeout>;
    // Nulo enquanto gira; vira 0 no passo em que o vencedor aparece e conta
    // até PASSOS_DA_FREADA, quando a fita para nele.
    let freando: number | null = null;

    const andar = () => {
      if (cancelado) return;

      if (freando == null && vencedorRef.current != null) freando = 0;
      const naFreada = freando != null;
      if (naFreada) freando = (freando ?? 0) + 1;

      // No último passo da freada, quem entra é o vencedor. Em qualquer outro,
      // é um título qualquer da amostra.
      const ultimo = naFreada && freando! >= PASSOS_DA_FREADA;
      const entrando = ultimo
        ? vencedorRef.current!
        : sortear(amostra, totalNumbers);

      setLinhas((antes) => [antes[1], antes[2], entrando]);
      setDuracao(naFreada ? intervaloDaFreada(freando!) : PASSO_GIRANDO);
      passarRef.current?.();

      if (ultimo) {
        // Mais dois passos para o vencedor caminhar da última linha até o
        // centro da janela, e aí a fita morre nele.
        id = setTimeout(() => {
          if (cancelado) return;
          setLinhas((antes) => [antes[1], antes[2], sortear(amostra, totalNumbers)]);
          id = setTimeout(() => {
            if (cancelado) return;
            setParado(true);
          }, 420);
        }, 420);
        return;
      }

      id = setTimeout(andar, naFreada ? intervaloDaFreada(freando!) : PASSO_GIRANDO);
    };

    id = setTimeout(andar, PASSO_GIRANDO);
    return () => {
      cancelado = true;
      clearTimeout(id);
    };
    // Roda uma vez e vive até o fim: reiniciar cortaria o movimento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        {!parado && (
          <span className="carretel-varredura pointer-events-none absolute inset-x-0 top-0 z-[2] h-28" />
        )}

        {/* A fita anda uma linha para cima a cada passo, e o React troca o
            conteúdo no fim da transição. O deslocamento é sempre o mesmo,
            então o movimento é uma esteira e não um salto. */}
        <div
          key={linhas.join("-")}
          className="carretel-fita"
          style={{ animationDuration: `${duracao}ms` }}
        >
          {linhas.map((numero, i) => (
            <div
              key={i}
              className="flex items-center justify-center font-mono font-black tabular-nums"
              style={{
                height: ALTURA,
                opacity: i === 1 ? 1 : 0.24,
                fontSize: i === 1 ? 40 : 30,
                color: i === 1 ? "#fff" : "rgba(255,255,255,0.75)",
                textShadow:
                  i === 1 ? "0 0 26px rgba(239,68,68,0.55)" : "none",
              }}
            >
              {preencher(numero, casas)}
            </div>
          ))}
        </div>
      </div>

      {/* A moldura da posição do meio: é ela que diz onde o título vai parar. */}
      <div
        className={`pointer-events-none absolute inset-x-0 rounded-2xl border-2 ${
          parado ? "carretel-moldura-parada" : "border-red-500/60"
        }`}
        style={{
          top: ALTURA,
          height: ALTURA,
          boxShadow: parado
            ? "0 0 34px rgba(239,68,68,0.45), inset 0 0 22px rgba(239,68,68,0.22)"
            : "0 0 22px rgba(239,68,68,0.25), inset 0 0 16px rgba(239,68,68,0.14)",
        }}
      />
    </div>
  );
}

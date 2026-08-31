"use client";

// O bilhete da Raspadinha Premiada.
//
// O CORPO É DOURADO, O TEXTO É ESCURO
//
// A primeira versão era o contrário: bilhete escuro com um fio de ouro na
// borda. A inversão muda tudo, porque um bilhete premiado de verdade é FEITO
// de ouro, não decorado com ouro. Sobre o dourado, o texto precisa ser
// marrom escuro: claro sobre claro some, e é o contraste que faz o papel
// parecer impresso em vez de iluminado.
//
// O que constrói o objeto físico, em ordem de importância:
//
//   corpo em ouro         gradiente de sete paradas, nunca cor chapada
//   moldura dupla         dois fios com folga entre eles, um escuro e um
//                         claro, que é o que separa impresso de recortado
//   janela recortada      a área raspável é um buraco no ouro, com sombra
//                         caindo para dentro
//   texto vertical        nas duas laterais, como bilhete de talão
//   ornamentos            estrelas no topo e no rodapé, cantos marcados
//
// Nada de neon, nada de roxo, nada de emoji.

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { desenharChamada, desenharPelicula } from "./pelicula";
import { LIMITE_DE_RASPAGEM, useRaspagem } from "./use-raspagem";
import { Particulas, type ControleDeParticulas } from "./particulas";
import { desgasteCurto, separarDesgaste } from "@/lib/premio-nome";
import { cn } from "@/lib/utils";

export type EstadoDoBilhete =
  | "disponivel"
  | "raspando"
  | "revelando"
  | "premiada"
  | "sem-premio";

export interface PremioNoBilhete {
  tipo: "PIX" | "SKIN";
  rotulo: string;
  valor: number | null;
}

/** Abaixo disto, em pixels de CSS, o bilhete perde texto lateral e encolhe a
    tipografia: e a largura em que a lateral vira borrao e rouba a janela. */
const LARGURA_FOLGADA = 260;

/** O marrom da tinta sobre o ouro. */
const TINTA = "text-[#3d2c08]";
const TINTA_FRACA = "text-[#3d2c08]/65";

export function Bilhete({
  numero,
  posicao,
  estado,
  premio,
  aoRevelar,
  compacto: palpiteDeCompacto = false,
}: {
  numero: string;
  posicao: number;
  estado: EstadoDoBilhete;
  premio: PremioNoBilhete | null;
  aoRevelar: () => void;
  /** Na grade os bilhetes encolhem e os ornamentos saem de cena. */
  compacto?: boolean;
}) {
  const revelado = estado === "premiada" || estado === "sem-premio";
  const ganhou = estado === "premiada";
  const [saindo, setSaindo] = useState(false);
  const [impacto, setImpacto] = useState(false);

  // O QUE SAIU JÁ APARECE ENQUANTO A PESSOA RASPA.
  //
  // Antes o sorteio só era pedido ao servidor quando a raspagem TERMINAVA, e
  // até lá não havia nada atrás da película: quem raspava via a janela ficar
  // branca e o resultado surgir de uma vez no fim, que é o oposto de uma
  // raspadinha. Agora o pedido sai no primeiro traço e a resposta chega com o
  // dedo ainda na tela, então o prêmio vai aparecendo debaixo do que já foi
  // raspado.
  //
  // Este congelado no primeiro render é o que separa "já estava revelado
  // quando a página abriu" de "acabou de revelar agora": no primeiro caso a
  // película nem existe, no segundo ela precisa continuar ali até o gesto
  // terminar, senão o resultado apareceria antes de a pessoa raspar.
  const [nasceuRevelado] = useState(revelado);

  // "Compacto" quer dizer que ESTE bilhete ficou pequeno, e quem sabe isso e
  // a largura medida, nao a quantidade de bilhetes do pedido: no telefone a
  // grade tem uma coluna so, entao um pedido de oito ainda renderiza cartoes
  // largos, e contar bilhetes encolheria a tipografia de um cartao folgado.
  // O palpite de quem chama vale como valor inicial, porque no servidor nao
  // ha largura, e trocar por ele evita o pisca no caso comum.
  const refDaMoldura = useRef<HTMLDivElement | null>(null);
  const [compacto, setCompacto] = useState(palpiteDeCompacto);
  useEffect(() => {
    const no = refDaMoldura.current;
    if (!no || typeof ResizeObserver === "undefined") return;
    const observador = new ResizeObserver(([entrada]) => {
      setCompacto(entrada.contentRect.width < LARGURA_FOLGADA);
    });
    observador.observe(no);
    return () => observador.disconnect();
  }, []);
  const particulas = useRef<ControleDeParticulas | null>(null);
  const luz = useRef(0.5);
  const relogios = useRef<ReturnType<typeof setTimeout>[]>([]);

  const depois = useCallback((ms: number, fn: () => void) => {
    relogios.current.push(setTimeout(fn, ms));
  }, []);
  useEffect(
    () => () => {
      for (const r of relogios.current) clearTimeout(r);
    },
    [],
  );

  const pintar = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      desenharPelicula(ctx, w, h, luz.current);
      desenharChamada(ctx, w, h);
    },
    [],
  );

  const concluir = useCallback(() => {
    setImpacto(true);
    depois(130, () => setSaindo(true));
  }, [depois]);

  const { refDoCanvas, comecou, concluiu, revelarSemGesto } = useRaspagem({
    // Não olha mais o estado: o pedido ao servidor troca o estado para
    // "revelando" no meio do gesto, e amarrar o gesto ao estado fazia a
    // raspagem morrer no primeiro traço.
    ativo: !nasceuRevelado,
    // O sorteio sai daqui, no primeiro traço, e não mais no fim.
    aoComecar: aoRevelar,
    aoConcluir: concluir,
    desenharPelicula: pintar,
    aoRaspar: (x, y) => particulas.current?.emitir(x, y),
  });

  function seguirLuz(e: React.PointerEvent) {
    const caixa = e.currentTarget.getBoundingClientRect();
    luz.current = Math.min(
      1,
      Math.max(0, (e.clientX - caixa.left) / caixa.width),
    );
  }

  // A película sai quando o gesto termina, e não quando a resposta chega.
  // O terceiro caso é o "raspar todas" e o botão de revelar: ali o bilhete se
  // resolve sem gesto nenhum, e a película não tem por que ficar.
  const peliculaSaiu =
    nasceuRevelado || saindo || concluiu || (revelado && !comecou);

  return (
    <figure
      className={cn("group relative select-none", ganhou && "bilhete-premiado")}
    >
      <div
        ref={refDaMoldura}
        className={cn(
          "bilhete-dourado relative overflow-hidden rounded-xl shadow-lg shadow-black/40 transition-transform duration-200",
          "md:group-hover:-translate-y-[3px]",
          impacto && "bilhete-impacto",
          ganhou && "ring-2 ring-amber-300/70",
        )}
        style={{ aspectRatio: "1.55 / 1" }}
        onPointerMove={seguirLuz}
      >
        {!revelado && (
          <span
            aria-hidden
            className="bilhete-reflexo pointer-events-none absolute -inset-y-8 left-0 z-10 w-1/4 bg-gradient-to-r from-transparent via-white/45 to-transparent"
          />
        )}
        {ganhou && (
          <span
            aria-hidden
            className="bilhete-varredura pointer-events-none absolute -inset-y-8 left-0 z-30 w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent"
          />
        )}

        {/* A moldura dupla, por sombra interna: dois fios com folga, um
            escuro e um claro. Não é borda, é o desenho impresso na chapa. */}
        <span
          aria-hidden
          className="bilhete-moldura pointer-events-none absolute inset-[3px] rounded-lg"
        />

        {/* O texto de pé nas laterais. Quem decide se ele aparece é a largura
            do próprio bilhete, por container query, e não a quantidade de
            bilhetes do pedido: no telefone a grade tem uma coluna só, então
            um pedido de oito ainda renderiza cartões largos, e contar
            bilhetes tiraria a lateral de um cartão que tem espaço de sobra.
            Abaixo de 260px ele vira borrão e rouba espaço da janela. */}
        {!compacto && (
          <>
            <span
              aria-hidden
              className={cn(
                "bilhete-lateral bilhete-lateral-esquerda pointer-events-none absolute bottom-3 left-[7px] top-3 flex items-center justify-center text-[7px] font-bold uppercase tracking-[0.3em]",
                TINTA_FRACA,
              )}
            >
              Prêmio instantâneo
            </span>
            <span
              aria-hidden
              className={cn(
                "bilhete-lateral pointer-events-none absolute bottom-3 right-[7px] top-3 flex items-center justify-center text-[7px] font-bold uppercase tracking-[0.3em]",
                TINTA_FRACA,
              )}
            >
              Colecionável
            </span>
          </>
        )}

        <div
          className={cn(
            "relative flex h-full flex-col py-2",
            compacto ? "px-3" : "px-5",
          )}
        >
          {/* ================= TOPO ================= */}
          <header className="text-center leading-none">
            <p
              className={cn(
                "font-black tracking-[0.14em]",
                TINTA,
                compacto ? "text-[8px]" : "text-[10px]",
              )}
            >
              <span aria-hidden className="opacity-50">
                {"─ ★ "}
              </span>
              QUÉ OTA?
              <span aria-hidden className="opacity-50">
                {" ★ ─"}
              </span>
            </p>
            <p
              className={cn(
                "mt-[1px] font-bold tracking-[0.42em]",
                TINTA_FRACA,
                compacto ? "text-[6px]" : "text-[7px]",
              )}
            >
              SKIN
            </p>
          </header>

          <h3
            className={cn(
              "mt-1 text-center font-black uppercase leading-none tracking-[0.06em]",
              TINTA,
              compacto ? "text-[9px]" : "text-sm",
            )}
          >
            Raspadinha Premiada
          </h3>

          {/* ============== JANELA RASPÁVEL ============== */}
          {/* min-h é piso de segurança: a janela é flex-1 dentro de uma altura
              fechada pela proporção, e se o topo crescer (fonte grande do
              sistema) o flex-1 chega a zero e o canvas some sem erro nenhum.
              Foi o que aconteceu na primeira medição. */}
          <div
            className={cn(
              "bilhete-janela relative mt-1.5 min-h-[62px] flex-1 overflow-hidden rounded-[3px]",
              compacto ? "mx-0" : "mx-1",
            )}
          >
            <div className="absolute inset-0 bg-[#efe9dc]">
              <Conteudo estado={estado} premio={premio} compacto={compacto} />
            </div>

            {!peliculaSaiu && (
              <Particulas ref={particulas} className="absolute inset-0 z-10" />
            )}

            <canvas
              ref={refDoCanvas}
              aria-hidden
              className={cn(
                "absolute inset-0 z-20 h-full w-full touch-none",
                peliculaSaiu && "pelicula-dissolve",
                !revelado && !comecou && "cursor-grab active:cursor-grabbing",
              )}
            />

            {/* A saída para quem não consegue arrastar. Discreta e fora do
                caminho do gesto: colada no canto, e não sobre a área útil. */}
            {!revelado && !comecou && (
              <button
                type="button"
                onClick={revelarSemGesto}
                className="absolute bottom-0 right-0 z-30 rounded-tl-md bg-[#3d2c08]/75 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-[#f5e6bd] transition-colors hover:bg-[#3d2c08]"
              >
                Revelar
              </button>
            )}
          </div>

          {/* O número do bilhete saiu do rodapé.
              Ele não serve para nada de quem raspa: não é usado para
              reclamar, não entra em conversa com o suporte e não aparece em
              lugar nenhum além dali. Ocupava a última linha do cartão, que é
              justamente a altura que faltava para a janela raspável. O número
              continua no HTML, no aviso de leitor de tela abaixo. */}
        </div>

        {/* A ordem na coleção, no canto. Fica FORA do fluxo para não empurrar
            o topo e roubar altura da janela. */}
        <span
          aria-hidden
          className={cn(
            "absolute left-2 top-2 rounded bg-[#3d2c08]/80 px-1 font-bold tabular-nums text-[#f5e6bd]",
            compacto ? "text-[7px]" : "text-[8px]",
          )}
        >
          {posicao.toString().padStart(2, "0")}
        </span>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {estado === "premiada" && premio
          ? `Bilhete ${numero}: você ganhou ${premio.rotulo}.`
          : estado === "sem-premio"
            ? `Bilhete ${numero}: não foi dessa vez.`
            : ""}
      </p>
    </figure>
  );
}

/** O que aparece atrás da película, na cor de papel. */
function Conteudo({
  estado,
  premio,
  compacto,
}: {
  estado: EstadoDoBilhete;
  premio: PremioNoBilhete | null;
  compacto: boolean;
}) {
  if (estado === "revelando") {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-[#8a6820]" />
      </div>
    );
  }

  if (estado === "premiada" && premio) {
    const { nome, desgaste } = separarDesgaste(premio.rotulo);
    const sigla = desgasteCurto(desgaste);
    return (
      <div className="premio-surge flex h-full flex-col items-center justify-center gap-0.5 px-2 text-center">
        <p
          className={cn(
            "font-bold uppercase tracking-[0.16em] text-[#3d2c08]/70",
            compacto ? "text-[7px]" : "text-[9px]",
          )}
        >
          Você ganhou
        </p>
        {/* O QUE FOI DIGITADO, SEJA O QUE FOR.
            Antes, prêmio marcado como Pix trocava o texto pelo valor em reais
            e ganhava um "no Pix" embaixo. Isso vinha de um seletor que
            obrigava a encaixar todo prêmio em Pix ou skin, e o cadastro deixou
            de ter esse seletor: o prêmio pode ser uma peça de computador, e
            "no Pix" embaixo de uma placa de vídeo seria uma promessa errada.

            O DESGASTE VIRA SIGLA. Escrito por extenso, "(Field-Tested)" come
            metade da janela e empurra o nome da skin para duas ou três linhas
            num espaço de dois centímetros. FT, no canto, diz a mesma coisa
            para quem joga. Texto que não é desgaste conhecido fica como está,
            entre parênteses, porque cortar seria inventar. */}
        <p
          className={cn(
            "font-black leading-none text-[#2a1d04]",
            compacto ? "text-sm" : "text-2xl",
          )}
        >
          {nome}
        </p>
        {sigla ? (
          <span
            className={cn(
              "rounded border border-[#3d2c08]/25 bg-[#3d2c08]/[0.07] px-1 py-px font-bold tracking-wider text-[#3d2c08]/80",
              compacto ? "text-[7px]" : "text-[9px]",
            )}
          >
            {sigla}
          </span>
        ) : (
          desgaste && (
            <span
              className={cn(
                "font-semibold text-[#3d2c08]/70",
                compacto ? "text-[7px]" : "text-[9px]",
              )}
            >
              ({desgaste})
            </span>
          )
        )}
      </div>
    );
  }

  if (estado === "sem-premio") {
    // Sem vermelho, sem cara triste, sem animação de fracasso. O bilhete só
    // assume o estado final: não deu, e ninguém errou nada.
    return (
      <div className="flex h-full flex-col items-center justify-center gap-0.5 px-2 text-center">
        <p
          className={cn(
            "font-bold uppercase tracking-[0.14em] text-[#3d2c08]/75",
            compacto ? "text-[8px]" : "text-[11px]",
          )}
        >
          Não foi dessa vez
        </p>
        {!compacto && (
          <p className="text-[9px] leading-relaxed text-[#3d2c08]/50">
            Essa raspadinha não possui prêmio.
          </p>
        )}
      </div>
    );
  }

  // Antes de raspar não há nada atrás: o resultado ainda não foi sorteado no
  // servidor, e não existe nem aqui nem na resposta que montou esta página.
  return null;
}

export { LIMITE_DE_RASPAGEM };

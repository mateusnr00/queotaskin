"use client";

// As Caixas de Level Up em Minha Conta, e a experiência de abrir uma.
//
// O PRÊMIO JÁ ESTÁ DECIDIDO ANTES DA ANIMAÇÃO COMEÇAR.
//
// O clique chama o servidor, o servidor sorteia com o gerador de
// criptografia, grava e responde. Só então a animação roda, mostrando um
// resultado que já existe no banco. Fechar a aba no meio dela não muda nada:
// recarregar mostra o mesmo multiplicador, porque abrir é uma operação de
// servidor e não um efeito de tela.
//
// A CONTAGEM REGRESSIVA DESENHA, NÃO DECIDE
//
// Ela conta a partir do `expiraEm` que veio do servidor. Relógio de navegador
// adiantado faz o número na tela chegar a zero mais cedo, e não estende nem
// encurta o boost de verdade: quem decide se o prazo passou é a confirmação
// do pagamento, no servidor.

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Gift } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Moldura } from "@/components/ui/moldura";
import { cn } from "@/lib/utils";
import { XpBoostBadge } from "@/components/public/xp-boost-badge";
import { RoletaDeBoost } from "@/components/public/roleta-de-boost";
import { ROTULO_DA_RARIDADE } from "@/lib/xp/caixa-de-level-up";
import { abrirCaixaAction } from "@/server/actions/caixa-de-level-up";

type Raridade = keyof typeof ROTULO_DA_RARIDADE;

export interface CaixaNaTela {
  id: string;
  sourceLevel: number;
  createdAt: string;
}

export interface BoostNaTela {
  boxId: string;
  multiplicador: number;
  raridade: Raridade;
  /** A cor do retrato do drop, gravada na abertura. */
  cor: string;
  sourceLevel: number;
  expiraEm: string;
}

/**
 * Quanto falta, em mm:ss, a partir da data que o servidor mandou.
 *
 * O RELÓGIO SÓ COMEÇA DEPOIS DE MONTAR.
 *
 * `agora` nasce nulo de propósito. O servidor renderiza o traço, o cliente
 * renderiza o traço na primeira passada, e só então o número aparece. Ler
 * `Date.now()` no primeiro render dava um texto no servidor e outro no
 * navegador, o que o React acusa como erro de hidratação (#418) e conserta
 * apagando e redesenhando a árvore.
 *
 * Enquanto não montou, `acabou` é falso: esconder o boost por meio segundo
 * durante a hidratação seria pior que mostrar o traço.
 */
export function useContagem(expiraEm: string | null): {
  texto: string;
  acabou: boolean;
} {
  const [agora, setAgora] = useState<number | null>(null);

  useEffect(() => {
    if (!expiraEm) return;
    // O primeiro valor vai para o tique seguinte, e não direto: chamar
    // setState dentro do efeito, de forma síncrona, encadeia renderizações.
    const primeiro = setTimeout(() => setAgora(Date.now()), 0);
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => {
      clearTimeout(primeiro);
      clearInterval(t);
    };
  }, [expiraEm]);

  if (!expiraEm) return { texto: "", acabou: true };
  if (agora === null) return { texto: "--:--", acabou: false };

  const restam = new Date(expiraEm).getTime() - agora;
  if (restam <= 0) return { texto: "00:00", acabou: true };

  const minutos = Math.floor(restam / 60_000);
  const segundos = Math.floor((restam % 60_000) / 1000);
  return {
    texto: `${String(minutos).padStart(2, "0")}:${String(segundos).padStart(2, "0")}`,
    acabou: false,
  };
}

export function CaixasDeLevelUp({
  caixas,
  boostAtivo,
  possiveis,
}: {
  caixas: CaixaNaTela[];
  boostAtivo: BoostNaTela | null;
  /** Os resultados possíveis, só para compor a fita decorativa da roleta. */
  possiveis: { multiplier: number; color: string }[];
}) {
  const [pendentes, setPendentes] = useState(caixas);
  const [ativo, setAtivo] = useState(boostAtivo);
  const [revelando, setRevelando] = useState<BoostNaTela | null>(null);
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const [, iniciar] = useTransition();

  const contagem = useContagem(ativo?.expiraEm ?? null);

  function abrir(caixa: CaixaNaTela) {
    if (abrindo) return;
    setAbrindo(caixa.id);
    iniciar(async () => {
      const r = await abrirCaixaAction({ boxId: caixa.id });
      setAbrindo(null);
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      const novo: BoostNaTela = {
        boxId: r.boxId,
        multiplicador: r.multiplicador,
        raridade: r.raridade,
        cor: r.cor,
        sourceLevel: r.sourceLevel,
        expiraEm: r.expiraEm,
      };
      setPendentes((antes) => antes.filter((c) => c.id !== caixa.id));
      setAtivo(novo);
      setRevelando(novo);
    });
  }

  // Nada a mostrar: a seção some inteira em vez de virar caixa vazia.
  if (pendentes.length === 0 && !ativo) return null;

  return (
    <>
      <Moldura>
        <section className="space-y-4 p-4 md:p-5">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold">
              <Gift aria-hidden className="h-4 w-4 text-muted-foreground" />
              Recompensas de level
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Cada nível conquistado rende uma caixa. Abrir sorteia um
              multiplicador de XP que vale na próxima compra.
            </p>
          </div>

          {ativo && !contagem.acabou && (
            <BoostEmDestaque boost={ativo} contagem={contagem.texto} />
          )}

          {pendentes.length > 0 && (
            <ul className="grid gap-3 sm:grid-cols-2">
              {pendentes.map((caixa) => (
                <li
                  key={caixa.id}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/[0.08] text-xl">
                    🎁
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">
                      Caixa Level {caixa.sourceLevel}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Recompensa: 1.5x a 3.5x XP
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 shrink-0"
                    disabled={abrindo !== null || (ativo != null && !contagem.acabou)}
                    onClick={() => abrir(caixa)}
                  >
                    {abrindo === caixa.id ? "Abrindo..." : "Abrir caixa"}
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {ativo && !contagem.acabou && pendentes.length > 0 && (
            // Explica o botão desligado antes que alguém ache que quebrou.
            <p className="text-[11px] leading-relaxed text-amber-500">
              Use o boost ativo na próxima compra, ou espere ele expirar, para
              abrir outra caixa.
            </p>
          )}
        </section>
      </Moldura>

      {revelando && (
        <Revelacao
          boost={revelando}
          possiveis={possiveis}
          aoFechar={() => setRevelando(null)}
        />
      )}
    </>
  );
}

/**
 * O boost ativo, dentro da seção de recompensas.
 *
 * A insígnia à esquerda, o prazo à direita, e o texto no meio. A cor é a do
 * retrato, aplicada em traço e número; o fundo fica quase neutro de propósito,
 * porque um bloco inteiro pintado na cor do drop briga com o resto da página
 * e some quando a cor escolhida for clara.
 */
function BoostEmDestaque({
  boost,
  contagem,
}: {
  boost: BoostNaTela;
  contagem: string;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-xl border p-3"
      style={{
        borderColor: `color-mix(in srgb, ${boost.cor} 35%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${boost.cor} 7%, transparent)`,
      }}
    >
      <XpBoostBadge
        multiplier={boost.multiplicador}
        color={boost.cor}
        size="sm"
        decorativo
        className="w-14 sm:w-16"
      />
      <div className="min-w-0 flex-1">
        <p className="text-lg font-black tabular-nums" style={{ color: boost.cor }}>
          {boost.multiplicador}x XP
        </p>
        <p className="text-[11px] text-muted-foreground">
          {ROTULO_DA_RARIDADE[boost.raridade]} · vale na próxima compra
        </p>
      </div>
      <div className="text-right">
        <p className="font-mono text-lg font-bold tabular-nums">{contagem}</p>
        <p className="text-[10px] tracking-wider text-muted-foreground uppercase">
          para usar
        </p>
      </div>
    </div>
  );
}

/**
 * A revelação: a roleta corre e o resultado fica.
 *
 * A ANIMAÇÃO NÃO DECIDE NADA. O prêmio veio do servidor antes desta tela
 * existir; a fita é enfeite montado em volta dele. Fechar no meio, recarregar
 * ou ter `prefers-reduced-motion` ligado dá exatamente o mesmo prêmio.
 *
 * O PRAZO JÁ ESTÁ CORRENDO. Ele começou quando o servidor abriu a caixa, não
 * quando a animação acaba: por isso o contador mostra catorze e pouco quando
 * a fita para, e está certo.
 */
function Revelacao({
  boost,
  possiveis,
  aoFechar,
}: {
  boost: BoostNaTela;
  possiveis: { multiplier: number; color: string }[];
  aoFechar: () => void;
}) {
  const [fase, setFase] = useState<"roleta" | "revelado">("roleta");
  const contagem = useContagem(boost.expiraEm);
  const aoTerminar = useCallback(() => setFase("revelado"), []);
  // O vencedor precisa ser o MESMO objeto entre renders: o contador acima
  // re-renderiza este modal a cada segundo, e um objeto novo a cada vez
  // remontaria a fita da roleta no meio da corrida.
  const vencedor = useMemo(
    () => ({ multiplier: boost.multiplicador, color: boost.cor }),
    [boost.multiplicador, boost.cor],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Resultado da caixa de level up"
    >
      <div
        className={cn(
          // A ABERTURA PEDE LARGURA; A REVELAÇÃO, NÃO.
          //
          // A fita precisa de espaço para caber seis badges e ainda ter
          // margem para o desvanecimento das pontas. O resultado precisa do
          // contrário: um bloco compacto onde badge, raridade, frase e prazo
          // se leem de uma vez. A largura muda entre as duas fases, com
          // transição, porque um salto seco bem no instante do resultado
          // roubaria a atenção do prêmio.
          "relative w-full overflow-hidden rounded-[1.75rem] border bg-[#0e1013] text-center",
          "transition-[max-width,box-shadow] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
          fase === "roleta"
            ? "max-w-3xl px-3 py-3.5 sm:px-5 sm:py-4"
            : "max-w-md px-6 py-6 sm:px-8",
        )}
        style={{
          borderColor: `color-mix(in srgb, ${boost.cor} 40%, transparent)`,
          boxShadow:
            fase === "revelado"
              ? `0 0 52px -14px color-mix(in srgb, ${boost.cor} 75%, transparent)`
              : undefined,
        }}
      >
        {/* O cabeçalho é etiqueta, não título: menor, com o espaçamento de
            letras contido, e sem consumir altura acima da fita. */}
        <p className="text-[9px] font-bold tracking-[0.16em] text-muted-foreground/70 uppercase">
          Caixa de Level Up · Level {boost.sourceLevel}
        </p>

        {fase === "roleta" ? (
          <>
            <RoletaDeBoost
              className="mt-1"
              vencedor={vencedor}
              possiveis={possiveis}
              aoTerminar={aoTerminar}
            />
            {/* Texto, e não uma barra laranja de botão desabilitado: aquilo
                competia com a fita e parecia um controle quebrado. */}
            <p className="text-[10px] font-bold tracking-[0.22em] text-muted-foreground/60 uppercase">
              Abrindo caixa
              <span className="motion-safe:animate-pulse">...</span>
            </p>
          </>
        ) : (
          <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-500">
            {/* O HALO DA ENTRADA.
                Um brilho curto atrás do badge, na cor do retrato, que aparece
                junto com ele e assenta. Fica ATRÁS e em opacidade baixa: o
                objetivo é dar peso ao instante da revelação, não pintar o
                modal. `pointer-events-none` porque é enfeite. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-10 mx-auto h-40 w-40 rounded-full blur-3xl motion-safe:animate-in motion-safe:fade-in motion-safe:duration-700"
              style={{
                backgroundColor: `color-mix(in srgb, ${boost.cor} 26%, transparent)`,
              }}
            />
            {/* O BADGE É O HERÓI. Grande, e colado no que o explica: raridade
                logo abaixo, frase e prazo em seguida, tudo num bloco só.
                Antes havia respiro demais entre eles e o prêmio parecia
                pequeno dentro de um modal grande. */}
            <div className="relative flex justify-center pt-3 pb-1">
              <XpBoostBadge
                multiplier={boost.multiplicador}
                color={boost.cor}
                size="lg"
                className="w-52 sm:w-60"
              />
            </div>
            <p
              className="text-[11px] font-bold tracking-[0.2em] uppercase"
              style={{ color: boost.cor }}
            >
              {ROTULO_DA_RARIDADE[boost.raridade]}
            </p>
            <p className="mt-2.5 text-sm">
              Seu próximo XP vem com{" "}
              <b className="font-bold">{boost.multiplicador}x</b>.
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Use na próxima compra em até{" "}
              <b className="font-mono font-semibold tabular-nums text-foreground">
                {contagem.texto}
              </b>
              .
            </p>

            {/* O botão do projeto, no tamanho do projeto. Faixa de largura
                total parecia um bloco pesado embaixo do prêmio. */}
            <Button type="button" size="lg" className="mt-5 px-8" onClick={aoFechar}>
              Continuar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

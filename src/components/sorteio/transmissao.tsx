"use client";

// A transmissão do sorteio ao vivo.
//
// Este arquivo é APRESENTAÇÃO. Ele conta segundos, gira números e revela
// nomes, e não decide nada: o resultado chega pronto do servidor, e o
// cronograma que ele obedece foi gravado no banco no instante em que a
// campanha encerrou. Se este componente inteiro fosse reescrito por alguém
// com o inspetor aberto, o sorteio sairia igual.
//
// A tela muda de personalidade três vezes, de propósito. A espera é sóbria e
// informativa: quem chega dez minutos antes quer conferir que está no lugar
// certo. A contagem é um relógio gigante e mais nada, porque nesse minuto não
// existe outra informação. A revelação é o número, e só depois o nome, na
// mesma ordem em que o servidor libera os dois.

import Link from "next/link";
import { useEffect, useRef } from "react";
import {
  RefreshCw,
  ShieldCheck,
  Trophy,
  Volume2,
  VolumeX,
  WifiOff,
} from "lucide-react";

import {
  faseDoSorteio,
  formatarContagemCurta,
  percentualDaContagem,
  segundosAte,
  type EstadoDoSorteio,
} from "@/lib/sorteio-ao-vivo";
import { numeroDoTitulo } from "@/lib/titulo";
import { cn } from "@/lib/utils";
import type { EstadoPublicoDoSorteio } from "@/server/services/sorteio-ao-vivo";
import { AnelDePreparo } from "@/components/sorteio/anel-de-preparo";
import { CertificadoDoSorteio } from "@/components/sorteio/certificado";
import { CarretelDeTitulos } from "@/components/sorteio/carretel-de-titulos";
import { Confete } from "@/components/sorteio/confete";
import { useEstadoDoSorteio } from "@/components/sorteio/usar-estado-do-sorteio";
import { useSom } from "@/components/sorteio/usar-som";

/** Os últimos segundos, quando a contagem troca de cara. */
const SEGUNDOS_DE_TENSAO = 10;

/** Os últimos de todos, quando ela vira o anel de preparo. */
const SEGUNDOS_DE_PREPARO = 3;

function horaDeBrasilia(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(new Date(iso))
    .replace(", ", " às ");
}

export function TransmissaoDoSorteio({
  estadoInicial,
}: {
  estadoInicial: EstadoPublicoDoSorteio;
}) {
  const { estado, agora, conexao, recarregar } = useEstadoDoSorteio(estadoInicial);
  const som = useSom();

  // A FASE VEM DO RELÓGIO, não da última resposta do servidor.
  //
  // Era o contrário, e a contagem ficava parada no zero por meio segundo ou
  // mais: a tela só trocava quando a resposta da próxima consulta chegava, e
  // essa consulta sai um pouco depois da hora de propósito (o respiro que
  // espalha o pico de milhares de espectadores pedindo ao mesmo tempo). Somado
  // à ida e volta da rede, dava quase um segundo de "00" na cara de quem
  // estava esperando o clímax.
  //
  // Não precisa esperar ninguém: o cronograma inteiro está na mão do
  // navegador desde a primeira resposta, e a fase é uma função dele com o
  // instante atual. Esta é a MESMA função que o servidor usa para decidir, com
  // os mesmos carimbos, então os dois chegam à mesma conclusão. A consulta
  // continua saindo, porque ela é que traz o número; o que ela deixou de fazer
  // é segurar a virada da tela.
  //
  // `temResultado` é o freio: sem número escolhido, a função para em DRAWING
  // por mais tarde que seja. O relógio adianta a troca de cena, nunca a
  // revelação.
  const fase =
    estado.status === "ERROR"
      ? "ERROR"
      : faseDoSorteio(
          {
            drawScheduledAt: new Date(estado.drawScheduledAt),
            drawStartsAt: new Date(estado.drawStartsAt),
            revealAt: new Date(estado.revealAt),
            winnerRevealAt: new Date(estado.winnerRevealAt),
            temResultado: estado.resultado != null,
          },
          agora,
        );

  const aoVivo =
    fase === "COUNTDOWN" || fase === "DRAWING" || fase === "REVEALING";

  return (
    <div className="palco-do-sorteio">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-10">
        <Cabecalho estado={estado} fase={fase} aoVivo={aoVivo} som={som} />

        <div className="mt-5">
          {fase === "WAITING_DRAW" && <Espera estado={estado} agora={agora} />}
          {fase === "COUNTDOWN" && (
            <Contagem estado={estado} agora={agora} som={som} />
          )}
          {(fase === "DRAWING" ||
            fase === "REVEALING" ||
            fase === "FINISHED") && (
            <Revelacao estado={estado} agora={agora} som={som} />
          )}
          {fase === "ERROR" && <Falha estado={estado} />}
        </div>

        <CertificadoDoSorteio estado={estado} />

        <EstadoDaConexao situacao={conexao} recarregar={recarregar} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- cabeçalho

function Cabecalho({
  estado,
  fase,
  aoVivo,
  som,
}: {
  estado: EstadoPublicoDoSorteio;
  fase: EstadoDoSorteio;
  aoVivo: boolean;
  som: ReturnType<typeof useSom>;
}) {
  return (
    <header className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          {aoVivo ? (
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-[11px] font-bold tracking-[0.14em] text-red-300 uppercase">
              <span aria-hidden className="ponto-ao-vivo" />
              Ao vivo
            </span>
          ) : (
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold tracking-[0.14em] text-emerald-300 uppercase">
              {fase === "FINISHED" ? "Sorteio finalizado" : "Sorteio confirmado"}
            </span>
          )}
          <h1 className="text-balance text-xl leading-tight font-extrabold tracking-tight text-white sm:text-2xl">
            {estado.campanha.premio ?? estado.campanha.titulo}
          </h1>
          {/* Só quando o prêmio e o título dizem coisas diferentes. Numa
              campanha chamada pelo nome da skin, os dois são a mesma frase, e
              repeti-la embaixo da manchete não informa nada. */}
          {estado.campanha.premio &&
            estado.campanha.premio.trim() !== estado.campanha.titulo.trim() && (
              <p className="truncate text-sm text-white/55">
                {estado.campanha.titulo}
              </p>
            )}
        </div>

        {/* O som fica no cabeçalho e nasce desligado: navegador não deixa
            tocar antes do clique, e ninguém quer barulho surpresa numa aba
            aberta há dez minutos. */}
        <button
          type="button"
          onClick={som.alternar}
          aria-pressed={som.ligado}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          {som.ligado ? (
            <Volume2 className="h-5 w-5" />
          ) : (
            <VolumeX className="h-5 w-5" />
          )}
          <span className="sr-only">
            {som.ligado ? "Desativar som" : "Ativar som"}
          </span>
        </button>
      </div>
    </header>
  );
}

// ------------------------------------------------------------------ espera

function Espera({
  estado,
  agora,
}: {
  estado: EstadoPublicoDoSorteio;
  agora: Date;
}) {
  const faltam = segundosAte(new Date(estado.drawScheduledAt), agora);

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center sm:p-8">
      <p className="text-sm text-white/60">
        O sorteio desta campanha acontece automaticamente. Não é preciso fazer
        nada: a contagem começa sozinha na hora marcada.
      </p>

      <p
        className="mt-6 font-mono text-5xl font-black tabular-nums text-white sm:text-6xl"
        role="timer"
        aria-label={`Faltam ${formatarContagemCurta(faltam)} para o sorteio começar`}
      >
        {formatarContagemCurta(faltam)}
      </p>
      <p className="mt-1 text-[11px] font-bold tracking-[0.16em] text-white/55 uppercase">
        para a contagem regressiva
      </p>

      {/* Três colunas quando há largura: com duas, os quatro campos deixavam
          um buraco no meio da segunda linha no desktop. */}
      <dl className="mt-7 grid grid-cols-2 gap-3 text-left sm:grid-cols-3">
        <Dado
          rotulo="Horário do sorteio"
          valor={horaDeBrasilia(estado.drawStartsAt)}
        />
        <Dado
          rotulo="Títulos disputando"
          valor={estado.eligibleTicketCount.toLocaleString("pt-BR")}
        />
        <Dado
          rotulo="Campanha encerrada"
          valor={horaDeBrasilia(estado.raffleEndedAt)}
        />
        {/* O código ocupa a linha inteira: ele é o que a pessoa copia para
            conferir depois, e cortado no meio ("DRW-20260829...") não serve
            para nada. */}
        <Dado
          rotulo="Código do sorteio"
          valor={estado.publicId}
          className="col-span-2 sm:col-span-3"
          mono
        />
      </dl>
    </section>
  );
}

function Dado({
  rotulo,
  valor,
  mono = false,
  className,
}: {
  rotulo: string;
  valor: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5",
        className,
      )}
    >
      <dt className="text-[10px] font-bold tracking-[0.12em] text-white/55 uppercase">
        {rotulo}
      </dt>
      <dd
        className={cn(
          "mt-0.5 text-sm font-semibold text-white/90",
          mono ? "font-mono break-all" : "truncate",
        )}
      >
        {valor}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------- contagem

function Contagem({
  estado,
  agora,
  som,
}: {
  estado: EstadoPublicoDoSorteio;
  agora: Date;
  som: ReturnType<typeof useSom>;
}) {
  const faltam = segundosAte(new Date(estado.drawStartsAt), agora);
  const tenso = faltam <= SEGUNDOS_DE_TENSAO;
  // Nos três últimos a tela troca de gesto: sai o relógio, entra o anel.
  //
  // O zero ENTRA na conta, e isso foi um conserto. Com `faltam > 0`, o
  // instante do zero caía de volta no relógio sóbrio mostrando "0" por meio
  // segundo, até a resposta do servidor trocar a fase para o carretel. Uma
  // piscada para trás bem no clímax. Agora o anel segura o zero até a
  // transmissão virar sozinha.
  const preparando = faltam <= SEGUNDOS_DE_PREPARO;
  const decorrido = percentualDaContagem(
    {
      drawScheduledAt: new Date(estado.drawScheduledAt),
      drawStartsAt: new Date(estado.drawStartsAt),
    },
    agora,
  );

  // Uma batida por segundo, e só quando o segundo vira de verdade. O
  // componente redesenha quatro vezes por segundo, e sem esta guarda o som
  // sairia quatro vezes.
  const ultimoSegundo = useRef<number>(-1);
  useEffect(() => {
    if (ultimoSegundo.current === faltam) return;
    ultimoSegundo.current = faltam;
    if (faltam <= 0) return;
    som.tocar(faltam <= SEGUNDOS_DE_TENSAO ? "tique-final" : "tique");
  }, [faltam, som]);

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border p-6 text-center transition-colors duration-700 sm:p-10",
        tenso
          ? "border-red-500/40 bg-red-950/20"
          : "border-white/10 bg-white/[0.03]",
      )}
    >
      <p className="text-[11px] font-bold tracking-[0.2em] text-white/50 uppercase">
        {preparando ? "Sorteando em" : "O sorteio começa em"}
      </p>

      {preparando && <AnelDePreparo numero={faltam} />}

      <p
        hidden={preparando}
        className={cn(
          "mt-3 font-mono font-black tabular-nums leading-none text-white",
          tenso
            ? "sorteio-pulso text-[6rem] sm:text-[10rem]"
            : "text-7xl sm:text-9xl",
        )}
        // O relógio pisca a cada segundo: para quem ouve, isso seria uma
        // interrupção por segundo. A frase abaixo diz a mesma coisa, de vez
        // em quando.
        aria-hidden
      >
        {tenso ? faltam : formatarContagemCurta(faltam)}
      </p>
      <p className="sr-only" role="status">
        {faltam <= 5
          ? "O sorteio está começando."
          : `Faltam ${faltam} segundos para o sorteio.`}
      </p>

      <div
        className="mt-7 h-2 w-full overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(decorrido)}
        aria-label="Tempo decorrido da contagem regressiva"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300 ease-linear",
            tenso
              ? "bg-gradient-to-r from-red-500 to-orange-400"
              : "bg-gradient-to-r from-primary to-amber-300",
          )}
          style={{ width: `${decorrido}%` }}
        />
      </div>

      <p className="mt-4 text-xs text-white/55">
        Sorteio automático e sincronizado para todos os participantes.
      </p>
    </section>
  );
}

// --------------------------------------------------------------- revelação

/**
 * Quanto o número pode atrasar antes de a tela admitir que algo saiu errado.
 *
 * Existe porque a cena agora entra pelo relógio, sem esperar o servidor: se o
 * motor não rodar (o sistema fora do ar bem na hora), o carretel giraria para
 * sempre e a página passaria a impressão de que está tudo bem. O cron recupera
 * em até um minuto, então quarenta e cinco segundos de tolerância cobrem o
 * caso normal e ainda dizem a verdade quando não é normal.
 */
const TOLERANCIA_DO_ATRASO_MS = 45_000;

function Revelacao({
  estado,
  agora,
  som,
}: {
  estado: EstadoPublicoDoSorteio;
  agora: Date;
  som: ReturnType<typeof useSom>;
}) {
  const numero = estado.resultado?.numero ?? null;
  const atrasado =
    numero == null &&
    agora.getTime() - Date.parse(estado.revealAt) > TOLERANCIA_DO_ATRASO_MS;
  const ganhador = estado.resultado?.ganhador ?? null;

  // Um toque quando o número finalmente aparece. Dispara uma vez: a
  // dependência é o número, que só muda de nulo para o valor final.
  const jaSoou = useRef(false);
  useEffect(() => {
    if (numero == null || jaSoou.current) return;
    jaSoou.current = true;
    som.tocar("revelacao");
  }, [numero, som]);

  return (
    <section className="space-y-4">
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border p-6 text-center sm:p-10",
          numero == null
            ? "border-white/10 bg-white/[0.03]"
            : "sorteio-brilho border-amber-400/40 bg-amber-500/[0.07]",
        )}
      >
        <p className="text-[11px] font-bold tracking-[0.2em] text-white/50 uppercase">
          {numero == null ? "Sorteando..." : "Número sorteado"}
        </p>

        {atrasado && (
          <p role="status" className="mt-2 text-xs leading-relaxed text-amber-300">
            O sorteio está demorando mais que o previsto. O resultado aparece
            aqui sozinho assim que sair, e ninguém precisa recarregar a página.
          </p>
        )}

        <div className="mx-auto mt-4 w-full max-w-[340px]">
          <CarretelDeTitulos
            totalNumbers={estado.campanha.totalNumbers}
            amostra={estado.amostraDeTitulos}
            numeroFinal={numero}
            aoPassar={() => som.tocar("rolagem")}
          />
        </div>

        {/* Quantos títulos estão no bolo, durante o sorteio.
            Sem isto a tela mostra números correndo e um resultado, e nada diz
            que a faixa inteira estava em jogo. Quem vê três resultados
            seguidos na metade de cima conclui sozinho que o sorteio puxa para
            o fim, e não tem como saber que não. */}
        <p className="mt-3 text-xs text-white/55">
          {estado.eligibleTicketCount > 0
            ? `${estado.eligibleTicketCount.toLocaleString("pt-BR")} títulos no sorteio, todos com a mesma chance`
            : "Todos os títulos com a mesma chance"}
        </p>

        {numero != null && (
          <p className="sr-only" role="status">
            Número sorteado: {numero}.
          </p>
        )}
      </div>

      {numero != null && (
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center sm:p-8">
          {ganhador == null ? (
            <p className="flex items-center justify-center gap-2 text-sm text-white/60">
              <span aria-hidden className="ponto-ao-vivo" />
              Buscando o proprietário da cota...
            </p>
          ) : (
            <>
              <Confete />
              <div className="sorteio-entra relative space-y-3">
                <Trophy
                  aria-hidden
                  className="mx-auto h-14 w-14 text-amber-400"
                  strokeWidth={1.5}
                />
                <p className="text-[11px] font-bold tracking-[0.2em] text-amber-300 uppercase">
                  Temos um ganhador
                </p>
                <p className="text-3xl font-black tracking-tight text-white sm:text-4xl">
                  {ganhador}
                </p>

                {/* O canhoto: o pedaço de papel que sai do pote, com a
                    picotagem à esquerda. É o que dá objeto ao resultado,
                    em vez de deixar o número solto no meio do texto. */}
                <div
                  className="mx-auto flex w-full max-w-[320px] items-stretch overflow-hidden rounded-xl border border-amber-400/60"
                  style={{ background: "rgba(251,191,36,0.08)" }}
                >
                  <span
                    aria-hidden
                    className="w-4 shrink-0 self-stretch border-r-2 border-dashed border-amber-400/60"
                  />
                  <div className="min-w-0 flex-1 px-4 py-2.5 text-left">
                    <p className="text-[9px] font-bold tracking-[0.16em] text-white/55 uppercase">
                      Título vencedor
                    </p>
                    <p className="font-mono text-lg font-black tabular-nums text-amber-300">
                      {numeroDoTitulo(numero, estado.campanha.totalNumbers)}
                    </p>
                  </div>
                  <ShieldCheck
                    aria-hidden
                    className="mr-4 h-4 w-4 shrink-0 self-center text-amber-400"
                  />
                </div>

                <div className="flex flex-col items-center gap-2 pt-1 sm:flex-row sm:justify-center">
                  <Link
                    href={`/sorteio/${estado.publicId}/verificar`}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-5 text-sm font-bold text-emerald-200 sm:w-auto"
                  >
                    <ShieldCheck aria-hidden className="h-4 w-4" />
                    Conferir o sorteio
                  </Link>
                  <Link
                    href={`/${estado.campanha.slug}`}
                    className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 sm:w-auto"
                  >
                    Ver a campanha
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------- falha

function Falha({ estado }: { estado: EstadoPublicoDoSorteio }) {
  return (
    <section className="rounded-2xl border border-red-500/30 bg-red-950/20 p-6 text-center">
      <p className="text-sm font-bold text-red-200">
        O sorteio não pôde ser concluído automaticamente.
      </p>
      <p className="mt-2 text-sm text-white/60">
        A equipe foi avisada e o resultado será publicado nesta mesma página.
        Nenhum título foi alterado.
      </p>
      {estado.erro && (
        <p className="mt-3 font-mono text-[11px] text-white/55">{estado.erro}</p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- conexão

function EstadoDaConexao({
  situacao,
  recarregar,
}: {
  situacao: "ok" | "reconectando" | "offline";
  recarregar: () => void;
}) {
  if (situacao === "ok") return null;

  return (
    <div
      role="status"
      className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200"
    >
      <WifiOff aria-hidden className="h-4 w-4 shrink-0" />
      <span>
        {situacao === "offline"
          ? "Sem internet. A contagem continua correta; o resultado aparece quando a conexão voltar."
          : "Reconectando ao servidor do sorteio..."}
      </span>
      <button
        type="button"
        onClick={recarregar}
        className="ml-1 inline-flex items-center gap-1 font-bold underline underline-offset-2"
      >
        <RefreshCw aria-hidden className="h-3 w-3" />
        tentar agora
      </button>
    </div>
  );
}

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
import { useRouter } from "next/navigation";
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
import type {
  DadosDeReivindicacao,
  EstadoPublicoDoSorteio,
} from "@/server/services/sorteio-ao-vivo";
import { BORDA_DE_AUTH, HALO_DE_AUTH } from "@/components/auth/cartao-de-auth";
import { AnelDePreparo } from "@/components/sorteio/anel-de-preparo";
import { CarretelDeTitulos } from "@/components/sorteio/carretel-de-titulos";
import { Confete } from "@/components/sorteio/confete";
import { useEstadoDoSorteio } from "@/components/sorteio/usar-estado-do-sorteio";
import { useSom } from "@/components/sorteio/usar-som";
import { EmblemaDoTime } from "@/components/times/emblema-do-time";
import { BotaoReivindicar } from "@/components/public/botao-reivindicar";

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
  reivindicacao,
}: {
  estadoInicial: EstadoPublicoDoSorteio;
  /**
   * Preenchido só quando quem está olhando é o ganhador e há telefone de
   * suporte. Vem do servidor, resolvido por sessão, e por isso não pode ser
   * derivado do estado público, que é igual para todo mundo.
   */
  reivindicacao: DadosDeReivindicacao | null;
}) {
  const { estado, agora, conexao, recarregar } =
    useEstadoDoSorteio(estadoInicial);
  const som = useSom();
  const router = useRouter();

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

  // Quem assistiu AO VIVO recebeu esta página renderizada antes de existir
  // ganhador, então `reivindicacao` chegou nula e continuaria nula para sempre:
  // a fase muda no cliente, pelo relógio, sem passar pelo servidor de novo.
  //
  // Uma releitura, uma vez só, quando a transmissão termina. Os cinco segundos
  // de espera deixam o confete e a revelação acontecerem antes: recarregar em
  // cima do momento mais importante da tela seria trocar um botão por um
  // solavanco.
  const jaRelou = useRef(false);
  useEffect(() => {
    if (fase !== "FINISHED" || reivindicacao || jaRelou.current) return;
    jaRelou.current = true;
    const id = setTimeout(() => router.refresh(), 5000);
    return () => clearTimeout(id);
  }, [fase, reivindicacao, router]);

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
            <Revelacao
              estado={estado}
              agora={agora}
              som={som}
              // Muda o peso de "Ver a campanha": com a reivindicação na tela,
              // ela deixa de ser a ação principal.
              temReivindicacao={fase === "FINISHED" && reivindicacao != null}
            />
          )}
          {fase === "ERROR" && <Falha estado={estado} />}
        </div>

        {/* O certificado saiu daqui. Era um card com quatro hashes de 64
            caracteres, cada um com sua legenda, aberto embaixo do resultado.
            Quem chega nesta página vem ver quem ganhou.

            Nada se perdeu, e sem link novo: a revelação já traz "Conferir o
            sorteio" logo abaixo do nome do ganhador, e a página de conferência
            mostra os mesmos quatro hashes com a checagem rodando ao vivo. O
            card era a terceira cópia da mesma informação na mesma tela. */}

        {/* Reivindicação do prêmio, no fim e só para quem ganhou.
            Ganhar e não saber o que fazer em seguida é o pior momento para
            deixar a pessoa sozinha: a tela dizia o nome dela e parava ali.

            A primeira versão deste bloco veio emprestada do comprovante, com
            card e botão verdes, e ficou horrível: esta tela é vermelha do
            cabeçalho ao rodapé, e um retângulo esmeralda no fim dela parecia
            colado de outro site. Verde ali era herança do WhatsApp, não uma
            escolha.

            Agora usa a mesma casca dupla dos outros painéis, com os mesmos
            raios concêntricos e o mesmo fio de luz no topo, e o `mt-5` que
            faltava: sem ele o bloco encostava no card do ganhador, sem
            respiro nenhum entre uma borda e outra.

            E deixou de repetir "Título 054", que já está dois centímetros
            acima, dentro do canhoto. A repetição era metade do aperto. */}
        {fase === "FINISHED" && reivindicacao && (
          <div
            className={cn(
              "mt-5 rounded-[1.75rem] border border-transparent p-1.5",
              HALO_DE_AUTH,
            )}
            style={BORDA_DE_AUTH}
          >
            <div className="relative overflow-hidden rounded-[1.375rem] bg-[#0e1013] p-6 text-center shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)] sm:p-8">
              {/* A mesma luz da marca que sai de trás da skin no card acima. */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_0%,rgba(239,68,68,0.16),transparent_70%)]"
              />
              <div className="relative space-y-4">
                <p className="text-[11px] font-bold tracking-[0.2em] text-red-400 uppercase">
                  A skin é sua
                </p>
                <p className="mx-auto max-w-[36ch] text-sm leading-relaxed text-white/65">
                  Chame o suporte para combinar a entrega. A conversa já abre
                  com os seus dados.
                </p>
                <BotaoReivindicar
                  className="w-full sm:w-auto"
                  variante="marca"
                  telefoneDoSuporte={reivindicacao.telefoneDoSuporte}
                  nome={reivindicacao.nome}
                  premio={reivindicacao.premio}
                  tradeUrl={reivindicacao.tradeUrl}
                />
                {/* Só quando falta. Quem já cadastrou não precisa ler sobre
                    um problema que não tem. */}
                {!reivindicacao.tradeUrl && (
                  <p className="mx-auto max-w-[36ch] text-xs leading-relaxed text-white/45">
                    Você ainda não cadastrou seu link de troca. Dá para
                    cadastrar em Minha Conta e adiantar a entrega.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

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
  const premio = estado.campanha.premio ?? estado.campanha.titulo;
  // Só quando o prêmio e o título dizem coisas diferentes. Numa campanha
  // chamada pelo nome da skin, os dois são a mesma frase, e repeti-la embaixo
  // da manchete não informa nada.
  const subtitulo =
    estado.campanha.premio &&
    estado.campanha.premio.trim() !== estado.campanha.titulo.trim()
      ? estado.campanha.titulo
      : null;

  return (
    <header className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-4">
        {/* A FOTO DA SKIN.
            O prêmio é o motivo de a pessoa estar nesta página, e ele existia
            aqui só como texto. A foto vem do mesmo lugar que a lista de
            prêmios usa, e entra numa moldura dupla: uma casca com fio de
            cabelo por fora e o miolo com realce interno, para o render não
            parecer colado no fundo.

            Escondida do leitor de tela: o nome dela está do lado, em texto. */}
        {estado.campanha.premioImagem && (
          <span
            aria-hidden
            className="block shrink-0 rounded-[1.15rem] border border-white/10 bg-white/[0.04] p-1"
          >
            <span className="relative block h-16 w-16 overflow-hidden rounded-[0.9rem] bg-black/40 shadow-[inset_0_1px_1px_rgba(255,255,255,0.14)] sm:h-20 sm:w-20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={estado.campanha.premioImagem}
                alt=""
                className="h-full w-full object-contain p-1.5"
              />
              {/* A luz vermelha por trás do item, do mesmo vermelho da
                  marca. Fica atrás do render porque o PNG da skin é
                  recortado: a luz vaza pelas bordas e dá volume. */}
              <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_100%,rgba(239,68,68,0.35),transparent_70%)]" />
            </span>
          </span>
        )}

        <div className="flex min-w-0 flex-col gap-2 pt-0.5">
          {aoVivo ? (
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-[11px] font-bold tracking-[0.2em] text-red-300 uppercase">
              <span aria-hidden className="ponto-ao-vivo" />
              Ao vivo
            </span>
          ) : (
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold tracking-[0.2em] text-emerald-300 uppercase">
              {fase === "FINISHED"
                ? "Sorteio finalizado"
                : "Sorteio confirmado"}
            </span>
          )}
          <h1 className="text-balance text-xl leading-[1.1] font-extrabold tracking-tight text-white sm:text-[26px]">
            {premio}
          </h1>
          {subtitulo && (
            <p className="truncate text-sm text-white/55">{subtitulo}</p>
          )}
        </div>
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
    <section className="rounded-[1.75rem] border border-white/[0.08] bg-white/[0.03] p-1.5">
      <div className="rounded-[1.375rem] bg-[#0e1013] p-6 text-center shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)] sm:p-9">
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
      </div>
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
        "rounded-[1.75rem] border p-1.5 transition-colors duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]",
        tenso
          ? "border-red-500/45 bg-red-500/[0.06]"
          : "border-white/[0.08] bg-white/[0.03]",
      )}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-[1.375rem] p-6 text-center shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)] transition-colors duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] sm:p-10",
          tenso ? "bg-[#14090a]" : "bg-[#0e1013]",
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
                ? "bg-gradient-to-r from-red-600 to-red-400"
                : "bg-gradient-to-r from-red-500/70 to-red-400/70",
            )}
            style={{ width: `${decorrido}%` }}
          />
        </div>

        <p className="mt-4 text-xs text-white/55">
          Sorteio automático e sincronizado para todos os participantes.
        </p>
      </div>
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
  temReivindicacao,
}: {
  estado: EstadoPublicoDoSorteio;
  agora: Date;
  som: ReturnType<typeof useSom>;
  /** Quando verdadeiro, "Ver a campanha" cede o peso à reivindicação. */
  temReivindicacao: boolean;
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
      {/* MOLDURA DUPLA.
          A casca de fora é o gradiente da marca com um dedo de folga; o miolo
          é a placa onde o número mora, com um fio de luz no topo. Duas
          superfícies em profundidades diferentes, com raios concêntricos.
          Um cartão só, chapado no fundo, é o que dava o ar de rascunho. */}
      <div
        className={cn(
          "rounded-[1.75rem] border border-transparent p-1.5",
          numero != null && `sorteio-brilho ${HALO_DE_AUTH}`,
        )}
        style={BORDA_DE_AUTH}
      >
        <div className="relative overflow-hidden rounded-[1.375rem] bg-[#0e1013] p-6 text-center shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)] sm:p-10">
          <p className="text-[11px] font-bold tracking-[0.2em] text-white/50 uppercase">
            {numero == null ? "Sorteando..." : "Número sorteado"}
          </p>

          {atrasado && (
            <p
              role="status"
              className="mt-2 text-xs leading-relaxed text-red-300"
            >
              O sorteio está demorando mais que o previsto. O resultado aparece
              aqui sozinho assim que sair, e ninguém precisa recarregar a
              página.
            </p>
          )}

          <div className="mx-auto mt-4 w-full max-w-[340px]">
            <CarretelDeTitulos
              totalNumbers={estado.campanha.totalNumbers}
              semente={estado.publicId}
              amostra={estado.amostraDeTitulos}
              numeroFinal={numero}
              aoPassar={() => som.tocar("rolagem")}
            />
          </div>

          {numero != null && (
            <p className="sr-only" role="status">
              Número sorteado: {numero}.
            </p>
          )}
        </div>
      </div>

      {numero != null && (
        <div
          className={cn(
            "rounded-[1.75rem] border border-transparent p-1.5",
            ganhador != null && HALO_DE_AUTH,
          )}
          style={BORDA_DE_AUTH}
        >
          <div className="relative overflow-hidden rounded-[1.375rem] bg-[#0e1013] p-6 text-center shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)] sm:p-9">
            {ganhador == null ? (
              <p className="flex items-center justify-center gap-2 text-sm text-white/60">
                <span aria-hidden className="ponto-ao-vivo" />
                Buscando o proprietário da cota...
              </p>
            ) : (
              <>
                <Confete />
                <div className="sorteio-entra relative space-y-3">
                  {/* A SKIN, e não um troféu de biblioteca de ícones.
                      O troféu era um desenho genérico que serve para qualquer
                      concurso do mundo; aqui a pessoa levou UM item, e é ele
                      que merece o lugar de honra. Moldura dupla de novo, um
                      pouco maior que a do cabeçalho, com a luz da marca por
                      trás do recorte. */}
                  {estado.campanha.premioImagem ? (
                    <span
                      aria-hidden
                      className="mx-auto block w-fit rounded-[1.4rem] border border-red-500/25 bg-white/[0.04] p-1.5"
                    >
                      <span className="relative block h-24 w-24 overflow-hidden rounded-[1.05rem] bg-black/40 shadow-[inset_0_1px_1px_rgba(255,255,255,0.14)] sm:h-28 sm:w-28">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={estado.campanha.premioImagem}
                          alt=""
                          className="h-full w-full object-contain p-2"
                        />
                        <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(65%_55%_at_50%_100%,rgba(239,68,68,0.4),transparent_72%)]" />
                      </span>
                    </span>
                  ) : (
                    <Trophy
                      aria-hidden
                      className="mx-auto h-14 w-14 text-red-500"
                      strokeWidth={1.5}
                    />
                  )}
                  <p className="text-[11px] font-bold tracking-[0.2em] text-red-400 uppercase">
                    Temos um ganhador
                  </p>
                  {/* O nome e, ao lado, o emblema do time para quem essa
                      pessoa torce. Era o lugar que faltava: o emblema estava
                      ligado nas listas de prêmios e não aqui, que é onde todo
                      mundo olha quando o sorteio acaba. */}
                  <p className="flex flex-wrap items-center justify-center gap-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
                    {ganhador}
                    {estado.resultado?.time && (
                      <EmblemaDoTime
                        time={estado.resultado.time}
                        tamanho="lg"
                      />
                    )}
                  </p>

                  {/* O canhoto: o pedaço de papel que sai do pote. É o que
                      dá objeto ao resultado, em vez de deixar o número solto
                      no meio do texto.

                      Era um retângulo com borda tracejada à esquerda, e isso
                      não faz ticket: sem os furos ele lê como um card com um
                      detalhe. Agora tem os dois furos, a picotagem com os
                      pontos acesos nas pontas, e o selo do outro lado. O
                      desenho inteiro vive em `.winner-ticket`, no globals. */}
                  <div className="winner-ticket">
                    <div className="ticket-left">
                      <div className="ticket-icon">
                        <svg
                          aria-hidden
                          width="25"
                          height="25"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <path
                            d="M4.5 5.5H19.5V8.2C18.05 8.2 16.9 9.35 16.9 10.8C16.9 12.25 18.05 13.4 19.5 13.4V18.5H4.5V15.8C5.95 15.8 7.1 14.65 7.1 13.2C7.1 11.75 5.95 10.6 4.5 10.6V5.5Z"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    </div>

                    <div aria-hidden className="ticket-divider" />

                    <div className="ticket-content">
                      <span className="ticket-label">TÍTULO VENCEDOR</span>
                      <strong className="ticket-number">
                        {numeroDoTitulo(numero, estado.campanha.totalNumbers)}
                      </strong>
                    </div>

                    <div className="ticket-seal">
                      <ShieldCheck
                        aria-hidden
                        className="h-[27px] w-[27px]"
                        strokeWidth={1.7}
                      />
                    </div>

                    {/* Textura, não informação: fica em 1,8% de opacidade e
                        sai do fluxo para leitor de tela. */}
                    <div aria-hidden className="ticket-watermark">
                      WINNER
                    </div>
                  </div>

                  {/* Só "Ver a campanha". O "Conferir o sorteio" que ficava
                      ao lado saiu a pedido.

                      Consequência que vale estar escrita: com ele, saiu o
                      último link do site para /sorteio/<id>/verificar. A
                      página continua de pé e o endereço continua funcionando,
                      mas agora só chega lá quem digitar. */}
                  <div className="flex flex-col items-center gap-2 pt-1 sm:flex-row sm:justify-center">
                    {/* Dois botões sólidos iguais, empilhados, brigavam pela
                        mesma atenção, e o mais importante era o de baixo. Para
                        quem ganhou, reivindicar é A ação; ver a campanha é
                        passeio. Então aqui ela vira contorno, e a pílula cheia
                        fica só com a reivindicação. Para quem não ganhou nada
                        muda: ela continua sendo o único botão, e sólido. */}
                    <Link
                      href={`/${estado.campanha.slug}`}
                      className={cn(
                        "inline-flex h-11 w-full items-center justify-center rounded-full px-7 text-sm font-bold transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] sm:w-auto",
                        temReivindicacao
                          ? "border border-white/20 text-white/80 hover:border-white/35 hover:text-white"
                          : "bg-primary text-primary-foreground hover:opacity-95",
                      )}
                    >
                      Ver a campanha
                    </Link>
                  </div>
                </div>
              </>
            )}
          </div>
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
        <p className="mt-3 font-mono text-[11px] text-white/55">
          {estado.erro}
        </p>
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
      className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-200"
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

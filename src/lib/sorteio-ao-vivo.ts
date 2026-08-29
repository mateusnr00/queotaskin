// A linha do tempo do sorteio ao vivo, sem banco e sem relógio implícito.
//
// A ideia central do módulo, e do recurso inteiro: DEPOIS QUE A CAMPANHA
// ENCERRA, TODA A TRANSMISSÃO É UMA FUNÇÃO DE CARIMBOS DE TEMPO. A hora em
// que a contagem começa, a hora em que o motor sorteia, a hora em que o
// número aparece e a hora em que o ganhador aparece são todas calculadas de
// uma vez, no instante do encerramento, e gravadas.
//
// Isso é o que dispensa um servidor de eventos. Não existe "avisar o
// navegador que a contagem começou": o navegador já sabe a hora, pediu ao
// servidor qual é o instante atual dele, e conta sozinho. O único dado que
// não dá para derivar do relógio é o número sorteado, e ele é buscado uma vez
// só, no segundo exato em que passa a ser público.
//
// Nada aqui lê `Date.now()`. Quem chama passa o instante, que é o que permite
// testar a virada de cada fase sem esperar a hora chegar, e o que garante que
// o servidor e a página cheguem à mesma conclusão sobre o mesmo instante.

/** Os estados do sorteio. São os mesmos valores gravados no banco. */
export type EstadoDoSorteio =
  | "WAITING_DRAW"
  | "COUNTDOWN"
  | "DRAWING"
  | "REVEALING"
  | "FINISHED"
  | "ERROR";

export interface TemposDoSorteio {
  /** Da campanha encerrar até a contagem regressiva começar. */
  esperaSegundos: number;
  /** A contagem regressiva em si. */
  contagemSegundos: number;
  /** Da contagem zerar até o número poder ser mostrado. */
  rolagemSegundos: number;
  /** Do número aparecer até o ganhador aparecer. */
  ganhadorSegundos: number;
}

/**
 * Os tempos de produção.
 *
 * Dez minutos de espera é o intervalo que dá tempo de avisar no grupo e de a
 * pessoa abrir a página. Sessenta segundos de contagem é o que se aguenta
 * olhando sem desistir. Nove segundos de rolagem e mais quatro até o nome
 * saem do roteiro da animação.
 */
export const TEMPOS_PADRAO: TemposDoSorteio = {
  esperaSegundos: 600,
  contagemSegundos: 60,
  rolagemSegundos: 9,
  ganhadorSegundos: 4,
};

/** Limites de sanidade para os valores vindos do ambiente. */
const LIMITES = {
  esperaSegundos: { min: 5, max: 86_400 },
  contagemSegundos: { min: 5, max: 3_600 },
  rolagemSegundos: { min: 1, max: 120 },
  ganhadorSegundos: { min: 1, max: 120 },
} as const;

function inteiroDoAmbiente(
  bruto: string | undefined,
  padrao: number,
  limite: { min: number; max: number },
): number {
  if (!bruto) return padrao;
  const n = Number.parseInt(bruto.trim(), 10);
  if (!Number.isFinite(n)) return padrao;
  return Math.min(limite.max, Math.max(limite.min, n));
}

/**
 * Os tempos configurados, lidos do ambiente.
 *
 * Lidos a cada chamada, e não uma vez na carga do módulo: em desenvolvimento
 * a variável muda entre um teste e outro, e um valor congelado no import
 * obrigaria a reiniciar o servidor para encurtar a espera.
 *
 * Só o servidor lê isto. Nenhuma dessas variáveis tem prefixo NEXT_PUBLIC_,
 * então o navegador não as vê e não tem como encurtar a própria contagem: o
 * que ele recebe são instantes absolutos já decididos aqui.
 */
export function temposConfigurados(
  ambiente: NodeJS.ProcessEnv = process.env,
): TemposDoSorteio {
  return {
    esperaSegundos: inteiroDoAmbiente(
      ambiente.DRAW_WAIT_SECONDS,
      TEMPOS_PADRAO.esperaSegundos,
      LIMITES.esperaSegundos,
    ),
    contagemSegundos: inteiroDoAmbiente(
      ambiente.DRAW_COUNTDOWN_SECONDS,
      TEMPOS_PADRAO.contagemSegundos,
      LIMITES.contagemSegundos,
    ),
    rolagemSegundos: inteiroDoAmbiente(
      ambiente.DRAW_ROLLING_SECONDS,
      TEMPOS_PADRAO.rolagemSegundos,
      LIMITES.rolagemSegundos,
    ),
    ganhadorSegundos: inteiroDoAmbiente(
      ambiente.DRAW_WINNER_SECONDS,
      TEMPOS_PADRAO.ganhadorSegundos,
      LIMITES.ganhadorSegundos,
    ),
  };
}

/** Os quatro instantes que descrevem a transmissão inteira. */
export interface MarcosDoSorteio {
  /** Quando a campanha encerrou. É a origem de tudo. */
  raffleEndedAt: Date;
  /** Quando a contagem regressiva começa. */
  drawScheduledAt: Date;
  /** Quando a contagem zera e o motor sorteia. */
  drawStartsAt: Date;
  /** Quando o número pode ser mostrado. */
  revealAt: Date;
  /** Quando o ganhador pode ser mostrado. */
  winnerRevealAt: Date;
}

/**
 * Calcula a linha do tempo inteira a partir do encerramento.
 *
 * Tudo de uma vez, no momento do agendamento, e não passo a passo: se cada
 * fase calculasse a próxima quando chegasse a sua vez, um servidor que
 * dormisse no meio empurraria o resto do cronograma para frente, e duas
 * pessoas com a página aberta veriam contagens diferentes.
 */
export function marcosDoSorteio(
  raffleEndedAt: Date,
  tempos: TemposDoSorteio,
): MarcosDoSorteio {
  const t = raffleEndedAt.getTime();
  const drawScheduledAt = new Date(t + tempos.esperaSegundos * 1000);
  const drawStartsAt = new Date(
    drawScheduledAt.getTime() + tempos.contagemSegundos * 1000,
  );
  const revealAt = new Date(
    drawStartsAt.getTime() + tempos.rolagemSegundos * 1000,
  );
  const winnerRevealAt = new Date(
    revealAt.getTime() + tempos.ganhadorSegundos * 1000,
  );
  return {
    raffleEndedAt,
    drawScheduledAt,
    drawStartsAt,
    revealAt,
    winnerRevealAt,
  };
}

/** O que o cálculo de fase precisa saber. Menos que a linha inteira do banco. */
export interface SituacaoDoSorteio {
  drawScheduledAt: Date;
  drawStartsAt: Date;
  revealAt: Date;
  winnerRevealAt: Date;
  /** O motor já escolheu o número? */
  temResultado: boolean;
  /** O sorteio falhou de forma definitiva? */
  falhou?: boolean;
}

/**
 * Em que fase o sorteio está neste instante.
 *
 * A ordem das checagens é do fim para o começo: quem chega atrasado cai na
 * fase certa numa passada só.
 *
 * `temResultado` é o que impede a fase de correr na frente do motor. Se o
 * servidor ficou fora do ar durante a contagem e voltou depois da hora da
 * revelação, o relógio diz REVEALING mas ainda não existe número sorteado;
 * nesse caso a fase para em DRAWING, o motor roda, e só então a transmissão
 * segue. É o que impede a página de anunciar uma revelação vazia.
 */
export function faseDoSorteio(
  situacao: SituacaoDoSorteio,
  agora: Date,
): EstadoDoSorteio {
  if (situacao.falhou) return "ERROR";
  const t = agora.getTime();
  if (t < situacao.drawScheduledAt.getTime()) return "WAITING_DRAW";
  if (t < situacao.drawStartsAt.getTime()) return "COUNTDOWN";
  if (!situacao.temResultado) return "DRAWING";
  if (t < situacao.revealAt.getTime()) return "DRAWING";
  if (t < situacao.winnerRevealAt.getTime()) return "REVEALING";
  return "FINISHED";
}

/** O número sorteado já pode ser mostrado? */
export function podeMostrarNumero(
  situacao: SituacaoDoSorteio,
  agora: Date,
): boolean {
  return (
    situacao.temResultado && agora.getTime() >= situacao.revealAt.getTime()
  );
}

/** O nome do ganhador já pode ser mostrado? */
export function podeMostrarGanhador(
  situacao: SituacaoDoSorteio,
  agora: Date,
): boolean {
  return (
    situacao.temResultado &&
    agora.getTime() >= situacao.winnerRevealAt.getTime()
  );
}

/**
 * Quando é a próxima virada de fase, para a página se programar.
 *
 * É o que substitui a consulta por segundo: em vez de perguntar ao servidor a
 * toda hora se algo mudou, a página pergunta uma vez, descobre que a próxima
 * mudança é daqui a nove minutos, e volta a dormir. Devolve null quando não
 * há mais virada nenhuma, que é o estado final.
 */
export function proximaVirada(
  situacao: SituacaoDoSorteio,
  agora: Date,
): Date | null {
  if (situacao.falhou) return null;
  const t = agora.getTime();
  const marcos = [
    situacao.drawScheduledAt,
    situacao.drawStartsAt,
    situacao.revealAt,
    situacao.winnerRevealAt,
  ];
  for (const marco of marcos) {
    if (t < marco.getTime()) return marco;
  }
  return null;
}

/** Segundos inteiros que faltam para um instante, nunca negativo. */
export function segundosAte(alvo: Date, agora: Date): number {
  return Math.max(0, Math.ceil((alvo.getTime() - agora.getTime()) / 1000));
}

/**
 * "01:00", "00:09".
 *
 * Minutos e segundos, sem horas: a contagem que este relógio mostra é de um
 * minuto, e um campo de horas parado em "00:" seria ruído em cima do número
 * que interessa.
 */
export function formatarContagemCurta(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  const dd = (n: number) => String(n).padStart(2, "0");
  return `${dd(Math.floor(s / 60))}:${dd(s % 60)}`;
}

/**
 * Quanto da contagem regressiva já passou, de 0 a 100.
 *
 * Cresce com o tempo, como a barra da promoção em dobro: o que enche é o
 * decorrido. Uma barra do que resta só pode encolher, e encolher da direita
 * para a esquerda é o oposto de como se lê uma linha do tempo.
 */
export function percentualDaContagem(
  situacao: Pick<SituacaoDoSorteio, "drawScheduledAt" | "drawStartsAt">,
  agora: Date,
): number {
  const inicio = situacao.drawScheduledAt.getTime();
  const fim = situacao.drawStartsAt.getTime();
  const total = fim - inicio;
  if (total <= 0) return 100;
  const decorrido = ((agora.getTime() - inicio) / total) * 100;
  return Math.min(100, Math.max(0, decorrido));
}

const ALFABETO_DO_ID = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/**
 * O identificador público do sorteio: DRW-20260829-8F2C.
 *
 * A data entra por legibilidade, o sufixo aleatório por unicidade. Sem I e O
 * no alfabeto: o código é feito para ser lido em voz alta e digitado de um
 * print, e "1" contra "I" é a confusão que mais custa nesse cenário.
 *
 * A data é a de Brasília, e não a do servidor: o comprovante diz "sorteio do
 * dia 29" para quem estava assistindo, e às 21h de Brasília o servidor da
 * Vercel já virou o dia em Londres.
 */
export function idPublicoDoSorteio(
  agora: Date,
  aleatorio: (tamanho: number) => number[],
): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(agora)
    .replace(/-/g, "");
  const sufixo = aleatorio(4)
    .map((n) => ALFABETO_DO_ID[n % ALFABETO_DO_ID.length])
    .join("");
  return `DRW-${partes}-${sufixo}`;
}

/** Confere o formato do identificador antes de ir ao banco com ele. */
export function idPublicoValido(bruto: string): boolean {
  return /^DRW-\d{8}-[0-9A-HJ-NP-Z]{4}$/.test(bruto);
}

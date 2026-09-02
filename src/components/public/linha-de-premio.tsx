// A linha de prêmio, usada por "Títulos Premiados", "Caixas surpresas" e
// pelas raspadinhas.
//
// UMA LINHA SÓ, LIDA DA ESQUERDA PARA A DIREITA
//
// A versão anterior empilhava em três alturas: número em cima, nome no meio,
// desgaste e estado embaixo. Cada prêmio virava um bloco de 80px, e uma lista
// de oito títulos premiados ocupava a tela inteira sem dizer mais do que uma
// tabela diria. Empilhar também quebra a varredura: o olho desce procurando um
// número e tropeça em duas outras informações por parada.
//
// Agora tudo mora na mesma linha, na ordem em que a pergunta é feita:
//
//   031   AK-47 | Vulcan  FT   ······················   ● Disponível
//
// "Qual número?" (o âncora da esquerda), "o que é?" (o nome), "em que estado?"
// (a sigla) e "ainda dá para pegar?" (a direita). Todos os elementos
// têm largura fixa menos o nome, então as colunas se alinham entre as linhas
// sem grid: o olho desce a lista e encontra cada informação sempre no mesmo x.
//
// O DESGASTE É A SIGLA, NÃO O NOME
//
// "Field-Tested" ocupa quatro vezes o espaço de "FT" e diz a mesma coisa para
// quem joga. Numa linha única, esse é o texto que empurra o nome da skin para
// fora. A sigla é a mesma do jogo e da Steam.
//
// O ESTADO ANCORA À DIREITA, COM O VERDE ESMAECENDO
//
// A margem automática empurra o estado para a borda, então ele fica na mesma
// coluna em todas as linhas, e o degradê que morre para a esquerda separa o
// estado do nome sem precisar de borda, faixa ou preenchimento sólido. Sólido
// numa lista com metade contemplada vira parede de cor; o fade dá o mesmo
// destaque e some quando não é preciso olhar para ele.
//
// SEM MINIATURA
//
// A lista já teve o selo da skin à esquerda, e ele saiu. Num quadrado de 40px
// o render da Steam vira uma manchinha: a arma aparece de lado, pequena e
// sobre fundo próprio, e o que deveria vender o item só empurrava o número e o
// nome para dentro da linha. A cor da raridade no nome dá a mesma leitura de
// relance, e a foto grande continua onde ela funciona, no topo da campanha.
//
// `AwardedTicket.skinImageUrl` continua sendo preenchida na gravação: é o
// mesmo casamento de nome que resolve a raridade, custa uma linha, e a foto
// volta sem reprocessar nada se um dia ela for útil noutro lugar.

import type { SkinRarity } from "@prisma/client";
import { Trophy } from "lucide-react";

import { RARITY_TEXT_VAR } from "@/lib/cs2";
import { nomeCurto } from "@/lib/nome-curto";
import type { TimeDeCS2 } from "@/lib/times-cs2";
import { EmblemaDoTime } from "@/components/times/emblema-do-time";
import { desgasteCurto, separarDesgaste } from "@/lib/premio-nome";
import { cn } from "@/lib/utils";

export function LinhaDePremio({
  numero,
  premio,
  raridade,
  ganhador,
  time,
  reservado,
  rotuloVago,
}: {
  /** Ja formatado com os zeros a esquerda. Ausente nas caixas surpresas. */
  numero?: string;
  premio: string;
  /** Preenchida quando o premio veio do catalogo. Pinta o nome. */
  raridade?: SkinRarity | null;
  ganhador: string | null;
  /**
   * O time para quem o ganhador torce, já resolvido no servidor. Chega pronto
   * porque esta linha roda no cliente e não tem como consultar o banco.
   * Opcional: compra sem conta não tem time, e a linha existe sem isto.
   */
  time?: TimeDeCS2 | null;
  /**
   * O prêmio já tem dono, mas a unidade ainda não foi aberta.
   *
   * É um terceiro estado, e não um detalhe: entre "disponível" e "revelado"
   * existe o reservado. Contá-lo como disponível prometeria ao próximo
   * comprador um prêmio que já é de outra pessoa. Quem levou continua em
   * segredo até a abertura.
   */
  reservado?: boolean;
  /** O que dizer quando ainda não tem dono. Sem ele, a linha não diz nada. */
  rotuloVago?: string;
}) {
  const temDono = Boolean(ganhador);
  const { nome, desgaste } = separarDesgaste(premio);
  // A sigla quando ela existe; o texto original quando o que veio entre
  // parênteses não é um desgaste conhecido, porque aí ele diz outra coisa.
  const sigla = desgasteCurto(desgaste) ?? desgaste;

  return (
    <li
      className={cn(
        // overflow-hidden faz o fio da esquerda seguir o canto arredondado.
        // Como borda grossa (`border-l-[3px]`) ele encontrava as bordas de 1px
        // em diagonal e aparecia como um arco solto, deslocado do card.
        "relative flex items-center gap-2.5 overflow-hidden rounded-lg border py-2 pr-1.5 pl-2.5 transition-colors sm:gap-3 sm:pl-3",
        temDono
          ? "border-emerald-500/20 bg-emerald-500/[0.04]"
          : "border-border/50 bg-muted/[0.15]",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-[3px]",
          temDono ? "bg-emerald-500" : "bg-primary/70",
        )}
      />

      {numero && (
        // Largura fixa em ch para os números caírem em coluna entre as
        // linhas: é por ele que a pessoa varre a lista procurando o próprio
        // título, e coluna desalinhada obriga a reler cada linha.
        <span className="min-w-[3.5ch] shrink-0 text-right font-mono text-xs font-bold tabular-nums text-muted-foreground">
          {numero}
        </span>
      )}

      {/* NOME E SIGLA ANDAM JUNTOS.
          Os dois descrevem o mesmo item, então formam um grupo só: a sigla
          gruda no fim do nome, curto ou longo, e não flutua na largura que
          sobrou. Com o nome esticando sozinho (flex-1), "FT" era empurrado
          para perto do estado e parecia pertencer a ele.

          O grupo é quem encolhe quando falta espaço, e só o nome trunca. */}
      <span className="flex min-w-0 shrink items-center gap-2">
        <span
          className="truncate text-[13px] font-semibold sm:text-sm"
          style={raridade ? { color: RARITY_TEXT_VAR[raridade] } : undefined}
          title={nome}
        >
          {nome}
        </span>

        {sigla && (
          <span className="shrink-0 rounded border border-border/60 bg-background/50 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
            {sigla}
          </span>
        )}
      </span>

      <Estado
        temDono={temDono}
        ganhador={ganhador}
        time={time}
        reservado={reservado}
        rotuloVago={rotuloVago}
      />
    </li>
  );
}

/**
 * O estado, ancorado na direita, com o degradê morrendo para a esquerda.
 *
 * `ml-auto` é o que empurra: todos os elementos anteriores têm largura fixa
 * menos o nome, então o estado cai sempre na mesma coluna, em todas as linhas.
 */
function Estado({
  temDono,
  ganhador,
  time,
  reservado,
  rotuloVago,
}: {
  temDono: boolean;
  ganhador: string | null;
  time?: TimeDeCS2 | null;
  reservado?: boolean;
  rotuloVago?: string;
}) {
  if (temDono) {
    return (
      <span className="ml-auto flex min-w-0 shrink items-center gap-1.5 rounded-full bg-gradient-to-l from-emerald-500/20 via-emerald-500/10 to-transparent py-1 pr-2 pl-5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
        <Trophy aria-hidden className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{nomeCurto(ganhador!)}</span>
        {/* O emblema depois do nome: quem varre a lista procura o próprio
            nome, e um escudo na frente atrasa a leitura de cada linha. */}
        {time && <EmblemaDoTime time={time} tamanho="sm" />}
      </span>
    );
  }

  if (reservado) {
    return (
      <Selo cor="amber" texto="Reservado">
        <Ponto className="bg-amber-500" />
      </Selo>
    );
  }

  if (!rotuloVago) return null;

  return (
    <Selo cor="emerald" texto={rotuloVago}>
      {/* O ponto pulsa porque este é o estado que convida a comprar, e para
          de pulsar para quem pediu menos movimento no sistema. */}
      <Ponto className="bg-emerald-500 motion-safe:animate-pulse" />
    </Selo>
  );
}

/**
 * O selo de estado sem dono, com o degradê morrendo para a esquerda.
 *
 * NO CELULAR SOBRA SÓ O PINGO. Numa tela de 390px, "DISPONÍVEL" come 85px, e
 * quem paga a conta é o nome da skin, que é o que vende: "★ Karambit |
 * Doppler" virava "★ Ka...". A cor já diz o estado, e o texto continua para
 * quem usa leitor de tela e reaparece a partir do tablet.
 */
function Selo({
  cor,
  texto,
  children,
}: {
  cor: "emerald" | "amber";
  texto: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "ml-auto flex shrink-0 items-center gap-1.5 rounded-full py-1 pr-2 pl-3 text-[11px] font-bold tracking-wide uppercase sm:pr-2.5 sm:pl-5",
        cor === "emerald"
          ? "bg-gradient-to-l from-emerald-500/20 via-emerald-500/10 to-transparent text-emerald-500 dark:text-emerald-400"
          : "bg-gradient-to-l from-amber-500/20 via-amber-500/10 to-transparent text-amber-500",
      )}
    >
      {children}
      <span className="sr-only sm:not-sr-only">{texto}</span>
    </span>
  );
}

/** O pingo de estado, do tamanho de um acento. */
function Ponto({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("h-1.5 w-1.5 shrink-0 rounded-full", className)}
    />
  );
}

/** O contador de contemplados sobre o total, igual nas três seções. */
export function ContadorDePremios({
  feitos,
  total,
}: {
  feitos: number;
  total: number;
}) {
  return (
    <span className="shrink-0 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-bold tabular-nums">
      {feitos}
      <span className="font-normal text-muted-foreground">/{total}</span>
    </span>
  );
}

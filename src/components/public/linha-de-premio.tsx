// A linha de prêmio, usada por "Títulos Premiados" e por "Caixas surpresas".
//
// Existia uma marcação para cada um. Ficam a menos de uma tela de distância na
// página da campanha e liam como dois produtos diferentes: um com o número em
// caixa sólida e o prêmio em texto solto, o outro com o prêmio dentro de uma
// pílula e sem número. Mesma informação, dois desenhos.
//
// O NOME DO PRÊMIO GANHA A LINHA INTEIRA
//
// Era esse o defeito de verdade. As três informações disputavam a largura na
// mesma linha, e no telefone sobravam uns 150px para o nome da skin. O
// resultado media 243px de texto em 173px de caixa: "SSG 08 | Emphorosaur-S
// (Field-Tested)" saía cortado, e "M4A1-S | Printstream (Field-Tested)"
// quebrava no meio da palavra, separando "(Field-" de "Tested)". O nome do
// prêmio e o que vende a campanha, e era ele que estava sendo espremido.
//
// Agora o nome ocupa a linha toda e o ganhador desce para a segunda, onde cabe
// inteiro. "Joao Vitor de Alencar" pedia 125px e recebia 90.
//
// O desgaste sai destacado do nome. Em CS2 "AK-47 | Vulcan" e "Field-Tested"
// sao dois fatos distintos, e jogar tudo no mesmo peso obriga a pessoa a ler a
// linha inteira para achar a condicao do item.
//
// O estado vira um fio na borda esquerda, e nao preenchimento do bloco todo.
// Com cinco de oito ja contemplados, o preenchimento solido virava uma parede
// verde sem ritmo, e o que ainda esta em jogo, que e o que sustenta a decisao
// de comprar, sumia no meio.

import type { SkinRarity } from "@prisma/client";
import { Trophy } from "lucide-react";

import { RARITY_TEXT_VAR } from "@/lib/cs2";
import { nomeCurto } from "@/lib/nome-curto";
import type { TimeDeCS2 } from "@/lib/times-cs2";
import { EmblemaDoTime } from "@/components/times/emblema-do-time";
import { separarDesgaste } from "@/lib/premio-nome";
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
  /** O que dizer quando ainda nao tem dono. */
  rotuloVago: string;
}) {
  const temDono = Boolean(ganhador);
  const { nome, desgaste } = separarDesgaste(premio);

  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-xl border border-l-[3px] px-3 py-2.5 transition-colors",
        temDono
          ? "border-emerald-500/25 border-l-emerald-500 bg-emerald-500/[0.06]"
          : "border-border/60 border-l-primary bg-muted/20",
      )}
    >
      {numero && (
        // Continua sendo o primeiro elemento da linha porque a pessoa varre
        // esta lista procurando o proprio numero. O que mudou foi o peso: era
        // o elemento mais alto da linha, em caixa solida, competindo com o
        // premio que ele so identifica.
        <span className="mt-px shrink-0 rounded-md bg-foreground/[0.07] px-2 py-1 text-[13px] font-bold tabular-nums text-foreground/80">
          {numero}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold leading-snug [overflow-wrap:anywhere]">
          {/* A cor da raridade, a mesma leitura que o jogador tem dentro do
              jogo: Oculta vermelha, Secreta rosa, faca dourada. Sai por
              variavel CSS porque a cor oficial da Valve reprova em contraste
              como texto, e cada tema precisa do seu tom. */}
          <span
            style={raridade ? { color: RARITY_TEXT_VAR[raridade] } : undefined}
          >
            {nome}
          </span>
          {desgaste && (
            // whitespace-nowrap: o desgaste e um rotulo compacto e desce
            // inteiro para a linha de baixo quando nao cabe. Sem isso o
            // navegador quebra no hifen e sai "Field-" numa linha e "Tested"
            // na outra, que e o defeito que esta correcao veio consertar.
            <span className="whitespace-nowrap font-medium text-muted-foreground">
              {" "}
              {desgaste}
            </span>
          )}
        </p>
        {temDono ? (
          <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <Trophy aria-hidden className="h-3.5 w-3.5 shrink-0" />
            <span className="[overflow-wrap:anywhere]">
              {nomeCurto(ganhador!)}
            </span>
            {/* O emblema depois do nome, e nao antes: quem varre esta lista
                procura o proprio nome, e um escudo na frente atrasa a leitura
                de cada linha. */}
            {time && <EmblemaDoTime time={time} tamanho="sm" />}
          </p>
        ) : reservado ? (
          <p className="mt-1 text-xs font-semibold text-amber-500">Reservado</p>
        ) : (
          <p className="mt-1 text-xs font-semibold text-primary">
            {rotuloVago}
          </p>
        )}
      </div>
    </li>
  );
}

/** O contador de contemplados sobre o total, igual nas duas seções. */
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

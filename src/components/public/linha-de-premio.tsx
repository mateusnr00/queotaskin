// A linha de prêmio, usada por "Títulos Premiados" e por "Caixas surpresas".
//
// Existia uma marcação para cada um. Ficam a menos de uma tela de distância na
// página da campanha e liam como dois produtos diferentes: um com o número em
// caixa sólida e o prêmio em texto solto, o outro com o prêmio dentro de uma
// pílula e sem número. Mesma informação, dois desenhos.
//
// A FOTO DA SKIN ENTRA NA LINHA
//
// Era o que faltava. A lista vendia uma skin sem mostrar a skin: quem chega na
// página vê o item grande no topo, desce até os títulos premiados e encontra
// três linhas de texto. O item que a pessoa pode levar por R$ 2,67 aparecia
// como uma frase, e frase não dá vontade de comprar.
//
// A foto vem do catálogo, casada pelo nome, e prêmio que não é skin ("R$ 500
// no Pix") continua sem foto: nesse caso o selo mostra a sigla da arma sobre o
// brilho da raridade, que é o mesmo desenho que a capa de campanha sem imagem
// usa. Espaço vazio nunca aparece, e o tamanho do selo é fixo, então a lista
// não pula quando as fotos terminam de carregar.
//
// O NOME DO PRÊMIO GANHA A LINHA INTEIRA
//
// As três informações disputavam a largura na mesma linha, e no telefone
// sobravam uns 150px para o nome da skin. O resultado media 243px de texto em
// 173px de caixa: "SSG 08 | Emphorosaur-S (Field-Tested)" saía cortado, e
// "M4A1-S | Printstream (Field-Tested)" quebrava no meio da palavra, separando
// "(Field-" de "Tested)".
//
// O desgaste sai destacado do nome, num chip. Em CS2 "AK-47 | Vulcan" e
// "Field-Tested" são dois fatos distintos, e jogar tudo no mesmo peso obriga a
// pessoa a ler a linha inteira para achar a condição do item.
//
// O NÚMERO CONTINUA SENDO O PRIMEIRO DA LINHA A SER LIDO
//
// Quem varre esta lista procura o próprio número, então ele não podia virar
// detalhe ao lado da foto. Ele fica acima do nome, alinhado na mesma posição
// em todas as linhas (o selo tem largura fixa), com tabular-nums para os
// dígitos caírem em coluna. A varredura vertical continua funcionando.
//
// O estado vira um fio na borda esquerda, e não preenchimento do bloco todo.
// Com cinco de oito já contemplados, o preenchimento sólido virava uma parede
// verde sem ritmo, e o que ainda está em jogo, que é o que sustenta a decisão
// de comprar, sumia no meio.

import type { SkinRarity } from "@prisma/client";
import { Trophy } from "lucide-react";

import { RARITY_TEXT_VAR, rarityColor } from "@/lib/cs2";
import { nomeCurto } from "@/lib/nome-curto";
import type { TimeDeCS2 } from "@/lib/times-cs2";
import { EmblemaDoTime } from "@/components/times/emblema-do-time";
import { RaffleCover } from "@/components/public/raffle-cover";
import { separarDesgaste } from "@/lib/premio-nome";
import { cn } from "@/lib/utils";

export function LinhaDePremio({
  numero,
  premio,
  raridade,
  imagem,
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
  /**
   * A foto da skin, resolvida no servidor. Ausente é caso normal: prêmio que
   * não é skin não tem foto, e o selo desenha a sigla da arma no lugar.
   */
  imagem?: string | null;
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
  /**
   * O que dizer quando ainda não tem dono. OPCIONAL: sem ele, a linha não
   * escreve nada nesse caso.
   *
   * Nos Títulos Premiados o "Em jogo" era ruído: prêmio ainda em jogo é o
   * estado da maioria das linhas, e repetir o óbvio em todas gastava a única
   * posição da linha onde a informação incomum, o "levou", precisa saltar.
   * Quem tem dono continua dizendo quem levou.
   */
  rotuloVago?: string;
}) {
  const temDono = Boolean(ganhador);
  const { nome, desgaste } = separarDesgaste(premio);
  const cor = rarityColor(raridade ?? null);

  return (
    <li
      className={cn(
        // overflow-hidden é o que faz o fio da esquerda seguir o canto
        // arredondado. Antes o fio era `border-l-[3px]`, e uma borda grossa
        // encontrando bordas de 1px num raio grande produz aquele bico: o
        // navegador desenha a junção em diagonal, e a esquerda aparecia como
        // um arco solto, deslocado do card.
        "relative flex items-center gap-3 overflow-hidden rounded-xl border p-2.5 pl-4 transition-colors",
        temDono
          ? "border-emerald-500/25 bg-emerald-500/[0.06]"
          : "border-border/60 bg-muted/20",
      )}
    >
      {/* O fio de estado, por dentro da moldura. */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-[3px]",
          temDono ? "bg-emerald-500" : "bg-primary",
        )}
      />

      {/* O SELO DA SKIN.
          Moldura dupla: a casca externa recebe o anel na cor da raridade e o
          miolo escuro segura a foto. É a mesma leitura de raridade que o
          jogador tem dentro do jogo, e é o que faz uma faca dourada se
          distinguir de uma AK azul antes de qualquer leitura de texto.

          Tamanho fixo em todos os estados: com a foto, sem a foto e enquanto
          ela carrega. Assim a lista nunca pula de altura. */}
      <span
        className="relative shrink-0 rounded-lg p-px"
        style={{
          // Anel na cor da raridade, mais forte no canto de cima: é o que
          // separa uma faca dourada de uma AK azul antes de qualquer leitura.
          background: `linear-gradient(150deg, ${cor}, ${cor}33 45%, ${cor}14)`,
        }}
      >
        <RaffleCover
          url={imagem ?? null}
          title={nome}
          skinName={nome}
          rarity={raridade ?? null}
          variant="selo"
          // A foto de skin é um render com fundo transparente e proporção
          // própria: cortar para preencher comeria o cano da arma.
          ajuste="conter"
          className="h-14 w-14 rounded-[7px] sm:h-16 sm:w-16"
          sizes="64px"
        />
      </span>

      <div className="min-w-0 flex-1">
        {numero && (
          // Acima do nome, e alinhado com o de todas as outras linhas: é por
          // ele que a pessoa varre a lista procurando o próprio título.
          <p className="mb-0.5 font-mono text-[11px] font-bold tracking-wider tabular-nums text-muted-foreground">
            Nº {numero}
          </p>
        )}

        <p className="text-sm font-semibold leading-snug [overflow-wrap:anywhere]">
          {/* A cor da raridade sai por variável CSS: a cor oficial da Valve
              reprova em contraste como texto, e cada tema precisa do seu tom. */}
          <span
            style={raridade ? { color: RARITY_TEXT_VAR[raridade] } : undefined}
          >
            {nome}
          </span>
        </p>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          {desgaste && (
            // Chip, e não texto solto colado no nome: o desgaste é um fato
            // separado do nome da pintura. whitespace-nowrap porque ele desce
            // inteiro para a linha de baixo quando não cabe, em vez de o
            // navegador quebrar no hífen e produzir "Field-" e "Tested".
            <span className="whitespace-nowrap rounded-md border border-border/70 bg-background/60 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              {desgaste}
            </span>
          )}

          {temDono ? (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <Trophy aria-hidden className="h-3.5 w-3.5 shrink-0" />
              <span className="[overflow-wrap:anywhere]">
                {nomeCurto(ganhador!)}
              </span>
              {/* O emblema depois do nome, e não antes: quem varre esta lista
                  procura o próprio nome, e um escudo na frente atrasa a
                  leitura de cada linha. */}
              {time && <EmblemaDoTime time={time} tamanho="sm" />}
            </span>
          ) : reservado ? (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-500">
              <Ponto className="bg-amber-500" />
              Reservado
            </span>
          ) : rotuloVago ? (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              {/* O ponto pulsa porque este é o estado que convida a comprar,
                  e para de pulsar para quem pediu menos movimento. */}
              <Ponto className="bg-primary motion-safe:animate-pulse" />
              {rotuloVago}
            </span>
          ) : null}
        </div>
      </div>
    </li>
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

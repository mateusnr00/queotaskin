"use client";

// O painel do preço de referência da skin, na criação e na edição do sorteio.
//
// A CONTA FICA À VISTA
//
// Sugerir "R$ 0,13" sem mostrar de onde saiu é pedir confiança cega num
// número que decide a arrecadação inteira da campanha. O painel mostra a
// cadeia toda: preço da skin, quantidade de cotas, a divisão exata, o
// arredondamento, quanto a campanha arrecada se vender tudo e quanto isso
// sobra sobre o valor da skin.
//
// O ARREDONDAMENTO É SEMPRE PARA CIMA
//
// R$ 1.249 em 10.000 números dá R$ 0,1249 e a cota fica em R$ 0,13. Para
// baixo, a campanha arrecadaria R$ 1.240 e nasceria R$ 9 no prejuízo por causa
// de um arredondamento. Para cima, a sobra é de no máximo um centavo por
// número, e a linha "diferença" existe para essa sobra não ser surpresa: em
// campanha grande ela vira centenas de reais.
//
// A FONTE É REFERÊNCIA, NÃO É AUTORIDADE
//
// Nada aqui trava o formulário. Steam fora do ar, skin sem anúncio ou limite
// de consulta viram uma frase explicando o que houve, e o preço da cota
// continua digitável à mão. Um painel que só funciona com serviço de terceiro
// no ar é um painel que não funciona.

import { RefreshCw, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/format";
import {
  arrecadacaoPrevista,
  precoExatoPorNumero,
  precoPorNumero,
} from "@/lib/dinheiro";
import { cn } from "@/lib/utils";

export interface PrecoDeReferencia {
  brl: number;
  medianaBrl: number | null;
  volume: number | null;
  buscadoEm: string;
  marketHashName: string;
}

/** Quatro casas, porque a divisão exata quase nunca cabe em duas. */
const EXATO = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

/** Há quanto tempo o preço foi buscado, em palavra e não em carimbo. */
function desdeQuando(iso: string): string {
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (!Number.isFinite(minutos) || minutos < 1) return "atualizado agora";
  if (minutos < 60) return `atualizado há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `atualizado há ${horas}h`;
  return `atualizado em ${new Date(iso).toLocaleDateString("pt-BR")}`;
}

export function PainelDoPrecoDaSteam({
  preco,
  totalDeNumeros,
  precoDaCota,
  buscando,
  erro,
  aoAtualizar,
  podeAtualizar,
  editadoAMao,
  aoUsarSugestao,
}: {
  preco: PrecoDeReferencia | null;
  totalDeNumeros: number;
  /** O preço que está no campo agora, que pode ter sido editado à mão. */
  precoDaCota: number | null;
  buscando: boolean;
  erro: string | null;
  aoAtualizar: () => void;
  /** Falso quando não há skin escolhida: não há o que consultar. */
  podeAtualizar: boolean;
  /** Quando true, a sugestão vira oferta em vez de preencher o campo. */
  editadoAMao: boolean;
  aoUsarSugestao: (valor: number) => void;
}) {
  const exato = preco ? precoExatoPorNumero(preco.brl, totalDeNumeros) : null;
  const sugerido = preco ? precoPorNumero(preco.brl, totalDeNumeros) : null;
  // A arrecadação usa o preço QUE ESTÁ NO CAMPO, e não o sugerido: se a
  // pessoa baixou a cota à mão, ela precisa ver a arrecadação que a escolha
  // dela produz, não a que a sugestão produziria.
  const cota = precoDaCota ?? sugerido;
  const arrecadacao = cota ? arrecadacaoPrevista(cota, totalDeNumeros) : null;
  const diferenca =
    preco && arrecadacao != null ? arrecadacao - preco.brl : null;
  const percentual =
    preco && diferenca != null && preco.brl > 0
      ? (diferenca / preco.brl) * 100
      : null;

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
            <TrendingUp aria-hidden className="h-3 w-3" />
            Preço da Steam
          </p>
          {buscando ? (
            <p className="mt-0.5 text-sm text-muted-foreground">
              Buscando preço na Steam...
            </p>
          ) : preco ? (
            <p className="mt-0.5 text-lg font-black tabular-nums">
              {formatBRL(preco.brl)}
              <span className="ml-2 align-middle text-[11px] font-normal text-muted-foreground">
                {desdeQuando(preco.buscadoEm)}
              </span>
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-muted-foreground">
              Sem preço da Steam ainda.
            </p>
          )}
        </div>

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 shrink-0"
          disabled={buscando || !podeAtualizar}
          onClick={aoAtualizar}
        >
          <RefreshCw
            aria-hidden
            className={cn(
              "mr-1.5 h-3.5 w-3.5",
              buscando && "motion-safe:animate-spin",
            )}
          />
          {buscando ? "Buscando..." : preco ? "Atualizar preço" : "Buscar preço"}
        </Button>
      </div>

      {erro && (
        // Aviso, e não bloqueio: o campo de preço continua editável embaixo.
        <p className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-[11px] leading-relaxed text-amber-500">
          {erro}
        </p>
      )}

      {!preco && !buscando && !erro && (
        // A fonte é opcional, e a tela diz isso antes de alguém clicar.
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          O preço da cota pode ser preenchido à mão. Buscar é atalho, não
          obrigação: a consulta é a uma fonte externa que pode estar fora do
          ar ou recusar a chamada.
        </p>
      )}

      {preco && (
        <dl className="space-y-1 text-xs">
          <Linha
            rotulo="Quantidade de números"
            valor={totalDeNumeros > 0 ? totalDeNumeros.toLocaleString("pt-BR") : "-"}
          />
          <Linha
            rotulo="Preço exato por número"
            valor={exato != null ? EXATO.format(exato) : "-"}
          />
          <Linha
            rotulo="Preço sugerido"
            valor={sugerido != null ? formatBRL(sugerido) : "-"}
            destaque
          />
          <Linha
            rotulo="Arrecadação prevista"
            valor={arrecadacao != null ? formatBRL(arrecadacao) : "-"}
          />
          {diferenca != null && percentual != null && (
            <Linha
              rotulo="Diferença sobre o valor da skin"
              valor={`${diferenca >= 0 ? "+" : "-"} ${formatBRL(Math.abs(diferenca))} (${
                diferenca >= 0 ? "+" : "-"
              }${Math.abs(percentual).toFixed(2).replace(".", ",")}%)`}
              // Abaixo do valor da skin é o caso que precisa saltar: a
              // campanha arrecada menos do que o prêmio custa.
              alerta={diferenca < 0}
            />
          )}
          {preco.medianaBrl != null && (
            <Linha
              rotulo="Mediana das vendas recentes"
              valor={formatBRL(preco.medianaBrl)}
            />
          )}
          {/* A OFERTA, EM VEZ DA SUBSTITUIÇÃO.
              Quem digitou um preço não o perde porque a quantidade de cotas
              mudou ou porque o preço foi buscado de novo. A sugestão nova
              aparece aqui, com um botão, e aplicar é outra decisão. */}
          {editadoAMao && sugerido != null && sugerido !== precoDaCota && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/25 bg-primary/[0.06] px-3 py-2">
              <p className="text-[11px] leading-relaxed">
                Novo preço sugerido:{" "}
                <b className="font-semibold text-primary">
                  {formatBRL(sugerido)}
                </b>
                . O seu preço foi mantido.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 shrink-0 text-[11px]"
                onClick={() => aoUsarSugestao(sugerido)}
              >
                Usar este preço
              </Button>
            </div>
          )}

          {preco.volume != null && preco.volume < 5 && (
            <p className="pt-1 text-[11px] leading-relaxed text-amber-500">
              Só {preco.volume} venda{preco.volume === 1 ? "" : "s"} nas últimas
              24h. Com esse giro, o preço da Steam oscila muito e vale conferir
              à mão.
            </p>
          )}
        </dl>
      )}
    </div>
  );
}

function Linha({
  rotulo,
  valor,
  destaque,
  alerta,
}: {
  rotulo: string;
  valor: string;
  destaque?: boolean;
  alerta?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd
        className={cn(
          "shrink-0 font-semibold tabular-nums",
          destaque && "text-primary",
          alerta && "text-red-400",
        )}
      >
        {valor}
      </dd>
    </div>
  );
}

"use client";

// Quanto cada gateway cobra, para o relatório parar de contar como receita um
// dinheiro que nunca chegou.
//
// Uma linha por FAIXA de valor, porque é assim que eles cobram: até cem reais
// um fixo, acima disso um percentual mais outro fixo. Um par único de
// percentual e fixo erraria justamente nas compras grandes, que são as que
// pesam no fim do mês.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

import { salvarTaxasDoGatewayAction } from "@/server/actions/payment-settings";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBRL } from "@/lib/format";
// A conta do exemplo é a MESMA do relatório, importada e não recriada aqui:
// duas versões da regra de taxa divergiriam no primeiro ajuste, e a tela
// passaria a prometer um desconto diferente do que o relatório aplica.
import {
  descreverFaixa,
  taxaDaCompra,
  type FaixaDeTaxa,
} from "@/lib/taxa-de-gateway";

export type GatewayComTaxa = "SYNCPAY" | "SIGILOPAY" | "NEXUSPAG" | "HORSEPAY";

const ROTULO: Record<GatewayComTaxa, string> = {
  SYNCPAY: "SyncPay",
  SIGILOPAY: "SigiloPay",
  NEXUSPAG: "NexusPag",
  HORSEPAY: "HorsePay",
};

const GATEWAYS = Object.keys(ROTULO) as GatewayComTaxa[];

/** Uma linha em edição: texto, porque campo numérico vazio não é zero. */
interface LinhaDeFaixa {
  apartirDe: string;
  percentual: string;
  fixo: string;
}

function paraLinha(f: FaixaDeTaxa): LinhaDeFaixa {
  return {
    apartirDe: String(f.apartirDe),
    percentual: String(f.percentual),
    fixo: String(f.fixo),
  };
}

/** Vírgula é como se digita dinheiro em português, e o input aceita as duas. */
function numero(texto: string): number {
  const n = Number(texto.replace(",", ".").trim());
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function TaxasDoGateway({
  taxasPorGateway,
}: {
  taxasPorGateway: Record<string, FaixaDeTaxa[]>;
}) {
  const router = useRouter();
  const [gateway, setGateway] = useState<GatewayComTaxa>("SYNCPAY");
  const [linhas, setLinhas] = useState<LinhaDeFaixa[]>(() =>
    (taxasPorGateway.SYNCPAY ?? []).map(paraLinha),
  );
  const [isPending, startTransition] = useTransition();

  function trocarGateway(proximo: GatewayComTaxa) {
    setGateway(proximo);
    setLinhas((taxasPorGateway[proximo] ?? []).map(paraLinha));
  }

  function alterar(idx: number, chave: keyof LinhaDeFaixa, valor: string) {
    setLinhas((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, [chave]: valor } : l)),
    );
  }

  function salvar() {
    const faixas = linhas.map((l) => ({
      apartirDe: numero(l.apartirDe),
      percentual: numero(l.percentual),
      fixo: numero(l.fixo),
    }));
    startTransition(async () => {
      const r = await salvarTaxasDoGatewayAction({ provider: gateway, faixas });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Taxas do ${ROTULO[gateway]} salvas`);
      router.refresh();
    });
  }

  const previa = linhas.map((l) => ({
    apartirDe: numero(l.apartirDe),
    percentual: numero(l.percentual),
    fixo: numero(l.fixo),
  }));

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="text-base font-semibold">Taxas do gateway</h2>
        <p className="text-sm text-muted-foreground">
          O que o gateway fica de cada pagamento aprovado. O relatório desconta
          isso do faturamento, e a campanha passa a mostrar quanto sobrou de
          verdade.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Gateway</Label>
        <Select
          value={gateway}
          onValueChange={(v) => v && trocarGateway(v as GatewayComTaxa)}
        >
          <SelectTrigger className="w-full sm:w-72">
            <SelectValue labels={ROTULO} />
          </SelectTrigger>
          <SelectContent>
            {GATEWAYS.map((g) => (
              <SelectItem key={g} value={g}>
                {ROTULO[g]}
                {(taxasPorGateway[g]?.length ?? 0) > 0 ? " · configurado" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Cada gateway tem a sua tabela. Trocar aqui não salva o anterior: salve
          antes de mudar.
        </p>
      </div>

      <div className="space-y-2">
        <div className="hidden gap-2 px-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase sm:grid sm:grid-cols-[1fr_1fr_1fr_auto]">
          <span>A partir de (R$)</span>
          <span>Percentual (%)</span>
          <span>Fixo (R$)</span>
          <span className="w-9" />
        </div>

        {linhas.length === 0 && (
          <p className="rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-3 text-xs text-muted-foreground">
            Sem faixa cadastrada, o relatório não desconta nada deste gateway e
            avisa que o líquido está incompleto.
          </p>
        )}

        {linhas.map((linha, idx) => (
          <div
            key={idx}
            className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-center"
          >
            <div className="space-y-1">
              <Label className="text-xs sm:hidden">A partir de (R$)</Label>
              <Input
                inputMode="decimal"
                placeholder="0"
                value={linha.apartirDe}
                onChange={(e) => alterar(idx, "apartirDe", e.target.value)}
                className="tabular-nums"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs sm:hidden">Percentual (%)</Label>
              <Input
                inputMode="decimal"
                placeholder="0"
                value={linha.percentual}
                onChange={(e) => alterar(idx, "percentual", e.target.value)}
                className="tabular-nums"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs sm:hidden">Fixo (R$)</Label>
              <Input
                inputMode="decimal"
                placeholder="0,45"
                value={linha.fixo}
                onChange={(e) => alterar(idx, "fixo", e.target.value)}
                className="tabular-nums"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              onClick={() =>
                setLinhas((prev) => prev.filter((_, i) => i !== idx))
              }
              aria-label="Remover faixa"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 rounded-full"
          onClick={() =>
            setLinhas((prev) => [
              ...prev,
              {
                apartirDe: prev.length === 0 ? "0" : "",
                percentual: "",
                fixo: "",
              },
            ])
          }
        >
          <Plus className="h-4 w-4" />
          Nova faixa
        </Button>
      </div>

      {/* A regra escrita por extenso, do jeito que ela vai valer.
          Três campos numéricos não dizem se "2 e 0,65 a partir de 100" cobra
          dois por cento ou dois reais, e o erro só apareceria no fim do mês. */}
      {previa.length > 0 && (
        <div className="space-y-1 rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-3">
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Como vai ser cobrado
          </p>
          {[...previa]
            .sort((a, b) => a.apartirDe - b.apartirDe)
            .map((f, i) => (
              <p key={i} className="text-xs text-muted-foreground">
                {descreverFaixa(f, formatBRL)}
              </p>
            ))}
          <p className="pt-1 text-[11px] text-muted-foreground">
            Exemplo: numa compra de {formatBRL(150)}, o gateway ficaria com{" "}
            <strong className="text-foreground">
              {formatBRL(taxaDaCompra(150, previa))}
            </strong>
            .
          </p>
        </div>
      )}

      <div className="flex justify-end border-t border-white/10 pt-4">
        <Button type="button" onClick={salvar} disabled={isPending}>
          {isPending ? "Salvando..." : `Salvar taxas do ${ROTULO[gateway]}`}
        </Button>
      </div>
    </Card>
  );
}

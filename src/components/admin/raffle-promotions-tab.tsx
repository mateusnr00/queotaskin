"use client";

// Aba "Promoções" no editar-sorteio. Espelha o painel do SkinsLendarias:
//
// - Switch "Ativar Promoção em Dobro" (cliente recebe 2x os números pelo
//   mesmo valor; só persistido por enquanto — lógica de multiplicação na
//   reserva é TODO no createReservation).
// - Switch "Ativar Promoções" (master da seção).
// - Select "Tipo de promoção" (QTY = combo fixo "N por R$ X" / MORE_THAN
//   = tier "A partir de N pague R$ X").
// - Switch "Acumulativo" (múltiplas promoções somam num pedido).
// - Lista de promoções com quantidade + preço + rótulo + tipo.

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, Info, Plus, Trash2 } from "lucide-react";

import { setRafflePromotionsAction } from "@/server/actions/raffle-content";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MAX_PROMOS = 20;

// "Promoção em Dobro" só faz sentido quando o teto de cotas por compra
// está baixo o bastante pra dobrar sem estourar a rifa (regra do
// SkinsLendarias). Mantém a paridade UX com o painel deles.
const DOUBLE_MAX_PURCHASE_LIMIT = 20_000;

type PromoType = "QTY" | "MORE_THAN";

interface PromoRow {
  quantity: string;
  price: string;
  label: string;
  type: PromoType;
}

interface Props {
  raffleId: string;
  maxPurchase: number | null;
  initialPromotions: {
    quantity: number;
    price: number;
    label: string | null;
    type?: PromoType;
  }[];
  initialConfig: {
    enabled: boolean;
    doubleEnabled: boolean;
    accumulative: boolean;
  };
}

export function RafflePromotionsTab({
  raffleId,
  maxPurchase,
  initialPromotions,
  initialConfig,
}: Props) {
  const [enabled, setEnabled] = useState(initialConfig.enabled);
  const [doubleEnabled, setDoubleEnabled] = useState(
    initialConfig.doubleEnabled
  );
  const [accumulative, setAccumulative] = useState(initialConfig.accumulative);

  const [promos, setPromos] = useState<PromoRow[]>(
    initialPromotions.length > 0
      ? initialPromotions.map((p) => ({
          quantity: String(p.quantity),
          price: p.price.toFixed(2),
          label: p.label ?? "",
          type: (p.type ?? "QTY") as PromoType,
        }))
      : [{ quantity: "", price: "", label: "", type: "QTY" }]
  );
  const [isPending, startTransition] = useTransition();

  // Tipo "padrão" da seção — vale como default pra novas linhas, e o
  // SkinsLendarias mostra um único select grande no topo (vez de por linha).
  // Mantemos a edição por linha pra dar flexibilidade, mas o select do
  // topo aplica a todas quando muda.
  const [bulkType, setBulkType] = useState<PromoType>(
    promos[0]?.type ?? "QTY"
  );

  function update(idx: number, key: keyof PromoRow, value: string) {
    setPromos((prev) =>
      prev.map((p, i) =>
        i === idx ? { ...p, [key]: value } : p
      )
    );
  }

  function applyTypeToAll(t: PromoType) {
    setBulkType(t);
    setPromos((prev) => prev.map((p) => ({ ...p, type: t })));
  }

  function add() {
    if (promos.length >= MAX_PROMOS) return;
    setPromos((prev) => [
      ...prev,
      { quantity: "", price: "", label: "", type: bulkType },
    ]);
  }

  function remove(idx: number) {
    setPromos((prev) =>
      prev.length === 1
        ? [{ quantity: "", price: "", label: "", type: bulkType }]
        : prev.filter((_, i) => i !== idx)
    );
  }

  function save() {
    const cleaned = promos
      .filter((p) => p.quantity.trim() && p.price.trim())
      .map((p) => ({
        quantity: Number(p.quantity),
        price: Number(p.price.replace(",", ".")),
        label: p.label.trim() || null,
        type: p.type,
      }));
    startTransition(async () => {
      const result = await setRafflePromotionsAction({
        raffleId,
        enabled,
        doubleEnabled,
        accumulative,
        promotions: cleaned,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Promoções salvas");
    });
  }

  const doubleLimitExceeded =
    doubleEnabled &&
    typeof maxPurchase === "number" &&
    maxPurchase > DOUBLE_MAX_PURCHASE_LIMIT;
  const filledCount = promos.filter(
    (p) => p.quantity.trim() && p.price.trim()
  ).length;

  return (
    <Card className="p-5 md:p-6 space-y-5">
      {/* Infobox topo */}
      <div className="flex gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-sm">
        <Info className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300 mt-0.5" />
        <p className="text-blue-900 dark:text-blue-200">
          Ofereça pros clientes opções de promoções. Cadastre até{" "}
          {MAX_PROMOS} promoções.
        </p>
      </div>

      {/* Switch Promoção em Dobro */}
      <div className="space-y-3 border-t pt-4">
        <ToggleRow
          checked={doubleEnabled}
          onChange={setDoubleEnabled}
          label="Ativar Promoção em Dobro"
          description="Cliente recebe o dobro dos números pelo mesmo valor pago. (Ainda não implementado na geração de tickets — só salva a configuração por enquanto.)"
        />
        {doubleEnabled && (
          <div className="flex gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-xs">
            <Info className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300 mt-0.5" />
            <div className="text-blue-900 dark:text-blue-200 space-y-1">
              <p>
                A promoção em dobro vale automaticamente pra todos os clientes
                que comprarem nesse período. O multiplicador é aplicado na
                quantidade de números recebidos; o valor pago não muda.
              </p>
              <p>
                <strong>Exemplo:</strong> cliente compra 100 números → recebe
                200.
              </p>
            </div>
          </div>
        )}
        {doubleLimitExceeded && (
          <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs">
            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
            <div className="text-destructive">
              <p>
                Pra usar a Promoção em Dobro, o limite máximo de cotas por
                compra precisa ser ≤{" "}
                {DOUBLE_MAX_PURCHASE_LIMIT.toLocaleString("pt-BR")}. Hoje está
                em {maxPurchase!.toLocaleString("pt-BR")}.
              </p>
              <p className="mt-1 text-muted-foreground">
                Ajusta o &ldquo;Máximo por compra&rdquo; na aba Geral antes de
                ativar.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Switch Ativar Promoções */}
      <div className="border-t pt-4">
        <ToggleRow
          checked={enabled}
          onChange={setEnabled}
          label="Ativar Promoções"
          description="Liga/desliga toda a seção de combos. Quando off, o público não vê os botões de compra rápida."
        />
      </div>

      {/* Tipo + Acumulativo */}
      {enabled && (
        <div className="border-t pt-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div className="space-y-1.5">
              <Label>Tipo de promoção</Label>
              <Select
                value={bulkType}
                onValueChange={(v) =>
                  v && applyTypeToAll(v as PromoType)
                }
              >
                <SelectTrigger>
                  <SelectValue
                    labels={{
                      QTY: "Por quantidade de cotas...",
                      MORE_THAN: "A partir de x cotas pague...",
                    }}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="QTY">
                    Por quantidade de cotas...
                  </SelectItem>
                  <SelectItem value="MORE_THAN">
                    A partir de x cotas pague...
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3 md:pb-2">
              <Switch
                checked={accumulative}
                onCheckedChange={setAccumulative}
              />
              <Label className="text-sm">Acumulativo</Label>
            </div>
          </div>

          {/* Lista */}
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Promoções</p>
              <span className="text-xs text-muted-foreground tabular-nums">
                {filledCount}/{MAX_PROMOS}
              </span>
            </div>

            {promos.length === 0 ||
            (promos.length === 1 && !promos[0]!.quantity && !promos[0]!.price) ? (
              <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300 mt-0.5" />
                <p className="text-amber-900 dark:text-amber-200">
                  Nenhuma promoção cadastrada até o momento.
                </p>
              </div>
            ) : null}

            {promos.map((p, idx) => (
              <div
                key={idx}
                className="grid gap-2 sm:grid-cols-[1fr_1fr_1.5fr_auto] items-end"
              >
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    {p.type === "MORE_THAN" ? "A partir de" : "Quantidade"}
                  </Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={p.quantity}
                    onChange={(e) => update(idx, "quantity", e.target.value)}
                    placeholder="10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    {p.type === "MORE_THAN" ? "Pague R$" : "Preço (R$)"}
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={p.price}
                    onChange={(e) => update(idx, "price", e.target.value)}
                    placeholder="22.50"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Rótulo (opcional)</Label>
                  <Input
                    value={p.label}
                    onChange={(e) => update(idx, "label", e.target.value)}
                    placeholder="Mais popular"
                    maxLength={60}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => remove(idx)}
                  aria-label="Remover"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            {promos.length < MAX_PROMOS && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={add}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Nova promoção
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-end pt-3 border-t">
        <Button type="button" onClick={save} disabled={isPending}>
          {isPending ? "Salvando..." : "Salvar promoções"}
        </Button>
      </div>
    </Card>
  );
}

function ToggleRow({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Switch checked={checked} onCheckedChange={onChange} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
    </div>
  );
}

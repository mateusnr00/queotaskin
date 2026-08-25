"use client";

// Editor de um prêmio com metadados de skin de CS2.
//
// A descrição é o único campo obrigatório — prêmios que não são skin
// (saldo, periférico) usam só ela e deixam o bloco de skin fechado. Quando
// o admin preenche o float, o desgaste é sugerido automaticamente a partir
// das faixas oficiais da Valve, porque errar isso é fácil e o comprador
// percebe na hora.

import { ChevronDown, Trash2 } from "lucide-react";
import type { SkinRarity, SkinWear } from "@prisma/client";

import { RarityBadge } from "@/components/cs2/rarity-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RARITY_LABEL, WEAR_LABEL, WEAR_RANGE, wearFromFloat } from "@/lib/cs2";

export interface PrizeDraft {
  description: string;
  imageUrl: string;
  skinName: string;
  skinRarity: SkinRarity | null;
  skinWear: SkinWear | null;
  skinFloat: number | null;
  skinStatTrak: boolean;
  skinSouvenir: boolean;
  skinValueBrl: number | null;
  skinCollection: string;
  skinInspectUrl: string;
}

export const EMPTY_PRIZE: PrizeDraft = {
  description: "",
  imageUrl: "",
  skinName: "",
  skinRarity: null,
  skinWear: null,
  skinFloat: null,
  skinStatTrak: false,
  skinSouvenir: false,
  skinValueBrl: null,
  skinCollection: "",
  skinInspectUrl: "",
};

export function SkinPrizeEditor({
  index,
  prize,
  onChange,
  onRemove,
}: {
  index: number;
  prize: PrizeDraft;
  onChange: (patch: Partial<PrizeDraft>) => void;
  onRemove: () => void;
}) {
  // Desgaste que o float informado implica. Serve como alerta quando o
  // admin escolhe um desgaste que não bate com o float digitado.
  const impliedWear = prize.skinFloat != null ? wearFromFloat(prize.skinFloat) : null;
  const wearMismatch =
    impliedWear != null && prize.skinWear != null && impliedWear !== prize.skinWear;

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label className="text-xs">Prêmio {index + 1}º colocado</Label>
          <Input
            value={prize.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Ex: ★ Karambit | Doppler (Nova de Fábrica)"
            maxLength={500}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onRemove}
          aria-label="Remover prêmio"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <details className="group rounded-lg border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-semibold hover:bg-muted/50">
          <span className="inline-flex items-center gap-2">
            Ficha da skin (CS2)
            {prize.skinRarity && <RarityBadge rarity={prize.skinRarity} />}
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>

        <div className="space-y-3 border-t p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome da skin">
              <Input
                value={prize.skinName}
                onChange={(e) => onChange({ skinName: e.target.value })}
                placeholder="★ Karambit | Doppler"
                maxLength={200}
              />
            </Field>

            <Field label="Imagem da skin (URL)">
              <Input
                value={prize.imageUrl}
                onChange={(e) => onChange({ imageUrl: e.target.value })}
                placeholder="https://..."
                maxLength={2048}
              />
            </Field>

            <Field label="Raridade">
              <select
                value={prize.skinRarity ?? ""}
                onChange={(e) =>
                  onChange({
                    skinRarity: e.target.value
                      ? (e.target.value as SkinRarity)
                      : null,
                  })
                }
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Não informar</option>
                {Object.entries(RARITY_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Desgaste">
              <select
                value={prize.skinWear ?? ""}
                onChange={(e) =>
                  onChange({
                    skinWear: e.target.value ? (e.target.value as SkinWear) : null,
                  })
                }
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Não informar</option>
                {Object.entries(WEAR_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label} ({WEAR_RANGE[value as SkinWear][0]}–
                    {WEAR_RANGE[value as SkinWear][1]})
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Float">
              <Input
                type="number"
                step="0.0000001"
                min={0}
                max={1}
                value={prize.skinFloat ?? ""}
                onChange={(e) =>
                  onChange({
                    skinFloat: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                placeholder="0.0083421"
              />
            </Field>

            <Field label="Valor de mercado (R$)">
              <Input
                type="number"
                step="0.01"
                min={0}
                value={prize.skinValueBrl ?? ""}
                onChange={(e) =>
                  onChange({
                    skinValueBrl:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                placeholder="4890.00"
              />
            </Field>

            <Field label="Coleção">
              <Input
                value={prize.skinCollection}
                onChange={(e) => onChange({ skinCollection: e.target.value })}
                placeholder="Coleção Gamma 2"
                maxLength={160}
              />
            </Field>

            <Field label="Link de inspeção no jogo">
              <Input
                value={prize.skinInspectUrl}
                onChange={(e) => onChange({ skinInspectUrl: e.target.value })}
                placeholder="steam://rungame/730/..."
                maxLength={2048}
              />
            </Field>
          </div>

          {wearMismatch && impliedWear && (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              O float {prize.skinFloat} corresponde a{" "}
              <strong>{WEAR_LABEL[impliedWear]}</strong>, não a{" "}
              {WEAR_LABEL[prize.skinWear!]}.{" "}
              <button
                type="button"
                onClick={() => onChange({ skinWear: impliedWear })}
                className="font-semibold underline"
              >
                Corrigir para {WEAR_LABEL[impliedWear]}
              </button>
            </p>
          )}

          <div className="flex flex-wrap gap-5 border-t pt-3">
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={prize.skinStatTrak}
                onCheckedChange={(v) =>
                  onChange({ skinStatTrak: v, skinSouvenir: v ? false : prize.skinSouvenir })
                }
              />
              StatTrak™
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={prize.skinSouvenir}
                onCheckedChange={(v) =>
                  onChange({ skinSouvenir: v, skinStatTrak: v ? false : prize.skinStatTrak })
                }
              />
              Souvenir
            </label>
          </div>
        </div>
      </details>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

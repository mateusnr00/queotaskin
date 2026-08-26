"use client";

// Form de personalização do tema inspirado no Sorteamos:
// - Modo (Claro / Escuro), 2 cards grandes com ícone
// - Cor de destaque, grid de swatches selecionáveis
// - Toggle "Header com cor do destaque"
// - Select "Cor dos cards de seleção"
//
// Salva automaticamente em cada mudança (não tem botão "Salvar"),
// igual ao Sorteamos, com toast de confirmação.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Moon, Sun } from "lucide-react";
import { toast } from "sonner";

import { updateThemeAction } from "@/server/actions/settings";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  THEME_PRESETS,
  THEME_PRESET_KEYS,
  type ThemePresetKey,
} from "@/lib/theme-presets";
import { cn } from "@/lib/utils";

type ThemeMode = "LIGHT" | "DARK";
type CardColor = "black" | "white" | "accent";

interface ThemeFormProps {
  initialMode: ThemeMode;
  initialPreset: ThemePresetKey;
  initialHeaderAccent: boolean;
  initialCardColor: CardColor;
}

export function ThemeForm({
  initialMode,
  initialPreset,
  initialHeaderAccent,
  initialCardColor,
}: ThemeFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<ThemeMode>(initialMode);
  const [preset, setPreset] = useState<ThemePresetKey>(initialPreset);
  const [headerAccent, setHeaderAccent] = useState(initialHeaderAccent);
  const [cardColor, setCardColor] = useState<CardColor>(initialCardColor);
  const [isPending, startTransition] = useTransition();

  function apply(update: Record<string, unknown>, successMsg: string) {
    startTransition(async () => {
      const result = await updateThemeAction(update);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(successMsg);
      router.refresh();
    });
  }

  function pickMode(next: ThemeMode) {
    if (next === mode) return;
    setMode(next);
    apply({ themeMode: next }, "Modo atualizado");
  }

  function pickPreset(next: ThemePresetKey) {
    if (next === preset) return;
    setPreset(next);
    apply({ themePreset: next }, "Cor de destaque atualizada");
  }

  function toggleHeaderAccent(next: boolean) {
    setHeaderAccent(next);
    apply(
      { headerAccent: next },
      next ? "Header pintado de destaque" : "Header neutro"
    );
  }

  function pickCardColor(next: CardColor) {
    if (next === cardColor) return;
    setCardColor(next);
    apply({ cardColor: next }, "Cor dos cards atualizada");
  }

  return (
    <div className="space-y-6">
      {/* Modo */}
      <Section title="Modo">
        <div className="grid grid-cols-2 gap-3">
          <ModeCard
            label="Claro"
            icon={Sun}
            active={mode === "LIGHT"}
            disabled={isPending}
            onClick={() => pickMode("LIGHT")}
          />
          <ModeCard
            label="Escuro"
            icon={Moon}
            active={mode === "DARK"}
            disabled={isPending}
            onClick={() => pickMode("DARK")}
          />
        </div>
      </Section>

      {/* Cor de destaque */}
      <Section title="Cor de destaque">
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
          {THEME_PRESET_KEYS.map((key) => {
            const p = THEME_PRESETS[key];
            const active = key === preset;
            return (
              <button
                key={key}
                type="button"
                onClick={() => pickPreset(key)}
                disabled={isPending}
                title={p.label}
                aria-label={`Cor ${p.label}`}
                aria-pressed={active}
                className={cn(
                  "relative aspect-square rounded-xl border-2 transition-all flex items-center justify-center",
                  active
                    ? "border-foreground/40 shadow-sm scale-105"
                    : "border-transparent hover:border-foreground/20"
                )}
                style={{ background: p.color }}
              >
                {active && (
                  <Check
                    className="h-5 w-5"
                    style={{ color: p.foreground }}
                    strokeWidth={3}
                  />
                )}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          A cor afeta botões, badges e destaques em todo o site.
        </p>
      </Section>

      {/* Header com cor do destaque */}
      <Section title="Header da página de vendas">
        <label className="flex items-start justify-between gap-3 rounded-lg border bg-muted/30 p-3 cursor-pointer">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">
              Pintar o cabeçalho com a cor de destaque
            </p>
            <p className="text-xs text-muted-foreground">
              Quando ativo, o header do site público fica colorido. Ajuda a
              destacar a marca, mas só funciona bem em cores escuras.
            </p>
          </div>
          <Switch
            checked={headerAccent}
            onCheckedChange={toggleHeaderAccent}
            disabled={isPending}
          />
        </label>
      </Section>

      {/* Cor dos cards */}
      <Section title="Cor dos cards de seleção de títulos">
        <Select
          value={cardColor}
          onValueChange={(v) => v && pickCardColor(v as CardColor)}
          disabled={isPending}
        >
          <SelectTrigger className="w-full sm:w-60">
            <SelectValue
              labels={{
                black: "Preto",
                white: "Branco",
                accent: "Cor do destaque",
              }}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="black">Preto</SelectItem>
            <SelectItem value="white">Branco</SelectItem>
            <SelectItem value="accent">Cor do destaque</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-2">
          Aplica aos botões de compra rápida (+5, +10…) na página do sorteio.
        </p>
      </Section>

    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5 space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </Card>
  );
}

function ModeCard({
  label,
  icon: Icon,
  active,
  disabled,
  onClick,
}: {
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "rounded-xl border-2 p-6 flex flex-col items-center gap-2 transition-all",
        active
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/40",
        disabled && "opacity-60 cursor-not-allowed"
      )}
    >
      <Icon className={cn("h-8 w-8", active && "text-primary")} />
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}

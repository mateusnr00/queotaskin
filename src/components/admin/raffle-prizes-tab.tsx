"use client";

// Aba "Prêmios" no editar-sorteio. Espelha o painel do SkinsLendarias:
// - Switch "Disponibilizar E-book" + 4 campos (título, texto, URL, label do
//   botão). Liberado pro cliente após o pagamento.
// - Switch "Mostrar Prêmios" (toggle de visibilidade da seção pública).
// - Lista de prêmios numerados ("Prêmio 1º colocado", etc), até 10.

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { BookOpen, Info, Plus, Trash2 } from "lucide-react";

import { setRafflePrizesAction } from "@/server/actions/raffle-content";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const MAX_PRIZES = 10;

interface EbookConfig {
  enabled: boolean;
  title: string;
  text: string;
  url: string;
  buttonText: string;
}

interface Props {
  raffleId: string;
  initialPrizes: { description: string }[];
  initialConfig: {
    show: boolean;
    ebook: EbookConfig;
  };
}

export function RafflePrizesTab({
  raffleId,
  initialPrizes,
  initialConfig,
}: Props) {
  const [show, setShow] = useState(initialConfig.show);
  const [ebook, setEbook] = useState<EbookConfig>(initialConfig.ebook);

  const [prizes, setPrizes] = useState<string[]>(
    initialPrizes.length > 0
      ? initialPrizes.map((p) => p.description)
      : [""]
  );
  const [isPending, startTransition] = useTransition();

  function updatePrize(idx: number, value: string) {
    setPrizes((prev) => prev.map((p, i) => (i === idx ? value : p)));
  }
  function addPrize() {
    if (prizes.length >= MAX_PRIZES) return;
    setPrizes((prev) => [...prev, ""]);
  }
  function removePrize(idx: number) {
    setPrizes((prev) =>
      prev.length === 1 ? [""] : prev.filter((_, i) => i !== idx)
    );
  }

  function updateEbook<K extends keyof EbookConfig>(key: K, value: EbookConfig[K]) {
    setEbook((prev) => ({ ...prev, [key]: value }));
  }

  function save() {
    const cleaned = prizes
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
      .map((description) => ({ description }));

    startTransition(async () => {
      const result = await setRafflePrizesAction({
        raffleId,
        show,
        ebookEnabled: ebook.enabled,
        ebookTitle: ebook.title,
        ebookText: ebook.text,
        ebookUrl: ebook.url,
        ebookButtonText: ebook.buttonText,
        prizes: cleaned,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Prêmios salvos");
    });
  }

  return (
    <Card className="p-5 md:p-6 space-y-5">
      <div className="flex gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-sm">
        <Info className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300 mt-0.5" />
        <p className="text-blue-900 dark:text-blue-200">
          Informe os prêmios pelos quais os participantes concorrem. Você pode
          cadastrar até {MAX_PRIZES} prêmios. Eles aparecem ordenados na
          página pública do sorteio.
        </p>
      </div>

      {/* ============ E-BOOK ============ */}
      <div className="space-y-3 border-t pt-4">
        <ToggleRow
          checked={ebook.enabled}
          onChange={(v) => updateEbook("enabled", v)}
          label="Disponibilizar E-book"
          description="Quando ativo, o cliente recebe um link de download no comprovante após o pagamento confirmado."
          icon={<BookOpen className="h-4 w-4" />}
        />
        {ebook.enabled && (
          <div className="space-y-3 pl-1">
            <div className="flex gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-xs">
              <Info className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300 mt-0.5" />
              <p className="text-blue-900 dark:text-blue-200">
                O e-book será liberado pra download quando a compra for
                concluída.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ebook-title">Título</Label>
                <Input
                  id="ebook-title"
                  placeholder="E-book Exclusivo"
                  value={ebook.title}
                  onChange={(e) => updateEbook("title", e.target.value)}
                  maxLength={120}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ebook-button">Texto do botão</Label>
                <Input
                  id="ebook-button"
                  placeholder="Baixar E-book"
                  value={ebook.buttonText}
                  onChange={(e) => updateEbook("buttonText", e.target.value)}
                  maxLength={60}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ebook-text">Texto</Label>
              <Textarea
                id="ebook-text"
                rows={2}
                placeholder="Você acaba de adquirir o e-book exclusivo da campanha."
                value={ebook.text}
                onChange={(e) => updateEbook("text", e.target.value)}
                maxLength={500}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ebook-url">Link de acesso</Label>
              <Input
                id="ebook-url"
                inputMode="url"
                placeholder="https://exemplo.com/ebook.pdf"
                value={ebook.url}
                onChange={(e) => updateEbook("url", e.target.value)}
                maxLength={2048}
              />
            </div>
          </div>
        )}
      </div>

      {/* ============ MOSTRAR PRÊMIOS ============ */}
      <div className="border-t pt-4">
        <ToggleRow
          checked={show}
          onChange={setShow}
          label="Mostrar Prêmios"
          description="Quando ativo, a lista de prêmios aparece na página pública do sorteio."
        />
      </div>

      {/* ============ LISTA DE PRÊMIOS ============ */}
      <div className="border-t pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Lista de Prêmios</p>
          <span className="text-xs text-muted-foreground tabular-nums">
            {prizes.filter((p) => p.trim()).length}/{MAX_PRIZES}
          </span>
        </div>
        {prizes.map((prize, idx) => (
          <div key={idx} className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs">
                Prêmio {idx + 1}º colocado
              </Label>
              <Input
                value={prize}
                onChange={(e) => updatePrize(idx, e.target.value)}
                placeholder="Ex: iPhone 16 Pro"
                maxLength={500}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => removePrize(idx)}
              aria-label="Remover"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}

        {prizes.length < MAX_PRIZES && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addPrize}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Novo prêmio
          </Button>
        )}
      </div>

      <div className="flex justify-end pt-3 border-t">
        <Button type="button" onClick={save} disabled={isPending}>
          {isPending ? "Salvando..." : "Salvar"}
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
  icon,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Switch checked={checked} onCheckedChange={onChange} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium flex items-center gap-1.5">
          {icon}
          {label}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
    </div>
  );
}

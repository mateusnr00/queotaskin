"use client";

// Aba "Prêmios" no editar-sorteio. Espelha o painel do SkinsLendarias:
// - Switch "Disponibilizar E-book" + 4 campos (título, texto, URL, label do
//   botão). Liberado pro cliente após o pagamento.
// - Switch "Mostrar Prêmios" (toggle de visibilidade da seção pública).
// - Lista de prêmios numerados ("Prêmio 1º colocado", etc), até 10.

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { BookOpen, Plus, Trophy } from "lucide-react";

import { setRafflePrizesAction } from "@/server/actions/raffle-content";
import {
  EMPTY_PRIZE,
  SkinPrizeEditor,
  type PrizeDraft,
} from "@/components/admin/skin-prize-editor";
import { Button } from "@/components/ui/button";
import { StickySaveBar } from "@/components/admin/sticky-save-bar";
import { SecaoDoFormulario } from "@/components/admin/secao-de-formulario";
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
  initialPrizes: PrizeDraft[];
  initialConfig: {
    show: boolean;
    showSkinSpecs: boolean;
    ebook: EbookConfig;
  };
}

export function RafflePrizesTab({
  raffleId,
  initialPrizes,
  initialConfig,
}: Props) {
  const [show, setShow] = useState(initialConfig.show);
  const [showSkinSpecs, setShowSkinSpecs] = useState(
    initialConfig.showSkinSpecs,
  );
  const [ebook, setEbook] = useState<EbookConfig>(initialConfig.ebook);

  const [prizes, setPrizes] = useState<PrizeDraft[]>(
    initialPrizes.length > 0 ? initialPrizes : [{ ...EMPTY_PRIZE }],
  );
  const [isPending, startTransition] = useTransition();

  function updatePrize(idx: number, patch: Partial<PrizeDraft>) {
    setPrizes((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    );
  }
  function addPrize() {
    if (prizes.length >= MAX_PRIZES) return;
    setPrizes((prev) => [...prev, { ...EMPTY_PRIZE }]);
  }
  function removePrize(idx: number) {
    setPrizes((prev) =>
      prev.length === 1
        ? [{ ...EMPTY_PRIZE }]
        : prev.filter((_, i) => i !== idx),
    );
  }

  function updateEbook<K extends keyof EbookConfig>(
    key: K,
    value: EbookConfig[K],
  ) {
    setEbook((prev) => ({ ...prev, [key]: value }));
  }

  function save() {
    // Prêmio sem descrição é linha vazia deixada pelo admin, descarta.
    const cleaned = prizes
      .map((p) => ({ ...p, description: p.description.trim() }))
      .filter((p) => p.description.length > 0);

    startTransition(async () => {
      const result = await setRafflePrizesAction({
        raffleId,
        show,
        showSkinSpecs,
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
    <>
      <div className="space-y-4">
        {/* A LISTA VEM PRIMEIRO. Antes ela era o último bloco, embaixo do
            e-book e dos dois interruptores, quando é ela o motivo de alguém
            abrir esta aba. O aviso azul que ocupava o topo virou a linha de
            descrição da seção. */}
        <SecaoDoFormulario
          titulo="Prêmios da campanha"
          descricao={`Pelo que os participantes concorrem, na ordem em que aparecem na página. Até ${MAX_PRIZES}. Preenchendo a ficha da skin, o card ganha a cor oficial da raridade do CS2.`}
          icone={<Trophy className="h-4 w-4" />}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Lista de prêmios
              </p>
              <span className="text-xs text-muted-foreground tabular-nums">
                {prizes.filter((p) => p.description.trim()).length}/{MAX_PRIZES}
              </span>
            </div>
            {prizes.map((prize, idx) => (
              <SkinPrizeEditor
                key={idx}
                index={idx}
                prize={prize}
                onChange={(patch) => updatePrize(idx, patch)}
                onRemove={() => removePrize(idx)}
              />
            ))}
            {prizes.length < MAX_PRIZES && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addPrize}
                className="gap-1.5 rounded-full"
              >
                <Plus className="h-4 w-4" />
                Novo prêmio
              </Button>
            )}
          </div>

          <div className="space-y-3 border-t border-white/10 pt-4">
            <ToggleRow
              checked={show}
              onChange={setShow}
              label="Mostrar a lista na página da campanha"
              description="Desligado, os prêmios continuam cadastrados, mas o visitante não os vê."
            />
            <ToggleRow
              checked={showSkinSpecs}
              onChange={setShowSkinSpecs}
              label="Mostrar a ficha técnica da skin"
              description="Raridade, desgaste, float, coleção e valor de mercado acima do preço. Ocupa espaço no celular, então vale nas skins caras, onde o float justifica o valor."
            />
          </div>
        </SecaoDoFormulario>

        <SecaoDoFormulario
          titulo="E-book de brinde"
          descricao="Um arquivo liberado no comprovante depois que o pagamento é confirmado."
          icone={<BookOpen className="h-4 w-4" />}
        >
          <div className="space-y-3">
            <ToggleRow
              checked={ebook.enabled}
              onChange={(v) => updateEbook("enabled", v)}
              label="Disponibilizar e-book"
              description="Um link de download no comprovante, depois do pagamento confirmado."
            />
            {ebook.enabled && (
              <div className="space-y-3">
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
                      onChange={(e) =>
                        updateEbook("buttonText", e.target.value)
                      }
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
        </SecaoDoFormulario>
      </div>
      <StickySaveBar status="Prêmios e e-book desta campanha">
        <Button type="button" onClick={save} disabled={isPending}>
          {isPending ? "Salvando..." : "Salvar alterações"}
        </Button>
      </StickySaveBar>
    </>
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

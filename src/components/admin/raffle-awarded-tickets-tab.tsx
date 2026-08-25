"use client";

// Aba "Títulos Premiados" no editar-sorteio. Espelha o painel do
// SkinsLendarias/Sorteamos:
// - Switches: ativar feature, mostrar lista pro público, mostrar aviso
//   pro NÃO ganhador.
// - Select: modo de exibição (lista vs modal/popup).
// - Textos: mensagem pro ganhador, título + corpo pro perdedor.
// - Lista: número + descrição do prêmio, com botão "Gerar" pra escolher
//   número aleatório disponível, e remover por linha.
// - Adicionar em lote via textarea ("número, prêmio" por linha).

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Trophy, Award, Dices } from "lucide-react";

import { setRaffleAwardedTicketsAction } from "@/server/actions/raffle-content";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MAX_ITEMS = 500;
const DEFAULT_WINNER_TEXT =
  "Em breve nossa equipe entrará em contato para realizar a entrega do prêmio.";
const DEFAULT_LOSER_TITLE = "😢 Que pena 😢";
const DEFAULT_LOSER_TEXT =
  "Não fique triste, você continua concorrendo ao prêmio principal, boa sorte.";

interface AwardedRow {
  number: string;
  prizeDescription: string;
  participantName?: string | null;
}

interface Props {
  raffleId: string;
  totalNumbers: number;
  initialItems: {
    number: number;
    prizeDescription: string;
    participantName?: string | null;
  }[];
  initialConfig: {
    enabled: boolean;
    showList: boolean;
    viewMode: "list" | "modal";
    winnerText: string;
    loserShow: boolean;
    loserTitle: string;
    loserText: string;
  };
}

export function RaffleAwardedTicketsTab({
  raffleId,
  totalNumbers,
  initialItems,
  initialConfig,
}: Props) {
  const [enabled, setEnabled] = useState(initialConfig.enabled);
  const [showList, setShowList] = useState(initialConfig.showList);
  const [viewMode, setViewMode] = useState<"list" | "modal">(
    initialConfig.viewMode
  );
  const [winnerText, setWinnerText] = useState(initialConfig.winnerText);
  const [loserShow, setLoserShow] = useState(initialConfig.loserShow);
  const [loserTitle, setLoserTitle] = useState(initialConfig.loserTitle);
  const [loserText, setLoserText] = useState(initialConfig.loserText);

  const [items, setItems] = useState<AwardedRow[]>(
    initialItems.length > 0
      ? initialItems.map((i) => ({
          number: String(i.number),
          prizeDescription: i.prizeDescription,
          participantName: i.participantName ?? null,
        }))
      : [{ number: "", prizeDescription: "", participantName: null }]
  );
  const [bulkText, setBulkText] = useState("");
  const [isPending, startTransition] = useTransition();

  function update(idx: number, key: keyof AwardedRow, value: string) {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, [key]: value } : it))
    );
  }

  function add() {
    if (items.length >= MAX_ITEMS) return;
    setItems((prev) => [
      ...prev,
      { number: "", prizeDescription: "", participantName: null },
    ]);
  }

  function remove(idx: number) {
    setItems((prev) =>
      prev.length === 1
        ? [{ number: "", prizeDescription: "", participantName: null }]
        : prev.filter((_, i) => i !== idx)
    );
  }

  // Gera um número aleatório entre 1 e totalNumbers que não esteja na lista
  // ainda. Não consulta o servidor — confia no estado local pra evitar
  // colisão. Se o usuário cadastrar 2 sorteios com mesmo número, o save
  // detecta dup e reporta erro.
  function generateRandom(idx: number) {
    const used = new Set(
      items
        .map((i) => parseInt(i.number, 10))
        .filter((n) => Number.isFinite(n) && n > 0)
    );
    const maxTries = totalNumbers * 2;
    for (let i = 0; i < maxTries; i++) {
      const candidate = Math.floor(Math.random() * totalNumbers) + 1;
      if (!used.has(candidate)) {
        update(idx, "number", String(candidate));
        return;
      }
    }
    toast.error(
      "Nenhum número livre encontrado. Remova alguns antes de gerar mais."
    );
  }

  function insertBulk() {
    const lines = bulkText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;
    const parsed: AwardedRow[] = [];
    for (const line of lines) {
      const m = line.match(/^(\d+)\s*[,;\t]\s*(.+)$/);
      if (!m) continue;
      parsed.push({
        number: m[1]!,
        prizeDescription: m[2]!.trim(),
        participantName: null,
      });
    }
    if (parsed.length === 0) {
      toast.error("Formato inválido. Use 'número, prêmio' por linha.");
      return;
    }
    setItems((prev) => {
      const filtered = prev.filter(
        (p) => p.number.trim() || p.prizeDescription.trim()
      );
      return [...filtered, ...parsed].slice(0, MAX_ITEMS);
    });
    setBulkText("");
    toast.success(`${parsed.length} título(s) adicionado(s) à lista`);
  }

  function save() {
    const cleaned = items
      .filter((i) => i.number.trim() && i.prizeDescription.trim())
      .map((i) => ({
        number: parseInt(i.number, 10),
        prizeDescription: i.prizeDescription.trim(),
      }));

    startTransition(async () => {
      const result = await setRaffleAwardedTicketsAction({
        raffleId,
        enabled,
        showList,
        viewMode,
        winnerText,
        loserShow,
        loserTitle,
        loserText,
        items: cleaned,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        cleaned.length === 0
          ? "Configuração salva (lista vazia)"
          : `${cleaned.length} título(s) premiado(s) salvo(s)`
      );
    });
  }

  const filledCount = items.filter(
    (i) => i.number.trim() && i.prizeDescription.trim()
  ).length;

  return (
    <Card className="p-5 space-y-5">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">
          <Trophy className="h-4 w-4" />
        </span>
        <div className="flex-1">
          <h2 className="text-base font-semibold">Títulos Premiados</h2>
          <p className="text-xs text-muted-foreground">
            Números específicos que valem prêmio instantâneo. Aceita 1 a{" "}
            {totalNumbers.toLocaleString("pt-BR")}.
          </p>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {filledCount}/{MAX_ITEMS}
        </span>
      </div>

      {/* ===== Toggles principais ===== */}
      <div className="space-y-3 border-t pt-4">
        <ToggleRow
          checked={enabled}
          onChange={setEnabled}
          label="Ativar Títulos Premiados"
          description="Liga/desliga o sistema inteiro. Quando off, nenhum ticket é marcado como AWARDED automaticamente."
        />
        <ToggleRow
          checked={showList}
          onChange={setShowList}
          label="Mostrar lista de prêmios/ganhadores pros participantes"
          description="Quando on, qualquer visitante da página do sorteio vê a lista (com nome de quem já ganhou)."
        />
      </div>

      {/* ===== Modo de exibição ===== */}
      <div className="grid gap-3 md:grid-cols-2 border-t pt-4">
        <div className="space-y-1.5">
          <Label>Modo de exibição</Label>
          <Select
            value={viewMode}
            onValueChange={(v) => v && setViewMode(v as "list" | "modal")}
          >
            <SelectTrigger>
              <SelectValue
                labels={{ list: "Lista", modal: "Modal/Popup" }}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="list">Lista</SelectItem>
              <SelectItem value="modal">Modal/Popup</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Como a lista aparece pro público: rolando inline na página ou num
            popup.
          </p>
        </div>
      </div>

      {/* ===== Texto pro ganhador ===== */}
      <div className="border-t pt-4 space-y-2">
        <Label htmlFor="winner-text">
          Texto exibido pros ganhadores de Títulos Premiados
        </Label>
        <Textarea
          id="winner-text"
          rows={2}
          placeholder={DEFAULT_WINNER_TEXT}
          value={winnerText}
          onChange={(e) => setWinnerText(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Aparece no comprovante quando o cliente é dono de pelo menos 1 ticket
          AWARDED. Vazio = usa o padrão.
        </p>
      </div>

      {/* ===== Aviso pro perdedor ===== */}
      <div className="border-t pt-4 space-y-3">
        <ToggleRow
          checked={loserShow}
          onChange={setLoserShow}
          label="Mostrar aviso pros NÃO ganhadores?"
          description="Mensagem amigável quando o cliente comprou tickets mas nenhum foi premiado."
        />
        {loserShow && (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="loser-title">Título do aviso</Label>
              <Input
                id="loser-title"
                placeholder={DEFAULT_LOSER_TITLE}
                value={loserTitle}
                onChange={(e) => setLoserTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loser-text">Texto do aviso</Label>
              <Input
                id="loser-text"
                placeholder={DEFAULT_LOSER_TEXT}
                value={loserText}
                onChange={(e) => setLoserText(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {/* ===== Lista de números ===== */}
      <div className="border-t pt-4 space-y-2">
        <h3 className="text-sm font-semibold">Lista de Títulos Premiados</h3>
        <div className="hidden md:grid md:grid-cols-[120px_1fr_auto_auto] gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <span>Número</span>
          <span>Prêmio</span>
          <span className="w-8 text-center" />
          <span className="w-8 text-center" />
        </div>
        {items.map((it, idx) => (
          <div
            key={idx}
            className="grid grid-cols-[120px_1fr_auto_auto] gap-2 items-start"
          >
            <div>
              <Input
                type="number"
                inputMode="numeric"
                placeholder="123"
                value={it.number}
                onChange={(e) => update(idx, "number", e.target.value)}
                min={1}
                max={totalNumbers}
              />
              {it.participantName && (
                <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-300 truncate">
                  <Award className="inline h-3 w-3 mr-0.5" />
                  {it.participantName}
                </p>
              )}
            </div>
            <Input
              placeholder="Ex: AK-47 Asiimov Field-Tested"
              value={it.prizeDescription}
              onChange={(e) => update(idx, "prizeDescription", e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => generateRandom(idx)}
              title="Gerar número aleatório"
              aria-label="Gerar número aleatório"
            >
              <Dices className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => remove(idx)}
              aria-label="Remover"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={add}
          disabled={items.length >= MAX_ITEMS}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Adicionar título
        </Button>
      </div>

      {/* ===== Adicionar em lote ===== */}
      <div className="border-t pt-4 space-y-2">
        <Label htmlFor="bulk">Adicionar em lote</Label>
        <Textarea
          id="bulk"
          rows={3}
          placeholder={
            "123, AK-47 Asiimov\n456, M4A1 Howl\n789, Karambit Doppler"
          }
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Um por linha, formato <code>número, prêmio</code>.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={insertBulk}
            disabled={!bulkText.trim()}
          >
            Inserir lote
          </Button>
        </div>
      </div>

      {/* ===== Salvar ===== */}
      <div className="border-t pt-4 flex justify-end">
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

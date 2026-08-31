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
import { casasDoTitulo } from "@/lib/titulo";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Award, Dices, Plus, Settings, Trash2, Trophy } from "lucide-react";

import { setRaffleAwardedTicketsAction } from "@/server/actions/raffle-content";
import { Button } from "@/components/ui/button";
import { StickySaveBar } from "@/components/admin/sticky-save-bar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  CampoDePremio,
  type SkinDoCatalogoSimples,
} from "@/components/admin/campo-de-premio";
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
  /** Condições para o número pagar. Ver src/lib/saida.ts. */
  saidaTitulosDe: number | null;
  saidaTitulosAte: number | null;
  saidaDataDe: string | null;
  saidaDataAte: string | null;
  saidaDdds: string[];
}

/** Uma linha nasce sem condição nenhuma: comprou o número, ganhou. */
const SEM_CONDICAO = {
  saidaTitulosDe: null,
  saidaTitulosAte: null,
  saidaDataDe: null,
  saidaDataAte: null,
  saidaDdds: [] as string[],
};

/** A linha tem alguma condição gravada? */
function temCondicao(r: AwardedRow): boolean {
  return (
    r.saidaTitulosDe != null ||
    r.saidaTitulosAte != null ||
    r.saidaDataDe != null ||
    r.saidaDataAte != null ||
    r.saidaDdds.length > 0
  );
}

interface Props {
  raffleId: string;
  totalNumbers: number;
  /** Catálogo de skins do tenant, para sugerir o nome e mostrar a raridade. */
  catalogo: SkinDoCatalogoSimples[];
  initialItems: {
    number: number;
    prizeDescription: string;
    participantName?: string | null;
    saidaTitulosDe?: number | null;
    saidaTitulosAte?: number | null;
    saidaDataDe?: string | null;
    saidaDataAte?: string | null;
    saidaDdds?: string[];
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
  catalogo,
  initialItems,
  initialConfig,
}: Props) {
  const [enabled, setEnabled] = useState(initialConfig.enabled);
  const [showList, setShowList] = useState(initialConfig.showList);
  const [viewMode, setViewMode] = useState<"list" | "modal">(
    initialConfig.viewMode,
  );
  const [winnerText, setWinnerText] = useState(initialConfig.winnerText);
  const [loserShow, setLoserShow] = useState(initialConfig.loserShow);
  const [loserTitle, setLoserTitle] = useState(initialConfig.loserTitle);
  const [loserText, setLoserText] = useState(initialConfig.loserText);

  /**
   * O mestre arrasta os de baixo junto.
   *
   * Desligar a seção e deixar "mostrar lista" e "aviso pros não ganhadores"
   * ligados guardava um estado que não existe na tela do público: com a seção
   * off, nada daquilo aparece. Quem voltasse a ligar herdava escolhas de outro
   * dia sem perceber. Agora o mestre decide os dois de uma vez, e quem quiser
   * uma combinação diferente desmarca depois, que é uma ação visível.
   */
  function alternarSecao(ligado: boolean) {
    setEnabled(ligado);
    setShowList(ligado);
    setLoserShow(ligado);
  }

  const [items, setItems] = useState<AwardedRow[]>(
    initialItems.length > 0
      ? initialItems.map((i) => ({
          number: String(i.number),
          prizeDescription: i.prizeDescription,
          participantName: i.participantName ?? null,
          saidaTitulosDe: i.saidaTitulosDe ?? null,
          saidaTitulosAte: i.saidaTitulosAte ?? null,
          saidaDataDe: i.saidaDataDe ?? null,
          saidaDataAte: i.saidaDataAte ?? null,
          saidaDdds: i.saidaDdds ?? [],
        }))
      : [
          {
            number: "",
            prizeDescription: "",
            participantName: null,
            ...SEM_CONDICAO,
          },
        ],
  );
  const [bulkText, setBulkText] = useState("");
  // Quantas casas o título tem nesta campanha. A mesma conta que a fita do
  // sorteio e o comprovante usam, para o número ser escrito igual em toda
  // parte.
  const casas = casasDoTitulo(totalNumbers);
  const [condicoes, setCondicoes] = useState<{
    indice: number;
    row: AwardedRow;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  function update(idx: number, key: keyof AwardedRow, value: string) {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, [key]: value } : it)),
    );
  }

  function add() {
    if (items.length >= MAX_ITEMS) return;
    setItems((prev) => [
      ...prev,
      {
        number: "",
        prizeDescription: "",
        participantName: null,
        ...SEM_CONDICAO,
      },
    ]);
  }

  function remove(idx: number) {
    setItems((prev) =>
      prev.length === 1
        ? [
            {
              number: "",
              prizeDescription: "",
              participantName: null,
              ...SEM_CONDICAO,
            },
          ]
        : prev.filter((_, i) => i !== idx),
    );
  }

  // Gera um número aleatório entre 1 e totalNumbers que não esteja na lista
  // ainda. Não consulta o servidor, confia no estado local pra evitar
  // colisão. Se o usuário cadastrar 2 sorteios com mesmo número, o save
  // detecta dup e reporta erro.
  function generateRandom(idx: number) {
    const used = new Set(
      items
        .map((i) => parseInt(i.number, 10))
        .filter((n) => Number.isFinite(n) && n > 0),
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
      "Nenhum número livre encontrado. Remova alguns antes de gerar mais.",
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
        ...SEM_CONDICAO,
      });
    }
    if (parsed.length === 0) {
      toast.error("Formato inválido. Use 'número, prêmio' por linha.");
      return;
    }
    setItems((prev) => {
      const filtered = prev.filter(
        (p) => p.number.trim() || p.prizeDescription.trim(),
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
        // As condições viajam de volta porque a ação APAGA e recria a lista:
        // sem isto, todo salvamento da aba limparia em silêncio o que foi
        // configurado nas engrenagens.
        saidaTitulosDe: i.saidaTitulosDe,
        saidaTitulosAte: i.saidaTitulosAte,
        saidaDataDe: i.saidaDataDe,
        saidaDataAte: i.saidaDataAte,
        saidaDdds: i.saidaDdds,
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
          : `${cleaned.length} título(s) premiado(s) salvo(s)`,
      );
    });
  }

  const filledCount = items.filter(
    (i) => i.number.trim() && i.prizeDescription.trim(),
  ).length;

  return (
    <>
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
            onChange={alternarSecao}
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
                <SelectValue labels={{ list: "Lista", modal: "Modal/Popup" }} />
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
            Aparece no comprovante quando o cliente é dono de pelo menos 1
            ticket AWARDED. Vazio = usa o padrão.
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              Lista de Títulos Premiados
            </h3>
            {/* Quantos dígitos o título tem nesta campanha. Vem do total de
                números, e não de um valor fixo: numa campanha de 100 os
                títulos vão de 001 a 100, e em uma de 5.000 vão até 5000.
                Fixar em dois deixaria o 100 sem casa. */}
            <span className="text-[11px] text-muted-foreground tabular-nums">
              Títulos de {String(1).padStart(casas, "0")} a{" "}
              {String(totalNumbers).padStart(casas, "0")} · {casas} dígitos
            </span>
          </div>
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
                  placeholder={String(1).padStart(casas, "0")}
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
              <CampoDePremio
                placeholder="Ex: AK-47 | Vulcan (Field-Tested)"
                valor={it.prizeDescription}
                aoMudar={(v) => update(idx, "prizeDescription", v)}
                catalogo={catalogo}
              />
              {/* A engrenagem das condições. Fica acesa quando a linha tem
                  alguma: sem esse sinal, uma condição gravada some da vista e
                  vira surpresa no dia em que alguém compra e não ganha. */}
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={
                  temCondicao(it)
                    ? "border-primary/50 text-primary"
                    : "text-muted-foreground"
                }
                onClick={() => setCondicoes({ indice: idx, row: it })}
                aria-label={`Condições do número ${it.number || "novo"}`}
                title={
                  temCondicao(it)
                    ? "Este número tem condições para pagar"
                    : "Definir condições para este número pagar"
                }
              >
                <Settings className="h-4 w-4" />
              </Button>
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
      </Card>
      <StickySaveBar status="Títulos premiados desta campanha">
        <Button type="button" onClick={save} disabled={isPending}>
          {isPending ? "Salvando..." : "Salvar alterações"}
        </Button>
      </StickySaveBar>

      <CondicoesDoTitulo
        linha={condicoes}
        aoSalvar={(indice, cond) =>
          setItems((prev) =>
            prev.map((x, j) => (j === indice ? { ...x, ...cond } : x)),
          )
        }
        aoFechar={() => setCondicoes(null)}
      />
    </>
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

/**
 * Condições para um número premiado pagar.
 *
 * AQUI NÃO HÁ PONTO DE SAÍDA EM PORCENTAGEM, e a diferença é do modelo. O
 * título premiado é amarrado a um NÚMERO: quem comprar o 120 leva, e não há
 * bolo para sortear nem quando agendar. O número já é o agendamento.
 *
 * O que faz sentido é o outro eixo: para QUAL COMPRA ele paga. Serve ao
 * disparo com hora marcada, que é o caso real.
 *
 * Campo em branco não filtra, e uma linha sem nenhuma condição é o
 * comportamento de sempre: comprou o número, ganhou.
 */
function CondicoesDoTitulo({
  linha,
  aoSalvar,
  aoFechar,
}: {
  linha: { indice: number; row: AwardedRow } | null;
  aoSalvar: (indice: number, cond: Partial<AwardedRow>) => void;
  aoFechar: () => void;
}) {
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [dDe, setDDe] = useState("");
  const [dAte, setDAte] = useState("");
  const [ddds, setDdds] = useState("");
  const [ultimo, setUltimo] = useState<number | null>(null);

  if (linha && linha.indice !== ultimo) {
    setUltimo(linha.indice);
    setDe(linha.row.saidaTitulosDe?.toString() ?? "");
    setAte(linha.row.saidaTitulosAte?.toString() ?? "");
    setDDe(paraCampoDeData(linha.row.saidaDataDe));
    setDAte(paraCampoDeData(linha.row.saidaDataAte));
    setDdds(linha.row.saidaDdds.join(", "));
  }

  function salvar() {
    if (!linha) return;
    const n = (v: string) => (v.trim() === "" ? null : Number(v));
    aoSalvar(linha.indice, {
      saidaTitulosDe: n(de),
      saidaTitulosAte: n(ate),
      saidaDataDe: dDe.trim() === "" ? null : new Date(dDe).toISOString(),
      saidaDataAte: dAte.trim() === "" ? null : new Date(dAte).toISOString(),
      saidaDdds: ddds
        .split(/[\s,]+/)
        .map((d) => d.replace(/\D/g, ""))
        .filter((d) => d.length === 2),
    });
    aoFechar();
  }

  return (
    <Dialog open={linha != null} onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Condições de saída</DialogTitle>
          <DialogDescription>
            Para o número <strong>{linha?.row.number}</strong> pagar. Em branco,
            ele paga para quem comprar, como sempre.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="tit-de">
                Títulos, no mínimo
              </Label>
              <Input
                id="tit-de"
                inputMode="numeric"
                value={de}
                onChange={(e) => setDe(e.target.value)}
                placeholder="sem mínimo"
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="tit-ate">
                Títulos, no máximo
              </Label>
              <Input
                id="tit-ate"
                inputMode="numeric"
                value={ate}
                onChange={(e) => setAte(e.target.value)}
                placeholder="sem limite"
                className="font-mono"
              />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="tit-dde">
                A partir de
              </Label>
              <Input
                id="tit-dde"
                type="datetime-local"
                value={dDe}
                onChange={(e) => setDDe(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="tit-date">
                Até
              </Label>
              <Input
                id="tit-date"
                type="datetime-local"
                value={dAte}
                onChange={(e) => setDAte(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="tit-ddd">
              DDDs (opcional)
            </Label>
            <Input
              id="tit-ddd"
              value={ddds}
              onChange={(e) => setDdds(e.target.value)}
              placeholder="62, 11, 21"
              className="font-mono"
            />
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Para um disparo de WhatsApp das 14h, ponha 14h em{" "}
            <strong>A partir de</strong>: o número espera a compra que veio
            dele. Atenção: com condição, alguém pode comprar o número premiado e
            não levar, então avise isso no texto da campanha.
          </p>
          <button
            type="button"
            onClick={salvar}
            className="h-9 w-full rounded-lg bg-primary text-sm font-bold text-primary-foreground transition-opacity hover:opacity-95"
          >
            Aplicar
          </button>
          <p className="text-[11px] text-muted-foreground">
            As condições só vão para o banco quando você salvar a aba.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** ISO para o formato que datetime-local aceita, no fuso de quem olha. */
function paraCampoDeData(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

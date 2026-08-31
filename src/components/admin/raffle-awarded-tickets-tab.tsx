"use client";

// A aba "Títulos Premiados" do editar-sorteio.
//
// A tela responde três perguntas, nesta ordem, e o desenho segue essa ordem:
// quanto ainda dá para premiar, quais números estão premiados, e como isso
// aparece para quem compra. Antes era um cartão único com oito blocos
// separados por linha cinza, tudo com o mesmo peso, e a lista de números, que
// é o trabalho de verdade, ficava no meio, entre um campo de texto e outro.
//
// O sorteio do número MORA NO SERVIDOR (ver sortearTitulosPremiadosAction). O
// botão antigo sorteava aqui no navegador, em 1 até o total, e por isso podia
// cair num número já vendido: um prêmio nesse número não paga ninguém, porque
// a marcação acontece quando o pagamento entra e aquele pagamento já entrou.
// Só o banco sabe o que ainda está à venda.

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Award,
  Dices,
  Hash,
  Plus,
  Settings,
  Ticket,
  Trash2,
  Trophy,
} from "lucide-react";

import {
  setRaffleAwardedTicketsAction,
  sortearTitulosPremiadosAction,
} from "@/server/actions/raffle-content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CampoDePremio,
  type SkinDoCatalogoSimples,
} from "@/components/admin/campo-de-premio";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Etiqueta, Moldura, Placa } from "@/components/ui/moldura";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StickySaveBar } from "@/components/admin/sticky-save-bar";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { casasDoTitulo, numeroDoTitulo } from "@/lib/titulo";
import { cn } from "@/lib/utils";

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
  /**
   * O número já tem dono?
   *
   * Três estados de propósito: `true` veio vendido do servidor, `false` saiu
   * do sorteio agora e está livre, e `undefined` é o número digitado à mão,
   * que ninguém conferiu. Fingir "livre" no terceiro caso seria pior do que
   * não dizer nada, porque é exatamente aí que o engano acontece.
   */
  ocupado?: boolean;
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

const LINHA_VAZIA: AwardedRow = {
  number: "",
  prizeDescription: "",
  participantName: null,
  ...SEM_CONDICAO,
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
  /** Quantos números da campanha ainda estão à venda, na carga da página. */
  titulosDisponiveis?: number;
  initialItems: {
    number: number;
    prizeDescription: string;
    participantName?: string | null;
    ocupado?: boolean;
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
  titulosDisponiveis,
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
          ocupado: i.ocupado,
          saidaTitulosDe: i.saidaTitulosDe ?? null,
          saidaTitulosAte: i.saidaTitulosAte ?? null,
          saidaDataDe: i.saidaDataDe ?? null,
          saidaDataAte: i.saidaDataAte ?? null,
          saidaDdds: i.saidaDdds ?? [],
        }))
      : [LINHA_VAZIA],
  );
  const [bulkText, setBulkText] = useState("");
  const [mostrarLote, setMostrarLote] = useState(false);
  // Quantas casas o título tem nesta campanha. A mesma conta que a fita do
  // sorteio e o comprovante usam, para o número ser escrito igual em toda
  // parte. Numa campanha de cem, os títulos vão de 001 a 100.
  const casas = casasDoTitulo(totalNumbers);
  // Quantos ainda estão à venda. Começa com o que o servidor contou na carga e
  // é reescrito a cada sorteio, que devolve a contagem do momento.
  const [disponiveis, setDisponiveis] = useState<number | null>(
    titulosDisponiveis ?? null,
  );
  /** Índice da linha esperando o sorteio, ou -1 para "sorteando uma nova". */
  const [sorteando, setSorteando] = useState<number | null>(null);
  const [condicoes, setCondicoes] = useState<{
    indice: number;
    row: AwardedRow;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  function update(idx: number, key: keyof AwardedRow, value: string) {
    setItems((prev) =>
      prev.map((it, i) =>
        i === idx
          ? {
              ...it,
              [key]: value,
              // Trocar o número apaga o que sabíamos sobre ele: o "vendido" da
              // carga era do número antigo, e mantê-lo apontaria para o item
              // errado.
              ...(key === "number" ? { ocupado: undefined } : null),
            }
          : it,
      ),
    );
  }

  function add() {
    if (items.length >= MAX_ITEMS) return;
    setItems((prev) => [...prev, LINHA_VAZIA]);
  }

  function remove(idx: number) {
    setItems((prev) =>
      prev.length === 1 ? [LINHA_VAZIA] : prev.filter((_, i) => i !== idx),
    );
  }

  /**
   * Sorteia um título que ainda está à venda.
   *
   * `idx` nulo cria uma linha nova já com o número dentro, que é o caminho de
   * quem quer só ir somando prêmios; com índice, troca o número da linha que
   * já existe.
   *
   * Os números que já estão na tela viajam em `evitar`, salvos ou não: o
   * servidor sabe o que foi vendido, mas não sabe o que você acabou de digitar
   * e ainda não salvou.
   */
  async function sortear(idx: number | null) {
    if (idx == null && items.length >= MAX_ITEMS) return;
    setSorteando(idx ?? -1);
    try {
      const evitar = items
        .map((i) => parseInt(i.number, 10))
        .filter((n) => Number.isFinite(n) && n > 0);
      const r = await sortearTitulosPremiadosAction({
        raffleId,
        quantidade: 1,
        evitar,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setDisponiveis(r.data.disponiveis);
      const numero = r.data.numeros[0];
      if (numero == null) {
        toast.error(
          "Nenhum título disponível para sortear: a campanha está esgotada ou o resto já está nesta lista.",
        );
        return;
      }
      const escolhido = String(numero);
      if (idx == null) {
        setItems((prev) => {
          // A linha em branco do começo é aproveitada em vez de virar uma
          // sobra vazia no meio da lista.
          const ultima = prev[prev.length - 1];
          const base =
            ultima && !ultima.number.trim() && !ultima.prizeDescription.trim()
              ? prev.slice(0, -1)
              : prev;
          return [
            ...base,
            { ...LINHA_VAZIA, number: escolhido, ocupado: false },
          ];
        });
      } else {
        setItems((prev) =>
          prev.map((it, i) =>
            i === idx ? { ...it, number: escolhido, ocupado: false } : it,
          ),
        );
      }
      toast.success(`Título ${escolhido.padStart(casas, "0")} está livre`);
    } finally {
      setSorteando(null);
    }
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
        ...LINHA_VAZIA,
        number: m[1]!,
        prizeDescription: m[2]!.trim(),
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
  const jaGanhos = items.filter((i) => i.participantName).length;
  const vendidosNaLista = items.filter((i) => i.ocupado).length;

  return (
    <>
      <div className="space-y-4">
        {/* ===================== O PAINEL DE CIMA ===================== */}
        <Moldura>
          <div className="space-y-5 p-4 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 space-y-2">
                <Etiqueta icone={<Trophy className="h-3 w-3" />}>
                  Títulos premiados
                </Etiqueta>
                <h2 className="text-xl font-black tracking-tight md:text-2xl">
                  Números que valem prêmio na hora
                </h2>
                <p className="max-w-xl text-sm text-muted-foreground">
                  Quem comprar um destes números leva o prêmio no mesmo
                  instante, sem esperar o sorteio. Só vale para número que ainda
                  esteja à venda.
                </p>
              </div>
              {/* A chave mestra fica no alto e sozinha: é ela que decide se
                  toda a tela abaixo tem efeito. */}
              <label className="flex shrink-0 cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <Switch checked={enabled} onCheckedChange={alternarSecao} />
                <span className="text-sm font-semibold">
                  {enabled ? "Ligado" : "Desligado"}
                </span>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Placa
                rotulo="Títulos disponíveis"
                valor={
                  disponiveis == null
                    ? totalNumbers.toLocaleString("pt-BR")
                    : disponiveis.toLocaleString("pt-BR")
                }
                nota={`de ${totalNumbers.toLocaleString("pt-BR")} da campanha`}
                icone={<Ticket className="h-3 w-3" />}
                tom="marca"
                destaque
              />
              <Placa
                rotulo="Nesta lista"
                valor={String(filledCount)}
                nota={`limite de ${MAX_ITEMS}`}
                icone={<Trophy className="h-3 w-3" />}
              />
              <Placa
                rotulo="Já com dono"
                valor={String(jaGanhos)}
                nota={
                  jaGanhos === 0 ? "ninguém ganhou ainda" : "prêmio entregue"
                }
                icone={<Award className="h-3 w-3" />}
                tom={jaGanhos > 0 ? "bom" : "neutro"}
              />
              <Placa
                rotulo="Formato do título"
                valor={`${casas} dígitos`}
                nota={`de ${String(1).padStart(casas, "0")} a ${String(totalNumbers).padStart(casas, "0")}`}
                icone={<Hash className="h-3 w-3" />}
              />
            </div>

            {vendidosNaLista > 0 && (
              <p className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-xs leading-relaxed text-amber-300">
                <strong>{vendidosNaLista}</strong> número(s) desta lista já
                foram comprados. Um título premiado só paga quando a compra
                acontece depois de ele estar cadastrado, então esses aí não vão
                premiar ninguém: troque por um disponível.
              </p>
            )}
          </div>
        </Moldura>

        {/* ===================== A LISTA ===================== */}
        <Moldura>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3.5">
            <div>
              <h3 className="text-sm font-bold">Lista de títulos premiados</h3>
              <p className="text-xs text-muted-foreground">
                O sorteio escolhe apenas entre os títulos disponíveis.
              </p>
            </div>
            <Button
              type="button"
              onClick={() => void sortear(null)}
              disabled={sorteando != null || items.length >= MAX_ITEMS}
              className="gap-2 rounded-full px-5"
            >
              <Dices className="h-4 w-4" />
              {sorteando === -1 ? "Sorteando..." : "Gerar título disponível"}
            </Button>
          </div>

          <ul className="divide-y divide-white/[0.06]">
            {items.map((it, idx) => (
              <li key={idx} className="p-3 md:px-4 md:py-3.5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start">
                  <div className="w-full space-y-1.5 md:w-[190px] md:shrink-0">
                    <div className="flex gap-1.5">
                      <Input
                        type="number"
                        inputMode="numeric"
                        aria-label={`Número do título ${idx + 1}`}
                        placeholder={String(1).padStart(casas, "0")}
                        value={it.number}
                        onChange={(e) => update(idx, "number", e.target.value)}
                        min={1}
                        max={totalNumbers}
                        className="font-mono tabular-nums"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="shrink-0"
                        disabled={sorteando != null}
                        onClick={() => void sortear(idx)}
                        title="Sortear um número que ainda está à venda"
                        aria-label="Gerar número aleatório"
                      >
                        <Dices className="h-4 w-4" />
                      </Button>
                    </div>
                    <SinalDoNumero linha={it} total={totalNumbers} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <CampoDePremio
                      placeholder="Ex: AK-47 | Vulcan (Field-Tested)"
                      valor={it.prizeDescription}
                      aoMudar={(v) => update(idx, "prizeDescription", v)}
                      catalogo={catalogo}
                    />
                  </div>

                  <div className="flex items-center gap-1 md:shrink-0">
                    {/* A engrenagem das condições. Fica acesa quando a linha
                        tem alguma: sem esse sinal, uma condição gravada some da
                        vista e vira surpresa no dia em que alguém compra e não
                        ganha. */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-9 w-9",
                        temCondicao(it)
                          ? "text-primary"
                          : "text-muted-foreground hover:text-foreground",
                      )}
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
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => remove(idx)}
                      aria-label="Remover"
                      title="Remover este título"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-4 py-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={add}
              disabled={items.length >= MAX_ITEMS}
              className="gap-1.5 rounded-full"
            >
              <Plus className="h-4 w-4" />
              Digitar um número
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setMostrarLote((v) => !v)}
              className="text-xs text-muted-foreground"
            >
              {mostrarLote
                ? "Fechar colagem em massa"
                : "Colar vários de uma vez"}
            </Button>
          </div>

          {mostrarLote && (
            <div className="space-y-2 border-t border-white/10 px-4 py-4">
              <Label htmlFor="bulk" className="text-xs">
                Um por linha, no formato <code>número, prêmio</code>
              </Label>
              <Textarea
                id="bulk"
                rows={3}
                placeholder={
                  "123, AK-47 Asiimov\n456, M4A1 Howl\n789, Karambit Doppler"
                }
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                className="font-mono text-xs"
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">
                  A colagem não confere se o número está à venda. Para isso, use
                  o sorteio.
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
          )}
        </Moldura>

        {/* ===================== COMO APARECE ===================== */}
        <Moldura>
          <div className="space-y-4 p-4 md:p-6">
            <div>
              <h3 className="text-sm font-bold">
                Como aparece para quem compra
              </h3>
              <p className="text-xs text-muted-foreground">
                A lista na página da campanha e o recado no comprovante.
              </p>
            </div>

            <ToggleRow
              checked={showList}
              onChange={setShowList}
              label="Mostrar a lista na página da campanha"
              description="Qualquer visitante vê os números premiados e o nome de quem já ganhou."
            />

            {showList && (
              <div className="space-y-1.5">
                <Label>Modo de exibição</Label>
                <Select
                  value={viewMode}
                  onValueChange={(v) => v && setViewMode(v as "list" | "modal")}
                >
                  <SelectTrigger className="md:w-64">
                    <SelectValue
                      labels={{ list: "Lista na página", modal: "Modal/Popup" }}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="list">Lista na página</SelectItem>
                    <SelectItem value="modal">Modal/Popup</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2 border-t border-white/10 pt-4">
              <Label htmlFor="winner-text">Recado para quem ganhou</Label>
              <Textarea
                id="winner-text"
                rows={2}
                placeholder={DEFAULT_WINNER_TEXT}
                value={winnerText}
                onChange={(e) => setWinnerText(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Aparece no comprovante de quem levou um título premiado. Em
                branco, usa o texto padrão.
              </p>
            </div>

            <div className="space-y-3 border-t border-white/10 pt-4">
              <ToggleRow
                checked={loserShow}
                onChange={setLoserShow}
                label="Mostrar recado para quem não ganhou"
                description="Mensagem no comprovante de quem comprou e não pegou nenhum premiado."
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
          </div>
        </Moldura>
      </div>

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

/**
 * O que se sabe sobre este número, embaixo do campo.
 *
 * Mostra também como o título vai ser escrito na campanha, com as casas dela.
 * O campo é numérico e o navegador come o zero à esquerda, então quem digita
 * "7" numa campanha de mil não tem como saber que aquilo vira 0007 na página
 * pública, na fita do sorteio e no comprovante.
 *
 * Quem já ganhou tem prioridade sobre "vendido": as duas coisas são verdade ao
 * mesmo tempo, e a que interessa é a que diz que o prêmio saiu.
 */
function SinalDoNumero({ linha, total }: { linha: AwardedRow; total: number }) {
  const n = parseInt(linha.number, 10);
  const valido = Number.isFinite(n) && n >= 1 && n <= total;
  const foraDaFaixa = linha.number.trim() !== "" && !valido;

  return (
    <div className="flex min-h-[18px] flex-wrap items-center gap-1.5">
      {valido && (
        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
          {numeroDoTitulo(n, total)}
        </span>
      )}
      {foraDaFaixa && (
        <Badge
          variant="outline"
          className="border-red-500/50 text-[10px] text-red-400"
        >
          fora de 1 a {total.toLocaleString("pt-BR")}
        </Badge>
      )}
      {linha.participantName ? (
        <span className="truncate text-[11px] text-emerald-400">
          <Award className="mr-0.5 inline h-3 w-3" />
          {linha.participantName}
        </span>
      ) : linha.ocupado ? (
        <Badge
          variant="outline"
          className="border-amber-500/40 text-[10px] text-amber-400"
          title="Este número já foi comprado, então não vai premiar ninguém"
        >
          já vendido
        </Badge>
      ) : linha.ocupado === false ? (
        <Badge
          variant="outline"
          className="border-emerald-500/40 text-[10px] text-emerald-400"
        >
          disponível
        </Badge>
      ) : null}
    </div>
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
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
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

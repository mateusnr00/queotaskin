"use client";

// A tela da raspadinha, no painel.
//
// A mecânica existia inteira no banco e na hora de raspar, mas o botão do
// painel abria um aviso de "em breve": não havia por onde ligar, cadastrar
// combo nem prêmio, então ela nunca chegava ao público.
//
// O desenho é o mesmo da caixa surpresa de propósito. As duas são a mesma
// coisa por baixo, um bolo de prêmios sorteado no instante da revelação, e
// divergir na forma de cadastrar só criaria duas telas para aprender.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lock, Plus, Settings, Trash2, Unlock } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatBRL } from "@/lib/format";
import { porcentagemDaSaida, type TipoDeSaida } from "@/lib/saida";
import {
  criarPremiosDaRaspadinhaAction,
  removerPremioDaRaspadinhaAction,
  salvarCombosDaRaspadinhaAction,
  salvarConfigDaRaspadinhaAction,
  salvarSaidaDaRaspadinhaAction,
  travarPremioDaRaspadinhaAction,
} from "@/server/actions/raspadinha-admin";

export interface PremioDaRaspadinhaRow {
  id: string;
  tipo: "PIX" | "SKIN";
  rotulo: string;
  valor: number | null;
  chance: number | null;
  travado: boolean;
  claimed: boolean;
  tipoDeSaida: TipoDeSaida;
  saidaEmTitulos: number | null;
  saidaTitulosDe: number | null;
  saidaTitulosAte: number | null;
  saidaDataDe: string | null;
  saidaDataAte: string | null;
  saidaDdds: string[];
}

export interface ComboDaRaspadinha {
  minimo: number;
  quantidade: number;
  visivel: boolean;
}

export interface ConfigDaRaspadinha {
  ativa: boolean;
  rasparTodas: boolean;
  totalNumbers: number;
  combos: ComboDaRaspadinha[];
  premios: PremioDaRaspadinhaRow[];
}

export function RaspadinhasModal({
  raffleId,
  initial,
  aberto,
  aoFechar,
}: {
  raffleId: string;
  initial: ConfigDaRaspadinha;
  aberto: boolean;
  aoFechar: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [ativa, setAtiva] = useState(initial.ativa);
  const [rasparTodas, setRasparTodas] = useState(initial.rasparTodas);
  const [configurando, setConfigurando] =
    useState<PremioDaRaspadinhaRow | null>(null);
  const [inserindo, setInserindo] = useState(false);

  function salvarConfig(proxima: { ativa: boolean; rasparTodas: boolean }) {
    setAtiva(proxima.ativa);
    setRasparTodas(proxima.rasparTodas);
    startTransition(async () => {
      const r = await salvarConfigDaRaspadinhaAction({ raffleId, ...proxima });
      if (!r.ok) {
        toast.error(r.error);
        // Volta ao que estava: deixar o novo na tela depois de o servidor
        // recusar mostraria um estado que não existe no banco.
        setAtiva(initial.ativa);
        setRasparTodas(initial.rasparTodas);
        return;
      }
      router.refresh();
    });
  }

  const noPool = initial.premios.filter((p) => !p.claimed);
  // Uma linha por unidade e ordenadas pelo ponto de saída, como na caixa: é a
  // ordem em que elas vão sair de verdade. Sem ponto vai para o fim, porque
  // sai por sorteio, depois de quem tem hora marcada.
  const unidades = [...noPool].sort(
    (a, b) =>
      (a.saidaEmTitulos ?? Number.MAX_SAFE_INTEGER) -
      (b.saidaEmTitulos ?? Number.MAX_SAFE_INTEGER),
  );
  const totalPorNome = new Map<string, number>();
  for (const u of unidades) {
    totalPorNome.set(u.rotulo, (totalPorNome.get(u.rotulo) ?? 0) + 1);
  }
  const vistos = new Map<string, number>();

  // Quanto de Pix já está prometido. É o número que decide se dá para
  // cadastrar mais um, e ele não existia em lugar nenhum.
  const emPix = unidades
    .filter((u) => u.tipo === "PIX")
    .reduce((t, u) => t + (u.valor ?? 0), 0);

  return (
    <>
      <Dialog open={aberto} onOpenChange={(o) => !o && aoFechar()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Raspadinhas premiadas ({unidades.length})</DialogTitle>
            <DialogDescription>
              Quem compra ganha raspadinhas pelos combos abaixo. Cada prêmio sai
              no ponto da venda que você agendar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <label className="flex items-center gap-3 text-sm">
                <Switch
                  checked={ativa}
                  disabled={isPending}
                  onCheckedChange={(v) =>
                    salvarConfig({ ativa: v, rasparTodas })
                  }
                />
                Ativar raspadinhas
              </label>
              <label className="flex items-center gap-3 pl-6 text-sm">
                <Switch
                  checked={rasparTodas}
                  disabled={isPending || !ativa}
                  onCheckedChange={(v) =>
                    salvarConfig({ ativa, rasparTodas: v })
                  }
                />
                Ativar &ldquo;Raspar todas&rdquo;
              </label>
            </div>

            {/* O aviso que a caixa surpresa também dá: sem combo, ninguém
                recebe raspadinha nenhuma e a mecânica fica ligada sem efeito. */}
            {ativa && initial.combos.length === 0 && (
              <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                Cadastre combos abaixo: sem eles, ninguém recebe raspadinha.
              </p>
            )}

            <Combos raffleId={raffleId} combos={initial.combos} />

            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Prêmios ({unidades.length})
                  {emPix > 0 && (
                    <span className="ml-2 normal-case">
                      · {formatBRL(emPix)} em Pix
                    </span>
                  )}
                </span>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setInserindo(true)}
                  disabled={isPending}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Inserir prêmio
                </Button>
              </div>

              {unidades.length === 0 ? (
                <div className="rounded-lg border px-4 py-10 text-center">
                  <p className="text-sm font-semibold">Nenhum prêmio ainda.</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sem prêmio, toda raspadinha sai vazia.
                  </p>
                </div>
              ) : (
                <ul className="divide-y overflow-hidden rounded-lg border">
                  {unidades.map((u) => {
                    const quantos = totalPorNome.get(u.rotulo) ?? 1;
                    const indice = (vistos.get(u.rotulo) ?? 0) + 1;
                    vistos.set(u.rotulo, indice);
                    return (
                      <LinhaDePremio
                        key={u.id}
                        premio={u}
                        indice={indice}
                        quantos={quantos}
                        totalNumbers={initial.totalNumbers}
                        onConfigurar={() => setConfigurando(u)}
                      />
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <InserirPremio
        raffleId={raffleId}
        aberto={inserindo}
        aoFechar={() => setInserindo(false)}
      />
      <ConfigDeSaida
        premio={configurando}
        totalNumbers={initial.totalNumbers}
        aoFechar={() => setConfigurando(null)}
      />
    </>
  );
}

/** Quando o prêmio sai, em porcentagem da venda. */
function SeloDeSaida({
  premio,
  totalNumbers,
}: {
  premio: PremioDaRaspadinhaRow;
  totalNumbers: number;
}) {
  if (premio.tipoDeSaida === "PERSONALIZADO") {
    return (
      <Badge variant="outline" className="text-[10px] text-primary">
        Saída personalizada
      </Badge>
    );
  }
  const pct = porcentagemDaSaida(premio.saidaEmTitulos, totalNumbers);
  if (pct == null) {
    return (
      <Badge variant="outline" className="text-[10px] text-muted-foreground">
        Sem agendamento
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-emerald-500/40 text-[10px] text-emerald-500 tabular-nums"
      title="Vai para a primeira raspadinha revelada a partir deste ponto"
    >
      sai em {pct.toFixed(pct < 10 ? 1 : 0).replace(".", ",")}%
    </Badge>
  );
}

function LinhaDePremio({
  premio,
  indice,
  quantos,
  totalNumbers,
  onConfigurar,
}: {
  premio: PremioDaRaspadinhaRow;
  indice: number;
  quantos: number;
  totalNumbers: number;
  onConfigurar: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function agir(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    ok: string,
  ) {
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(ok);
      // A lista vem do servidor: sem isto, a linha só mudaria depois de
      // alguém recarregar a página na mão.
      router.refresh();
    });
  }

  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{premio.rotulo}</span>
          <Badge variant="outline" className="text-[10px]">
            {premio.tipo === "PIX" ? "Pix" : "Skin"}
          </Badge>
          {premio.tipo === "PIX" && premio.valor != null && (
            <Badge variant="outline" className="text-[10px] tabular-nums">
              {formatBRL(premio.valor)}
            </Badge>
          )}
          {quantos > 1 && (
            <Badge variant="outline" className="text-[10px] tabular-nums">
              {indice} de {quantos}
            </Badge>
          )}
          {premio.chance != null && (
            <Badge variant="outline" className="text-[10px]">
              chance {premio.chance}%
            </Badge>
          )}
          <SeloDeSaida premio={premio} totalNumbers={totalNumbers} />
          {premio.travado && (
            <Badge
              variant="outline"
              className="border-amber-500/40 text-[10px] text-amber-500"
            >
              Travado
            </Badge>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-primary"
          disabled={isPending}
          onClick={onConfigurar}
          aria-label="Configurar a saída deste prêmio"
          title="Quando este prêmio sai"
        >
          <Settings className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          disabled={isPending}
          onClick={() =>
            agir(
              () => travarPremioDaRaspadinhaAction({ premioId: premio.id }),
              "Trava atualizada",
            )
          }
          aria-label={premio.travado ? "Destravar" : "Travar"}
          title={
            premio.travado
              ? "Destravar: volta a poder sair"
              : "Travar: fica guardado e não sai"
          }
        >
          {premio.travado ? (
            <Lock className="h-4 w-4 text-amber-500" />
          ) : (
            <Unlock className="h-4 w-4" />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          disabled={isPending}
          onClick={() =>
            agir(
              () => removerPremioDaRaspadinhaAction({ premioId: premio.id }),
              "Prêmio removido",
            )
          }
          aria-label="Remover prêmio"
          title="Remover esta unidade"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </li>
  );
}

/** Quantos títulos dão quantas raspadinhas. */
function Combos({
  raffleId,
  combos,
}: {
  raffleId: string;
  combos: ComboDaRaspadinha[];
}) {
  const router = useRouter();
  const [linhas, setLinhas] = useState<ComboDaRaspadinha[]>(
    combos.length > 0 ? combos : [{ minimo: 10, quantidade: 1, visivel: true }],
  );
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    const r = await salvarCombosDaRaspadinhaAction({
      raffleId,
      combos: linhas,
    });
    setSalvando(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success("Combos salvos");
    router.refresh();
  }

  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        Distribuição
      </p>
      <ul className="space-y-2">
        {linhas.map((c, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">A partir de</span>
            <Input
              inputMode="numeric"
              value={c.minimo}
              onChange={(e) =>
                setLinhas((antes) =>
                  antes.map((x, j) =>
                    j === i ? { ...x, minimo: Number(e.target.value) || 0 } : x,
                  ),
                )
              }
              className="h-8 w-20 font-mono text-xs"
            />
            <span className="text-xs text-muted-foreground">
              títulos, ganha
            </span>
            <Input
              inputMode="numeric"
              value={c.quantidade}
              onChange={(e) =>
                setLinhas((antes) =>
                  antes.map((x, j) =>
                    j === i
                      ? { ...x, quantidade: Number(e.target.value) || 0 }
                      : x,
                  ),
                )
              }
              className="h-8 w-20 font-mono text-xs"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() =>
                setLinhas((antes) => antes.filter((_, j) => j !== i))
              }
              aria-label="Remover combo"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setLinhas((antes) => [
              ...antes,
              { minimo: 0, quantidade: 1, visivel: true },
            ])
          }
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Combo
        </Button>
        <Button type="button" size="sm" disabled={salvando} onClick={salvar}>
          {salvando ? "Salvando..." : "Salvar combos"}
        </Button>
      </div>
    </div>
  );
}

function InserirPremio({
  raffleId,
  aberto,
  aoFechar,
}: {
  raffleId: string;
  aberto: boolean;
  aoFechar: () => void;
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<"PIX" | "SKIN">("PIX");
  const [rotulo, setRotulo] = useState("");
  const [valor, setValor] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    const r = await criarPremiosDaRaspadinhaAction({
      raffleId,
      tipo,
      rotulo,
      valor: valor.trim() === "" ? null : Number(valor.replace(",", ".")),
      quantidade: Number(quantidade) || 1,
      travado: false,
    });
    setSalvando(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(
      r.data.count === 1
        ? "Prêmio cadastrado"
        : `${r.data.count} prêmios cadastrados`,
    );
    setRotulo("");
    setValor("");
    setQuantidade("1");
    aoFechar();
    router.refresh();
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Inserir prêmio</DialogTitle>
          <DialogDescription>
            Cada unidade nasce com o seu ponto de saída, uma atrás da outra.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo</Label>
            <Select
              value={tipo}
              onValueChange={(v) => v && setTipo(v as "PIX" | "SKIN")}
            >
              <SelectTrigger className="w-full">
                <SelectValue labels={{ PIX: "Pix", SKIN: "Skin" }} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PIX">Pix</SelectItem>
                <SelectItem value="SKIN">Skin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="rasp-rotulo">
              O que a pessoa ganha
            </Label>
            <Input
              id="rasp-rotulo"
              value={rotulo}
              onChange={(e) => setRotulo(e.target.value)}
              placeholder={
                tipo === "PIX" ? "R$ 250 no Pix" : "AK-47 | Redline (FT)"
              }
            />
          </div>
          {tipo === "PIX" && (
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="rasp-valor">
                Valor em reais
              </Label>
              <Input
                id="rasp-valor"
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="250,00"
                className="font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                Serve para somar quanto já foi prometido em dinheiro.
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="rasp-qtd">
              Quantidade de unidades
            </Label>
            <Input
              id="rasp-qtd"
              inputMode="numeric"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              className="font-mono"
            />
          </div>
          <button
            type="button"
            disabled={salvando || rotulo.trim() === ""}
            onClick={salvar}
            className="h-9 w-full rounded-lg bg-primary text-sm font-bold text-primary-foreground transition-opacity hover:opacity-95 disabled:opacity-60"
          >
            {salvando ? "Salvando..." : "Salvar"}
          </button>
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

function ConfigDeSaida({
  premio,
  totalNumbers,
  aoFechar,
}: {
  premio: PremioDaRaspadinhaRow | null;
  totalNumbers: number;
  aoFechar: () => void;
}) {
  const router = useRouter();
  const [salvando, setSalvando] = useState(false);
  const [tipo, setTipo] = useState<TipoDeSaida>("PROGRESSO");
  const [pct, setPct] = useState("");
  const [titulosDe, setTitulosDe] = useState("");
  const [titulosAte, setTitulosAte] = useState("");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [ddds, setDdds] = useState("");

  // Guardar o id do último aberto é o que evita reescrever o que a pessoa está
  // digitando a cada renderização.
  const [ultimoId, setUltimoId] = useState<string | null>(null);
  if (premio && premio.id !== ultimoId) {
    setUltimoId(premio.id);
    setTipo(premio.tipoDeSaida);
    const p = porcentagemDaSaida(premio.saidaEmTitulos, totalNumbers);
    setPct(p == null ? "" : p.toFixed(2).replace(".", ","));
    setTitulosDe(premio.saidaTitulosDe?.toString() ?? "");
    setTitulosAte(premio.saidaTitulosAte?.toString() ?? "");
    setDataDe(paraCampoDeData(premio.saidaDataDe));
    setDataAte(paraCampoDeData(premio.saidaDataAte));
    setDdds(premio.saidaDdds.join(", "));
  }

  const emTitulos = (() => {
    const n = Number(pct.replace(",", "."));
    if (!Number.isFinite(n) || totalNumbers <= 0) return null;
    return Math.min(
      totalNumbers,
      Math.max(1, Math.ceil((n / 100) * totalNumbers)),
    );
  })();

  async function salvar() {
    if (!premio) return;
    setSalvando(true);
    const r = await salvarSaidaDaRaspadinhaAction({
      premioId: premio.id,
      tipoDeSaida: tipo,
      porcentagem: pct.trim() === "" ? null : Number(pct.replace(",", ".")),
      titulosDe: titulosDe.trim() === "" ? null : Number(titulosDe),
      titulosAte: titulosAte.trim() === "" ? null : Number(titulosAte),
      dataDe: dataDe.trim() === "" ? null : new Date(dataDe).toISOString(),
      dataAte: dataAte.trim() === "" ? null : new Date(dataAte).toISOString(),
      ddds: ddds
        .split(/[\s,]+/)
        .map((d) => d.replace(/\D/g, ""))
        .filter((d) => d.length === 2),
    });
    setSalvando(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success("Saída salva");
    aoFechar();
    router.refresh();
  }

  return (
    <Dialog open={premio != null} onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configurações de saída</DialogTitle>
          <DialogDescription>
            Quando <strong>{premio?.rotulo}</strong> vai sair. Ele vai para a
            primeira raspadinha revelada a partir do ponto escolhido.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo de saída</Label>
            <Select
              value={tipo}
              onValueChange={(v) => v && setTipo(v as TipoDeSaida)}
            >
              <SelectTrigger className="w-full">
                <SelectValue
                  labels={{
                    PROGRESSO: "Porcentagem da venda",
                    PERSONALIZADO: "Personalizado",
                  }}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PROGRESSO">Porcentagem da venda</SelectItem>
                <SelectItem value="PERSONALIZADO">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {tipo === "PROGRESSO" ? (
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="rasp-pct">
                Porcentagem
              </Label>
              <Input
                id="rasp-pct"
                inputMode="decimal"
                value={pct}
                onChange={(e) => setPct(e.target.value)}
                placeholder="12,50"
                className="font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                {emTitulos == null
                  ? "Em branco, este prêmio volta para o sorteio por chance."
                  : `Sai quando a venda chegar no título ${emTitulos.toLocaleString("pt-BR")} de ${totalNumbers.toLocaleString("pt-BR")}.`}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="rasp-tde">
                    Títulos, no mínimo
                  </Label>
                  <Input
                    id="rasp-tde"
                    inputMode="numeric"
                    value={titulosDe}
                    onChange={(e) => setTitulosDe(e.target.value)}
                    placeholder="10"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="rasp-tate">
                    Títulos, no máximo
                  </Label>
                  <Input
                    id="rasp-tate"
                    inputMode="numeric"
                    value={titulosAte}
                    onChange={(e) => setTitulosAte(e.target.value)}
                    placeholder="sem limite"
                    className="font-mono"
                  />
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="rasp-dde">
                    A partir de
                  </Label>
                  <Input
                    id="rasp-dde"
                    type="datetime-local"
                    value={dataDe}
                    onChange={(e) => setDataDe(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="rasp-date">
                    Até
                  </Label>
                  <Input
                    id="rasp-date"
                    type="datetime-local"
                    value={dataAte}
                    onChange={(e) => setDataAte(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="rasp-ddd">
                  DDDs (opcional)
                </Label>
                <Input
                  id="rasp-ddd"
                  value={ddds}
                  onChange={(e) => setDdds(e.target.value)}
                  placeholder="62, 11, 21"
                  className="font-mono"
                />
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Campo em branco não filtra. Para um disparo de WhatsApp das 14h,
                ponha 14h em <strong>A partir de</strong>: o prêmio espera a
                compra que veio dele.
              </p>
            </div>
          )}

          <button
            type="button"
            disabled={salvando}
            onClick={salvar}
            className="h-9 w-full rounded-lg bg-primary text-sm font-bold text-primary-foreground transition-opacity hover:opacity-95 disabled:opacity-60"
          >
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

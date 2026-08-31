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
import {
  CampoDePremio,
  type SkinDoCatalogoSimples,
} from "@/components/admin/campo-de-premio";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CreditCard,
  Lock,
  Plus,
  Settings,
  Trash2,
  Trophy,
  Unlock,
} from "lucide-react";
import type { SkinRarity } from "@prisma/client";

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
import { CabecalhoDeModal } from "@/components/admin/cabecalho-de-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatBRL, formatDateTime } from "@/lib/format";
import { RARITY_TEXT_VAR } from "@/lib/cs2";
import { IconeDoWhatsapp } from "@/components/icones/whatsapp";
import { numeroDoBilhete } from "@/lib/raspadinha";
import { linkDoWhatsapp, mensagemDeParabens } from "@/lib/whatsapp";
import { porcentagemDaSaida, type TipoDeSaida } from "@/lib/saida";
import {
  conferirRaspadinhasAction,
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

/** Um bilhete que já saiu premiado, com quem levou. */
export interface GanhadorDaRaspadinha {
  id: string;
  numero: number;
  premio: string;
  raridade: SkinRarity | null;
  ganhador: string;
  telefone: string | null;
  paisDoTelefone: string | null;
  raspadaEm: string | null;
  /** A pessoa já raspou? O prêmio existe desde a compra, o gesto é depois. */
  raspada: boolean;
  pagoEm: string | null;
}

export interface ConfigDaRaspadinha {
  ativa: boolean;
  rasparTodas: boolean;
  totalNumbers: number;
  combos: ComboDaRaspadinha[];
  premios: PremioDaRaspadinhaRow[];
  ganhadores: GanhadorDaRaspadinha[];
}

export function RaspadinhasModal({
  raffleId,
  initial,
  catalogo,
  aberto,
  aoFechar,
}: {
  raffleId: string;
  initial: ConfigDaRaspadinha;
  /** O catálogo de skins do tenant, para sugerir o nome do prêmio. */
  catalogo: SkinDoCatalogoSimples[];
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
        {/* Mais largo, e com respiro entre os blocos.
            No 2xl anterior a tabela de ganhadores não cabia sem rolagem
            lateral, e os blocos ficavam colados uns nos outros: a tela era uma
            coluna contínua de controles, sem hierarquia nenhuma. */}
        {/* O topo fica parado e só o miolo rola. Com a modal inteira rolando,
            o título e o botão de fechar subiam junto com o conteúdo: numa
            tela de 92vh cheia de prêmios, quem descia até o fim perdia a
            referência do que estava editando e como sair. */}
        <DialogContent className="grid max-h-[92vh] grid-rows-[auto_minmax(0,1fr)] overflow-hidden sm:max-w-3xl">
          <CabecalhoDeModal
            icone={<CreditCard className="h-5 w-5" />}
            tom="premio"
            titulo="Raspadinhas premiadas"
            descricao="Quem compra ganha raspadinhas pelos combos. Cada prêmio sai no ponto da venda que você agendar."
            acessorio={
              <Badge variant="outline" className="text-[10px] tabular-nums">
                {unidades.length} no bolo
              </Badge>
            }
          />

          {/* A margem negativa com o padding do mesmo tamanho põe a barra de
              rolagem na borda da modal, e não no meio do conteúdo. */}
          <div className="rolagem-discreta -mr-2 space-y-3.5 overflow-y-auto pr-2">
            <Bloco titulo="Como funciona">
              <div className="divide-y divide-white/[0.06]">
                <label className="flex cursor-pointer items-start gap-3 px-4 py-3">
                  <Switch
                    checked={ativa}
                    disabled={isPending}
                    onCheckedChange={(v) =>
                      salvarConfig({ ativa: v, rasparTodas })
                    }
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">
                      Ativar raspadinhas
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      Desligado, ninguém recebe raspadinha nas compras novas.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 px-4 py-3">
                  <Switch
                    checked={rasparTodas}
                    disabled={isPending || !ativa}
                    onCheckedChange={(v) =>
                      salvarConfig({ ativa, rasparTodas: v })
                    }
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">
                      Botão &ldquo;Raspar todas&rdquo;
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      Abre as raspadinhas de uma vez, sem raspar uma por uma.
                    </span>
                  </span>
                </label>
              </div>
            </Bloco>

            {/* O aviso que a caixa surpresa também dá: sem combo, ninguém
                recebe raspadinha nenhuma e a mecânica fica ligada sem efeito. */}
            {ativa && initial.combos.length === 0 && (
              <p className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-xs leading-relaxed text-amber-300">
                Cadastre um combo abaixo: sem ele, ninguém recebe raspadinha.
              </p>
            )}

            <Bloco
              titulo="Distribuição"
              nota="Quantos títulos dão quantas raspadinhas. Vale o maior degrau alcançado, e os degraus não se somam."
            >
              <Combos raffleId={raffleId} combos={initial.combos} />
            </Bloco>

            <Bloco
              titulo="Prêmios no bolo"
              nota={
                emPix > 0 ? `${formatBRL(emPix)} em Pix prometidos.` : undefined
              }
              acao={
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setInserindo(true)}
                  disabled={isPending}
                  className="rounded-full px-4"
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Inserir prêmio
                </Button>
              }
            >
              {unidades.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-muted-foreground">
                    <CreditCard className="h-5 w-5" />
                  </span>
                  <p className="text-sm font-semibold">Nenhum prêmio ainda</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sem prêmio, toda raspadinha sai vazia.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-white/[0.06]">
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
            </Bloco>

            <Bloco
              titulo="Quem já ganhou"
              nota="Os bilhetes que saíram premiados, do mais recente para o mais antigo."
              acessorio={
                <Badge variant="outline" className="text-[10px] tabular-nums">
                  {initial.ganhadores.length}
                </Badge>
              }
            >
              <Ganhadores ganhadores={initial.ganhadores} />
            </Bloco>

            <Conferencia raffleId={raffleId} />
          </div>
        </DialogContent>
      </Dialog>

      <InserirPremio
        raffleId={raffleId}
        catalogo={catalogo}
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
          {premio.valor != null && (
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

  // Sem borda e sem título próprios: quem dá o nome e a moldura é o bloco que
  // envolve. Com os dois, a tela mostrava "DISTRIBUIÇÃO" duas vezes, uma
  // dentro da outra, em caixas aninhadas.
  return (
    <div className="space-y-2 px-4 py-3">
      <ul className="space-y-2">
        {/* No celular a frase quebrava no meio: "A partir de [10] títulos,
            ganha" numa linha e o segundo campo com a lixeira na outra, sem
            dizer a que ele se referia. Ali cada campo ganha o próprio rótulo
            e a linha vira duas colunas; da largura de tablet para cima volta a
            ser a frase corrida, que é mais rápida de ler. */}
        {linhas.map((c, i) => (
          <li
            key={i}
            className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 sm:flex sm:flex-wrap sm:items-center"
          >
            <span className="hidden text-xs text-muted-foreground sm:inline">
              A partir de
            </span>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground sm:hidden">
                A partir de
              </Label>
              <Input
                inputMode="numeric"
                value={c.minimo}
                onChange={(e) =>
                  setLinhas((antes) =>
                    antes.map((x, j) =>
                      j === i
                        ? { ...x, minimo: Number(e.target.value) || 0 }
                        : x,
                    ),
                  )
                }
                className="h-9 w-full font-mono text-xs sm:h-8 sm:w-20"
              />
            </div>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              títulos, ganha
            </span>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground sm:hidden">
                Ganha
              </Label>
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
                className="h-9 w-full font-mono text-xs sm:h-8 sm:w-20"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-destructive sm:h-8 sm:w-8"
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
  catalogo,
  aberto,
  aoFechar,
}: {
  raffleId: string;
  catalogo: SkinDoCatalogoSimples[];
  aberto: boolean;
  aoFechar: () => void;
}) {
  const router = useRouter();
  const [rotulo, setRotulo] = useState("");
  const [valor, setValor] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    const r = await criarPremiosDaRaspadinhaAction({
      raffleId,
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
            <Label className="text-xs">O que a pessoa ganha</Label>
            {/* O mesmo campo da caixa surpresa: sugere o nome do catálogo e
                mostra a raridade. Não há mais seletor de Pix ou skin, porque
                o prêmio pode ser uma peça de computador, e obrigar a encaixar
                em uma das duas caixas era a pergunta errada. O que classifica
                é o próprio nome, conferido contra o catálogo no servidor. */}
            <CampoDePremio
              placeholder="AK-47 | Redline (FT), R$ 250 no Pix, RTX 4070..."
              valor={rotulo}
              aoMudar={setRotulo}
              catalogo={catalogo}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="rasp-valor">
              Quanto vale, em reais (opcional)
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
              Só para somar quanto já está prometido no painel. Não aparece para
              quem ganha: lá aparece o que você digitou acima.
            </p>
          </div>
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

/**
 * O conserto das compras que ficaram sem bilhete.
 *
 * A geração andava em três dos seis caminhos de confirmação de pagamento, e
 * quem pagou por um dos outros três ficou sem raspadinha nenhuma. Corrigir o
 * código conserta as compras seguintes e não devolve nada a quem já pagou:
 * aquelas compras continuam paradas no banco, sem os bilhetes a que tinham
 * direito, e não havia tela onde isso aparecesse.
 *
 * O botão pode ser apertado sem medo e quantas vezes quiser: quem já tem os
 * bilhetes não ganha mais nenhum. E quando não cria nada, diz por quê, porque
 * "zero" sem explicação vira desconfiança da ferramenta.
 */
function Conferencia({ raffleId }: { raffleId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [resultado, setResultado] = useState<string | null>(null);

  function conferir() {
    startTransition(async () => {
      const r = await conferirRaspadinhasAction({ raffleId });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const { conferidas, criadas, semCombo, faltouOlhar, motivo } = r.data;
      if (criadas > 0) {
        toast.success(`${criadas} raspadinha(s) entregue(s)`);
      }
      setResultado(
        [
          `${conferidas} compra(s) paga(s) conferida(s).`,
          criadas > 0
            ? `${criadas} bilhete(s) que faltavam foram criados.`
            : motivo,
          semCombo > 0
            ? `${semCombo} não alcançaram nenhum combo, então seguem sem bilhete.`
            : null,
          faltouOlhar > 0
            ? `Ficaram ${faltouOlhar} para trás nesta passada: aperte de novo para continuar.`
            : null,
        ]
          .filter(Boolean)
          .join(" "),
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.02] px-3.5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">Compras sem raspadinha</p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Confere as compras já pagas e entrega os bilhetes que faltaram. Quem
            já recebeu não recebe de novo.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-full"
          onClick={conferir}
          disabled={isPending}
        >
          {isPending ? "Conferindo..." : "Conferir e entregar"}
        </Button>
      </div>
      {resultado && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {resultado}
        </p>
      )}
    </div>
  );
}

/**
 * Um bloco do modal: nome em cima, conteúdo dentro, borda em volta.
 *
 * O modal era uma coluna contínua de controles, um encostado no outro, sem
 * dizer onde um assunto acabava e o outro começava: chave, chave, campo,
 * campo, lista. Cada bloco agora responde a uma pergunta e diz qual é.
 */
function Bloco({
  titulo,
  nota,
  acao,
  acessorio,
  children,
}: {
  titulo: string;
  nota?: string;
  /** Um botão à direita do nome. */
  acao?: React.ReactNode;
  /** Um selo pequeno ao lado do nome. */
  acessorio?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-white/[0.06] px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[11px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
              {titulo}
            </h3>
            {acessorio}
          </div>
          {nota && (
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              {nota}
            </p>
          )}
        </div>
        {acao}
      </header>
      {children}
    </section>
  );
}

/**
 * Quem já levou prêmio na raspadinha.
 *
 * A caixa surpresa mostrava a dela desde sempre e a raspadinha não tinha
 * onde: o prêmio era sorteado, saía para alguém, e sumia da vista de quem
 * precisa entregar. Sem esta lista, descobrir quem ganhou o quê exigia abrir
 * o banco.
 *
 * Tabela no computador e cartões no celular, como a fila de entregas: oito
 * colunas num telefone viram rolagem lateral, e a pessoa arrasta para ler
 * cada coluna perdendo de vista a linha em que estava.
 */
function Ganhadores({ ganhadores }: { ganhadores: GanhadorDaRaspadinha[] }) {
  if (ganhadores.length === 0) {
    return (
      <div className="px-4 py-10 text-center">
        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-muted-foreground">
          <Trophy className="h-5 w-5" />
        </span>
        <p className="text-sm font-semibold">Ninguém ganhou ainda</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Os bilhetes premiados aparecem aqui assim que alguém raspar.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Celular: um cartão por ganhador. */}
      <ul className="divide-y divide-white/[0.06] md:hidden">
        {ganhadores.map((g) => (
          <li key={g.id} className="space-y-1.5 px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                {g.ganhador}
              </p>
              <BotaoDeParabens ganhador={g} />
            </div>
            <NomeDoPremio ganhador={g} />
            <p className="text-[11px] text-muted-foreground tabular-nums">
              {g.raspada ? "Raspada" : "Não raspada"} · Bilhete{" "}
              {numeroDoBilhete(g.numero)}
              {g.raspadaEm ? ` · ${formatDateTime(new Date(g.raspadaEm))}` : ""}
            </p>
          </li>
        ))}
      </ul>

      {/* Computador: tabela, que é onde comparar linhas ajuda. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] text-left">
              <th className="px-4 py-2 text-[10px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
                Ganhador
              </th>
              <th className="px-4 py-2 text-[10px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
                Prêmio
              </th>
              <th className="px-4 py-2 text-[10px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
                Status
              </th>
              <th className="px-4 py-2 text-[10px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
                Bilhete
              </th>
              <th className="px-4 py-2 text-[10px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
                Raspou em
              </th>
              <th className="w-12 px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {ganhadores.map((g) => (
              <tr key={g.id} className="hover:bg-white/[0.02]">
                <td className="px-4 py-2.5 font-medium">{g.ganhador}</td>
                <td className="px-4 py-2.5">
                  <NomeDoPremio ganhador={g} />
                </td>
                <td className="px-4 py-2.5">
                  <Badge variant="outline" className="text-[10px]">
                    {g.raspada ? "Raspada" : "Não raspada"}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground tabular-nums">
                  {numeroDoBilhete(g.numero)}
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">
                  {g.raspadaEm ? formatDateTime(new Date(g.raspadaEm)) : "-"}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <BotaoDeParabens ganhador={g} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** O nome do prêmio com a cor da raridade, quando ela existe. */
function NomeDoPremio({ ganhador }: { ganhador: GanhadorDaRaspadinha }) {
  return (
    <span
      className="text-sm font-medium"
      style={
        ganhador.raridade
          ? { color: RARITY_TEXT_VAR[ganhador.raridade] }
          : undefined
      }
    >
      {ganhador.premio}
    </span>
  );
}

/**
 * O atalho para avisar quem ganhou, com a mensagem pronta.
 *
 * Mesmo gesto da tabela de caixas surpresas: quem entrega o prêmio abre o
 * WhatsApp daqui, e não copiando o telefone para outro lugar.
 */
function BotaoDeParabens({ ganhador }: { ganhador: GanhadorDaRaspadinha }) {
  const link = linkDoWhatsapp(
    ganhador.telefone,
    mensagemDeParabens({ nome: ganhador.ganhador, premio: ganhador.premio }),
    ganhador.paisDoTelefone,
  );
  if (!link) return null;
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      title="Avisar no WhatsApp"
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-emerald-500 transition-colors hover:bg-emerald-500/10"
    >
      <IconeDoWhatsapp className="h-4 w-4" />
      <span className="sr-only">Avisar {ganhador.ganhador} no WhatsApp</span>
    </a>
  );
}

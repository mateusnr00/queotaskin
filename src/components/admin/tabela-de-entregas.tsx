"use client";

// A fila de entregas.
//
// Tabela no desktop, cartões no celular. Tabela numa tela de 390px vira
// rolagem lateral, e a pessoa arrasta para ler cada coluna perdendo de vista a
// linha em que estava; empilhado, cada entrega é um bloco fechado. No desktop a
// tabela ganha, porque ali comparar linhas é o que diz o que falta fazer.
//
// O NOME DO GANHADOR NÃO FICA NA LISTA
//
// Ele ocupava uma coluna inteira e não serve para operar: para comprar e enviar
// a skin, o que se usa é o nome do item e o link de troca. O nome, o telefone,
// o e-mail e o SteamID ficam atrás do botão de informações, que é onde se olha
// quando é preciso falar com a pessoa.
//
// Isso também tira dado pessoal de uma tela que fica aberta o dia todo, às
// vezes com alguém do lado.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Info,
  PackageCheck,
} from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { semAcento } from "@/lib/busca";
import { formatBRL, formatDateTime } from "@/lib/format";
import { lerReais } from "@/lib/dinheiro";
import { numeroDoTitulo } from "@/lib/titulo";
import { RARITY_TEXT_VAR, WEAR_SHORT } from "@/lib/cs2";
import {
  ESTADOS_DA_ENTREGA,
  estadoDaEntrega,
  pendente,
} from "@/lib/entrega";
import {
  marcarEntregaAction,
  salvarCustoDaEntregaAction,
} from "@/server/actions/entregas";
import type { Delivery } from "@/server/services/deliveries";

/** Filtro da lista. "PENDENTES" agrupa tudo que ainda dá trabalho. */
const TODOS = "TODOS";
const PENDENTES = "PENDENTES";

export function TabelaDeEntregas({ entregas }: { entregas: Delivery[] }) {
  // Abre em PENDENTES: a fila existe para dizer o que falta fazer.
  const [filtro, setFiltro] = useState<string>(PENDENTES);
  const [busca, setBusca] = useState("");

  const qtdPendentes = entregas.filter((e) => pendente(e.status)).length;
  const semLink = entregas.filter(
    (e) => pendente(e.status) && e.winner && !e.winner.steamTradeUrl,
  ).length;
  const gasto = entregas.reduce((t, e) => t + (e.deliveryCost ?? 0), 0);

  const visiveis = useMemo(() => {
    const alvo = semAcento(busca);
    return entregas.filter((e) => {
      if (filtro === PENDENTES && !pendente(e.status)) return false;
      if (filtro !== PENDENTES && filtro !== TODOS && e.status !== filtro) {
        return false;
      }
      if (alvo === "") return true;
      // A busca ainda olha o nome do ganhador, mesmo ele não estando na tela:
      // "o pedido do Mateus" é como a pessoa lembra da entrega.
      const campos = [
        e.raffleTitle,
        e.winner?.name ?? "",
        e.prizes.map((p) => p.skinName ?? p.description).join(" "),
        String(e.ticketNumber),
      ];
      return campos.some((c) => semAcento(c).includes(alvo));
    });
  }, [entregas, filtro, busca]);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Entregas
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">
            {qtdPendentes} pendente{qtdPendentes === 1 ? "" : "s"}
          </span>{" "}
          de {entregas.length}.
          {gasto > 0 && (
            <>
              {" "}
              <span className="font-semibold text-foreground">
                {formatBRL(gasto)}
              </span>{" "}
              gastos com fornecedor.
            </>
          )}
        </p>
      </header>

      {semLink > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-amber-700 dark:text-amber-300">
            {semLink} entrega{semLink === 1 ? "" : "s"} pendente
            {semLink === 1 ? "" : "s"} sem link de troca cadastrado. Chame no
            WhatsApp e peça para preencher em{" "}
            <span className="font-mono">/minha-conta</span> antes de enviar.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Select value={filtro} onValueChange={(v) => setFiltro(v ?? TODOS)}>
          <SelectTrigger className="h-9 w-full sm:w-48" aria-label="Filtrar por status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={PENDENTES}>Pendentes</SelectItem>
            <SelectItem value={TODOS}>Todos os status</SelectItem>
            {ESTADOS_DA_ENTREGA.map((e) => (
              <SelectItem key={e.chave} value={e.chave}>
                <Ponto cor={e.cor} />
                {e.rotulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por skin, ganhador, campanha ou título"
          aria-label="Buscar entrega"
          className="h-9 w-full sm:max-w-sm"
        />
      </div>

      <div className="space-y-3 sm:hidden">
        {visiveis.map((e) => (
          <Cartao key={e.raffleId} entrega={e} />
        ))}
        {visiveis.length === 0 && <Vazio total={entregas.length} />}
      </div>

      <div className="hidden overflow-hidden rounded-xl border bg-card sm:block">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[260px]">Skin</TableHead>
                <TableHead className="min-w-[120px]">Link de troca</TableHead>
                <TableHead className="text-right">Título</TableHead>
                <TableHead className="min-w-[130px] text-right">
                  Custo
                </TableHead>
                <TableHead className="min-w-[150px]">Sorteado</TableHead>
                <TableHead className="sticky right-0 min-w-[190px] bg-card shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.6)]">
                  Status
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.map((e) => (
                <Linha key={e.raffleId} entrega={e} />
              ))}
            </TableBody>
          </Table>
        </div>
        {visiveis.length === 0 && <Vazio total={entregas.length} />}
      </div>
    </div>
  );
}

function Vazio({ total }: { total: number }) {
  return (
    <p className="rounded-xl border bg-card px-4 py-12 text-center text-sm text-muted-foreground sm:border-0">
      {total === 0
        ? "Nenhuma campanha sorteada ainda."
        : "Nada aqui com esse filtro."}
    </p>
  );
}

function Ponto({ cor }: { cor: string }) {
  return (
    <span
      aria-hidden
      className="mr-2 inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: cor }}
    />
  );
}

function Linha({ entrega }: { entrega: Delivery }) {
  const premio = entrega.prizes[0] ?? null;

  // Sem `opacity` na linha concluída: opacidade em elemento pai cria uma camada
  // de composição própria, e dentro dela `position: sticky` para de funcionar,
  // o que quebraria a coluna de status. Ela recua pela cor do texto.
  return (
    <TableRow className={cn(!pendente(entrega.status) && "text-muted-foreground")}>
      <TableCell>
        <div className="flex items-center gap-2.5">
          <Miniatura premio={premio} />
          <div className="min-w-0">
            <p className="flex items-center gap-1">
              <span
                className="truncate text-sm font-semibold"
                style={
                  premio?.skinRarity
                    ? { color: RARITY_TEXT_VAR[premio.skinRarity] }
                    : undefined
                }
              >
                {nomeDaSkin(entrega)}
              </span>
              <BotaoDeCopia
                valor={nomeDaSkin(entrega)}
                rotulo="Copiar nome da skin"
              />
              <FichaDoGanhador entrega={entrega} />
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {premio?.skinWear && (
                <span className="mr-1.5 rounded border px-1 py-px text-[10px] font-semibold">
                  {WEAR_SHORT[premio.skinWear]}
                </span>
              )}
              <Link
                href={`/admin/sorteios/${entrega.raffleId}/compras`}
                className="hover:text-foreground hover:underline"
              >
                {entrega.raffleTitle}
              </Link>
            </p>
          </div>
        </div>
      </TableCell>

      <TableCell>
        <LinkDeTroca entrega={entrega} />
      </TableCell>

      <TableCell className="text-right font-mono text-sm font-bold tabular-nums">
        {numeroDoTitulo(entrega.ticketNumber, entrega.totalNumbers)}
      </TableCell>

      <TableCell className="text-right">
        <CampoDeCusto entrega={entrega} />
      </TableCell>

      <TableCell className="text-xs text-muted-foreground">
        {formatDateTime(entrega.drawnAt)}
      </TableCell>

      <TableCell className="sticky right-0 bg-card shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.6)]">
        <SeletorDeStatus entrega={entrega} />
      </TableCell>
    </TableRow>
  );
}

function Cartao({ entrega }: { entrega: Delivery }) {
  const premio = entrega.prizes[0] ?? null;
  const estado = estadoDaEntrega(entrega.status);

  return (
    <article className="space-y-3 rounded-xl border bg-card p-3">
      <div className="flex items-start gap-2.5">
        <Miniatura premio={premio} grande />
        <div className="min-w-0 flex-1">
          <p className="flex items-start gap-1">
            <span
              className="min-w-0 text-sm font-bold leading-snug"
              style={
                premio?.skinRarity
                  ? { color: RARITY_TEXT_VAR[premio.skinRarity] }
                  : undefined
              }
            >
              {nomeDaSkin(entrega)}
            </span>
            <BotaoDeCopia
              valor={nomeDaSkin(entrega)}
              rotulo="Copiar nome da skin"
            />
          </p>
          <p className="text-xs text-muted-foreground">
            {premio?.skinWear && (
              <span className="mr-1.5 rounded border px-1 py-px text-[10px] font-semibold">
                {WEAR_SHORT[premio.skinWear]}
              </span>
            )}
            Título{" "}
            <strong className="font-mono text-foreground tabular-nums">
              {numeroDoTitulo(entrega.ticketNumber, entrega.totalNumbers)}
            </strong>
            {" · "}
            {formatDateTime(entrega.drawnAt)}
          </p>
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
          style={{ backgroundColor: `${estado.cor}22`, color: estado.cor }}
        >
          {estado.rotulo}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <LinkDeTroca entrega={entrega} comRotulo />
        <FichaDoGanhador entrega={entrega} comRotulo />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Custo</span>
        <div className="w-32">
          <CampoDeCusto entrega={entrega} />
        </div>
      </div>

      <div className="border-t pt-2.5">
        <SeletorDeStatus entrega={entrega} />
      </div>
    </article>
  );
}

function Miniatura({
  premio,
  grande,
}: {
  premio: Delivery["prizes"][number] | null;
  grande?: boolean;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40",
        grande ? "h-12 w-12" : "h-10 w-10",
      )}
    >
      {premio?.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={premio.imageUrl}
          alt=""
          className="h-full w-full object-contain p-0.5"
        />
      ) : (
        <PackageCheck className="h-4 w-4 text-muted-foreground" />
      )}
    </span>
  );
}

function LinkDeTroca({
  entrega,
  comRotulo,
}: {
  entrega: Delivery;
  comRotulo?: boolean;
}) {
  if (!entrega.winner?.steamTradeUrl) {
    return (
      <span className="text-xs text-amber-600 dark:text-amber-400">
        sem link de troca
      </span>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <BotaoDeCopia valor={entrega.winner.steamTradeUrl} />
      <a
        href={entrega.winner.steamTradeUrl}
        target="_blank"
        rel="noopener noreferrer"
        title="Abrir na Steam"
        className={cn(
          "inline-flex h-8 items-center justify-center gap-1.5 rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          comRotulo ? "px-2 text-xs font-semibold" : "w-8",
        )}
      >
        <ExternalLink className="h-3.5 w-3.5" />
        {comRotulo ? "Abrir na Steam" : <span className="sr-only">Abrir na Steam</span>}
      </a>
    </div>
  );
}

/**
 * Os dados de quem ganhou, atrás de um botão.
 *
 * Eles saíram da lista porque não servem para operar: comprar e enviar a skin
 * usa o nome do item e o link de troca. Nome, telefone e e-mail servem para
 * FALAR com a pessoa, que é outra tarefa e acontece bem menos.
 */
function FichaDoGanhador({
  entrega,
  comRotulo,
}: {
  entrega: Delivery;
  comRotulo?: boolean;
}) {
  const g = entrega.winner;
  return (
    <Dialog>
      <DialogTrigger
        title="Dados do ganhador"
        className={cn(
          "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          comRotulo ? "px-2 text-xs font-semibold" : "w-8",
        )}
      >
        <Info className="h-3.5 w-3.5" />
        {comRotulo ? "Ganhador" : <span className="sr-only">Dados do ganhador</span>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Ganhador</DialogTitle>
          <DialogDescription>{entrega.raffleTitle}</DialogDescription>
        </DialogHeader>
        {g ? (
          <dl className="space-y-2 text-sm">
            <Dado rotulo="Nome" valor={g.name} />
            <Dado rotulo="Celular" valor={g.phone} copiavel />
            <Dado rotulo="E-mail" valor={g.email} copiavel />
            <Dado rotulo="SteamID64" valor={g.steamId} copiavel />
            <Dado
              rotulo="Título"
              valor={numeroDoTitulo(entrega.ticketNumber, entrega.totalNumbers)}
            />
          </dl>
        ) : (
          <p className="text-sm text-destructive">
            O título {entrega.ticketNumber} não consta como vendido nesta
            campanha. Confira o resultado declarado.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Dado({
  rotulo,
  valor,
  copiavel,
}: {
  rotulo: string;
  valor: string | null;
  copiavel?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <dt className="text-[0.65rem] tracking-wider text-muted-foreground uppercase">
        {rotulo}
      </dt>
      <dd className="flex items-center gap-1 text-sm font-semibold">
        <span className="min-w-0 flex-1 break-all">{valor ?? "-"}</span>
        {copiavel && valor && (
          <BotaoDeCopia valor={valor} rotulo={`Copiar ${rotulo}`} />
        )}
      </dd>
    </div>
  );
}

/** Copiar sem sair da linha. É o gesto mais repetido desta tela. */
function BotaoDeCopia({
  valor,
  rotulo = "Copiar link de troca",
}: {
  valor: string;
  rotulo?: string;
}) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      title={rotulo}
      onClick={async () => {
        await navigator.clipboard.writeText(valor);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 1500);
      }}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {copiado ? (
        <Check className="h-4 w-4 text-emerald-500" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
      <span className="sr-only">{rotulo}</span>
    </button>
  );
}

/** O texto que o fornecedor precisa receber, num lugar só. */
function nomeDaSkin(entrega: Delivery): string {
  const p = entrega.prizes[0];
  return p?.skinName ?? p?.description ?? entrega.raffleTitle;
}

function SeletorDeStatus({ entrega }: { entrega: Delivery }) {
  const router = useRouter();
  const [salvando, setSalvando] = useState(false);
  const [status, setStatus] = useState(entrega.status);
  const estado = estadoDaEntrega(status);

  async function trocar(valor: string | null) {
    if (!valor || valor === status) return;
    const anterior = status;
    setStatus(valor as typeof status);
    setSalvando(true);
    const r = await marcarEntregaAction({
      raffleId: entrega.raffleId,
      status: valor,
      observacao: entrega.deliveryNote,
    });
    setSalvando(false);
    if (!r.ok) {
      // Volta ao anterior: deixar o novo na tela depois de o servidor recusar
      // mostraria um estado que não existe no banco.
      setStatus(anterior);
      toast.error(r.error);
      return;
    }
    toast.success(`Status: ${estadoDaEntrega(valor as typeof status).rotulo}`);
    router.refresh();
  }

  return (
    <Select value={status} onValueChange={trocar} disabled={salvando}>
      <SelectTrigger
        className="h-9 w-full"
        aria-label={`Status da entrega de ${entrega.raffleTitle}`}
        style={{ borderColor: `${estado.cor}66` }}
      >
        <SelectValue>
          <span className="flex items-center">
            <Ponto cor={estado.cor} />
            {estado.rotulo}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {ESTADOS_DA_ENTREGA.map((e) => (
          <SelectItem key={e.chave} value={e.chave}>
            <Ponto cor={e.cor} />
            {e.rotulo}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * O custo, editável na própria linha.
 *
 * Salva ao sair do campo e no Enter, e só quando o valor mudou: anotar preço é
 * digitar um número e seguir, não abrir um formulário.
 */
function CampoDeCusto({ entrega }: { entrega: Delivery }) {
  const router = useRouter();
  const gravado = entrega.deliveryCost;
  const comoTexto = gravado == null ? "" : gravado.toFixed(2).replace(".", ",");
  const [texto, setTexto] = useState(comoTexto);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    const valor = lerReais(texto);
    if (valor === gravado) return;
    setSalvando(true);
    const r = await salvarCustoDaEntregaAction(entrega.raffleId, valor);
    setSalvando(false);
    if (!r.ok) {
      toast.error(r.error);
      setTexto(comoTexto);
      return;
    }
    toast.success(valor == null ? "Custo apagado." : `Custo: ${formatBRL(valor)}`);
    router.refresh();
  }

  return (
    <Input
      value={texto}
      disabled={salvando}
      inputMode="decimal"
      onChange={(e) => setTexto(e.target.value)}
      onBlur={salvar}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setTexto(comoTexto);
      }}
      placeholder="R$"
      aria-label={`Custo da entrega de ${entrega.raffleTitle}`}
      className={cn(
        "h-8 text-right font-mono text-xs tabular-nums",
        gravado != null && "border-emerald-500/40",
      )}
    />
  );
}

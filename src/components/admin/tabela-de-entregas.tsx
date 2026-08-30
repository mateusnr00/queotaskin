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

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  Clock,
  Coins,
  Copy,
  ExternalLink,
  Info,
  PackageCheck,
  Search,
  Truck,
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
import { Etiqueta, Moldura, Placa } from "@/components/admin/moldura";
import { semAcento } from "@/lib/busca";
import { formatDateTime } from "@/lib/format";
import { lerReais } from "@/lib/dinheiro";
import {
  deYuan,
  formatarMoeda,
  paraYuan,
  proximaMoeda,
  SIMBOLO,
  type Moeda,
  type Taxas,
} from "@/lib/moeda";
import { numeroDoTitulo } from "@/lib/titulo";
import {
  PRAZO_DE_ENTREGA_HORAS,
  situacaoDoPrazo,
  type EstadoDoPrazo,
} from "@/lib/prazo";
import { RARITY_TEXT_VAR, WEAR_SHORT } from "@/lib/cs2";
import { ESTADOS_DA_ENTREGA, estadoDaEntrega, pendente } from "@/lib/entrega";
import {
  marcarEntregaAction,
  salvarCustoDaEntregaAction,
  salvarTaxasAction,
} from "@/server/actions/entregas";
import type { DeliveryStatus } from "@prisma/client";

import type { Delivery } from "@/server/services/deliveries";

/** Filtro da lista. "PENDENTES" agrupa tudo que ainda dá trabalho. */
const TODOS = "TODOS";
const PENDENTES = "PENDENTES";

/** Como o filtro escolhido aparece no botão fechado. */
function rotuloDoFiltro(filtro: string): string {
  if (filtro === TODOS) return "Todos os status";
  if (filtro === PENDENTES) return "Pendentes";
  return estadoDaEntrega(filtro as DeliveryStatus).rotulo;
}

export function TabelaDeEntregas({
  entregas,
  taxas,
}: {
  entregas: Delivery[];
  taxas: Taxas;
}) {
  // Abre em TODOS.
  //
  // Abria em Pendentes, e isso fazia a linha SUMIR no instante em que o custo
  // era anotado: a entrega mudava para Enviado e caía fora do filtro, sem
  // nenhum aviso de que tinha ido para outro lugar. Parecia perda de dado.
  //
  // Com todas na tela, marcar uma entrega muda a cor do status e ela fica onde
  // estava. Quem quer ver só o que falta troca no seletor, que continua ali.
  const [filtro, setFiltro] = useState<string>(TODOS);
  const [busca, setBusca] = useState("");
  // Yuan por padrão: é a moeda em que a skin é comprada, e é o número que fica
  // gravado. Real e dólar são leituras. A escolha vale para a lista inteira,
  // porque comparar custos em moedas diferentes não compara nada.
  const [moeda, setMoeda] = useState<Moeda>("CNY");
  // O relógio entra DEPOIS de montar. Calculado durante a renderização, o
  // servidor e o navegador contariam horas em instantes diferentes e a
  // hidratação brigaria; o selo do prazo simplesmente aparece um quadro depois.
  const [agora, setAgora] = useState<Date | null>(null);
  useEffect(() => {
    // O primeiro valor sai por setTimeout(0), e não direto: chamar setState no
    // corpo do efeito dispara renderização em cascata, e o compilador do React
    // recusa, com razão. O atraso de um quadro não é perceptível.
    const primeiro = setTimeout(() => setAgora(new Date()), 0);
    // De minuto em minuto: "faltam 3h" que não vira "faltam 2h" com a tela
    // aberta o dia todo é um aviso que mente.
    const id = setInterval(() => setAgora(new Date()), 60_000);
    return () => {
      clearTimeout(primeiro);
      clearInterval(id);
    };
  }, []);

  const qtdPendentes = entregas.filter((e) => pendente(e.status)).length;
  const semLink = entregas.filter(
    (e) => pendente(e.status) && e.winner && !e.winner.steamTradeUrl,
  ).length;
  const gastoEmYuan = entregas.reduce((t, e) => t + (e.deliveryCost ?? 0), 0);
  const gasto = deYuan(gastoEmYuan, moeda, taxas);

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

  // Quantas estouraram o prazo. É o número que decide o que fazer primeiro, e
  // ele não existia em lugar nenhum da tela: dava para ter cinco atrasadas e a
  // página só dizer "cinco pendentes".
  const atrasadas = agora
    ? entregas.filter(
        (e) =>
          situacaoDoPrazo(e.drawnAt, e.deliveredAt, agora)?.estado ===
          "atrasada",
      ).length
    : 0;

  return (
    <div className="space-y-5">
      <header className="space-y-4">
        <div>
          {/* Etiqueta antes do título: diz de que parte do painel isto é, sem
              gastar uma linha de texto explicando. */}
          <Etiqueta icone={<Truck aria-hidden className="h-3 w-3" />}>
            Operação
          </Etiqueta>
          <h1 className="mt-2 text-2xl font-black tracking-tight md:text-3xl">
            Entregas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ganhador, skin e link de troca de cada campanha sorteada.
          </p>
        </div>

        {/* Três números, em placas. Eram uma frase corrida, e frase não se lê
            de relance: quem abre esta tela quer saber quanto falta, quanto
            atrasou e quanto saiu do caixa, nessa ordem. */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Placa
            rotulo="Pendentes"
            valor={String(qtdPendentes)}
            nota={`de ${entregas.length}`}
            icone={<PackageCheck className="h-3.5 w-3.5" />}
          />
          <Placa
            rotulo="Atrasadas"
            valor={String(atrasadas)}
            nota={`prazo de ${PRAZO_DE_ENTREGA_HORAS}h`}
            icone={<AlertTriangle className="h-3.5 w-3.5" />}
            tom={atrasadas > 0 ? "alerta" : "neutro"}
          />
          <Placa
            rotulo="Custo total"
            valor={
              gasto == null
                ? formatarMoeda(gastoEmYuan, "CNY")
                : formatarMoeda(gasto, moeda)
            }
            nota="com fornecedor"
            icone={<Coins className="h-3.5 w-3.5" />}
          />
        </div>
      </header>

      {semLink > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-amber-700 dark:text-amber-300">
            {semLink} entrega{semLink === 1 ? "" : "s"} pendente
            {semLink === 1 ? "" : "s"} sem link de troca cadastrado. Chame no
            WhatsApp e peça para preencher em{" "}
            <span className="font-mono">/minha-conta</span> antes de enviar.
          </p>
        </div>
      )}

      {/* A barra de controles vive dentro da mesma moldura dupla do resto,
          em vez de flutuar solta sobre o fundo. */}
      <Moldura>
        <div className="flex flex-wrap items-center gap-2 p-2.5">
          <Select value={filtro} onValueChange={(v) => setFiltro(v ?? TODOS)}>
            <SelectTrigger
              className="h-9 w-full sm:w-48"
              aria-label="Filtrar por status"
            >
              {/* O rótulo é escrito aqui, e não deixado para o componente: sem
                  isto ele mostra o VALOR cru ("TODOS", "PRIORIDADE"), que é
                  como o código chama o estado, não como a pessoa chama. */}
              <SelectValue>{rotuloDoFiltro(filtro)}</SelectValue>
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

          {/* No celular a busca ocupa a linha inteira: dividida com os dois
              botões, ela sobrava com uns quatro centímetros e o texto de
              exemplo era cortado no meio da palavra. */}
          <div className="relative min-w-0 basis-full sm:flex-1 sm:basis-auto">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por skin, ganhador, campanha ou título"
              aria-label="Buscar entrega"
              className="h-9 w-full pl-8"
            />
          </div>

          {/* A moeda, num clique. Yuan, real, dólar, e volta. */}
          <button
            type="button"
            onClick={() => setMoeda(proximaMoeda(moeda))}
            title="Trocar a moeda dos custos"
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3.5 text-xs font-bold transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white/[0.07] active:scale-[0.97]"
          >
            <Coins className="h-3.5 w-3.5 text-muted-foreground" />
            {SIMBOLO[moeda]} {moeda}
          </button>

          <DialogDeTaxas taxas={taxas} />
        </div>
      </Moldura>

      {/* Sem taxa cadastrada não há como converter, e a tela diz isso em vez
          de mostrar um número inventado. */}
      {moeda !== "CNY" && gasto == null && (
        <p className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          Cadastre a taxa de câmbio em Taxas para ver os custos em{" "}
          {moeda === "BRL" ? "real" : "dólar"}. Sem ela, os valores continuam em
          yuan.
        </p>
      )}

      <div className="space-y-3 sm:hidden">
        {visiveis.map((e) => (
          <Cartao
            key={e.raffleId}
            entrega={e}
            moeda={moeda}
            taxas={taxas}
            agora={agora}
          />
        ))}
        {visiveis.length === 0 && <Vazio total={entregas.length} />}
      </div>

      <div className="hidden sm:block">
        <Moldura>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="min-w-[260px]">Skin</TableHead>
                  <TableHead className="min-w-[120px]">Link de troca</TableHead>
                  <TableHead className="min-w-[130px] text-right">
                    Custo ({moeda})
                  </TableHead>
                  <TableHead className="min-w-[150px]">Sorteado</TableHead>
                  <TableHead className="min-w-[170px]">Enviado</TableHead>
                  <TableHead className="sticky right-0 min-w-[190px] bg-[#0e1013] shadow-[-10px_0_14px_-10px_rgba(0,0,0,0.8)]">
                    Status
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.map((e) => (
                  <Linha
                    key={e.raffleId}
                    entrega={e}
                    moeda={moeda}
                    taxas={taxas}
                    agora={agora}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
          {visiveis.length === 0 && <Vazio total={entregas.length} dentro />}
        </Moldura>
      </div>
    </div>
  );
}

const COR_DO_PRAZO: Record<EstadoDoPrazo, string> = {
  no_prazo: "border-white/15 text-muted-foreground",
  perto:
    "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  atrasada: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
  cumprida:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  estourada:
    "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

/** Qual dos tempos é este: o ícone diz o que o rótulo curto deixou de dizer. */
const ICONE_DO_PRAZO: Record<EstadoDoPrazo, typeof Clock> = {
  no_prazo: Clock,
  perto: Clock,
  atrasada: AlertTriangle,
  cumprida: Check,
  estourada: AlertTriangle,
};

function SeloDoPrazo({
  entrega,
  agora,
}: {
  entrega: Delivery;
  agora: Date | null;
}) {
  // Sem relógio ainda (primeiro quadro) ou sem data de sorteio, não há o que
  // dizer, e um selo vazio seria pior do que selo nenhum.
  if (!agora) return null;
  const s = situacaoDoPrazo(entrega.drawnAt, entrega.deliveredAt, agora);
  if (!s) return null;
  const Icone = ICONE_DO_PRAZO[s.estado];

  return (
    <span
      title={`${s.rotulo} (prazo de ${PRAZO_DE_ENTREGA_HORAS}h a partir do sorteio)`}
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-0.5 rounded-full border px-1 py-px align-middle text-[10px] font-bold tabular-nums",
        COR_DO_PRAZO[s.estado],
      )}
    >
      <Icone aria-hidden className="h-2.5 w-2.5" strokeWidth={2.5} />
      {s.curto}
      <span className="sr-only">{s.rotulo}</span>
    </span>
  );
}

function Vazio({ total, dentro }: { total: number; dentro?: boolean }) {
  const corpo = (
    <div className="px-4 py-14 text-center">
      <PackageCheck
        aria-hidden
        className="mx-auto h-8 w-8 text-muted-foreground/30"
        strokeWidth={1.5}
      />
      <p className="mt-3 text-sm font-semibold">
        {total === 0
          ? "Nenhuma campanha sorteada ainda."
          : "Nada com esse filtro."}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {total === 0
          ? "Quando um sorteio terminar, a entrega aparece aqui."
          : "Troque o status ou limpe a busca."}
      </p>
    </div>
  );
  // Dentro da tabela ele já está numa moldura; solto no celular precisa da
  // dele, senão fica um texto boiando no fundo da página.
  return dentro ? corpo : <Moldura>{corpo}</Moldura>;
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

function Linha({
  entrega,
  moeda,
  taxas,
  agora,
}: {
  entrega: Delivery;
  moeda: Moeda;
  taxas: Taxas;
  agora: Date | null;
}) {
  const premio = entrega.prizes[0] ?? null;

  // Sem `opacity` na linha concluída: opacidade em elemento pai cria uma camada
  // de composição própria, e dentro dela `position: sticky` para de funcionar,
  // o que quebraria a coluna de status. Ela recua pela cor do texto.
  return (
    <TableRow
      className={cn(
        "border-white/[0.06] transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white/[0.03]",
        !pendente(entrega.status) && "text-muted-foreground",
      )}
    >
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
              {premio?.skinWear && (
                <span className="shrink-0 rounded border px-1 py-px text-[10px] font-semibold text-muted-foreground">
                  {WEAR_SHORT[premio.skinWear]}
                </span>
              )}
              <BotaoDeCopia
                valor={nomeDaSkin(entrega)}
                rotulo="Copiar nome da skin"
              />
              <FichaDoGanhador entrega={entrega} />
            </p>
          </div>
        </div>
      </TableCell>

      <TableCell>
        <LinkDeTroca entrega={entrega} />
      </TableCell>

      <TableCell className="text-right">
        <CampoDeCusto entrega={entrega} moeda={moeda} taxas={taxas} />
      </TableCell>

      <TableCell className="text-xs text-muted-foreground">
        {formatDateTime(entrega.drawnAt)}
      </TableCell>

      <TableCell className="text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          {entrega.deliveredAt ? formatDateTime(entrega.deliveredAt) : "-"}
          <SeloDoPrazo entrega={entrega} agora={agora} />
        </span>
      </TableCell>

      <TableCell className="sticky right-0 bg-[#0e1013] shadow-[-10px_0_14px_-10px_rgba(0,0,0,0.8)]">
        <SeletorDeStatus entrega={entrega} />
      </TableCell>
    </TableRow>
  );
}

function Cartao({
  entrega,
  moeda,
  taxas,
  agora,
}: {
  entrega: Delivery;
  moeda: Moeda;
  taxas: Taxas;
  agora: Date | null;
}) {
  const premio = entrega.prizes[0] ?? null;
  const estado = estadoDaEntrega(entrega.status);

  return (
    <Moldura>
      <article className="space-y-3 p-3.5">
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
              Sorteada {formatDateTime(entrega.drawnAt)}
            </p>
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {entrega.deliveredAt
                ? `Enviada ${formatDateTime(entrega.deliveredAt)}`
                : "Ainda não enviada"}
              <SeloDoPrazo entrega={entrega} agora={agora} />
            </p>
          </div>
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
            style={{ backgroundColor: `${estado.cor}22`, color: estado.cor }}
          >
            {estado.rotulo}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-white/[0.08] bg-white/[0.02] p-1">
          <LinkDeTroca entrega={entrega} comRotulo />
          <FichaDoGanhador entrega={entrega} comRotulo />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Custo</span>
          <div className="w-32">
            <CampoDeCusto entrega={entrega} moeda={moeda} taxas={taxas} />
          </div>
        </div>

        <div className="border-t border-white/[0.08] pt-2.5">
          <SeletorDeStatus entrega={entrega} />
        </div>
      </article>
    </Moldura>
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
        "flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]",
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
        {comRotulo ? (
          "Abrir na Steam"
        ) : (
          <span className="sr-only">Abrir na Steam</span>
        )}
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
        {comRotulo ? (
          "Ganhador"
        ) : (
          <span className="sr-only">Dados do ganhador</span>
        )}
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
            {/* O link da campanha mora aqui, e não na lista: ele é consulta,
                e a lista é para operar. */}
            <Link
              href={`/admin/sorteios/${entrega.raffleId}/compras`}
              className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm font-semibold transition-colors hover:border-primary/40 hover:bg-muted/60"
            >
              <span className="min-w-0 truncate">Ver a campanha</span>
              <ExternalLink aria-hidden className="h-3.5 w-3.5 shrink-0" />
            </Link>
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

  // O SELETOR TEM QUE SEGUIR O SERVIDOR, E NÃO SÓ O PRÓPRIO CLIQUE.
  //
  // O status também muda por fora daqui: anotar o custo marca a entrega como
  // enviada, e apagar o custo a devolve para a fila. Com o estado preso ao
  // valor inicial, o seletor continuava exibindo o de antes depois do
  // router.refresh, e a linha ficava dizendo "Enviado" com o campo de custo
  // vazio. Um estado que não existe no banco, na cara de quem opera.
  //
  // Guardar o último valor vindo do servidor é o que separa "o servidor mudou"
  // de "eu acabei de escolher": só o primeiro reescreve a escolha na tela.
  const [ultimoDoServidor, setUltimoDoServidor] = useState(entrega.status);
  if (ultimoDoServidor !== entrega.status) {
    setUltimoDoServidor(entrega.status);
    setStatus(entrega.status);
  }

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
 * O campo mostra e aceita o valor na moeda ESCOLHIDA na barra, e converte para
 * yuan na hora de gravar. Yuan é o que fica no banco porque é a moeda em que a
 * skin foi comprada de verdade; o resto é leitura.
 *
 * Isso permite digitar em real quando foi em real que se pagou, sem obrigar a
 * fazer a conta de cabeça antes.
 *
 * Salva ao sair do campo e no Enter, e só quando o valor mudou.
 */
function CampoDeCusto({
  entrega,
  moeda,
  taxas,
}: {
  entrega: Delivery;
  moeda: Moeda;
  taxas: Taxas;
}) {
  const router = useRouter();
  const emYuan = entrega.deliveryCost;
  // Sem taxa, não dá para mostrar nem editar fora do yuan: o campo cai para
  // yuan em vez de exibir vazio, que pareceria "custo não anotado".
  const podeConverter = emYuan == null || deYuan(emYuan, moeda, taxas) != null;
  const moedaDoCampo: Moeda = podeConverter ? moeda : "CNY";
  const naMoeda = emYuan == null ? null : deYuan(emYuan, moedaDoCampo, taxas);
  const comoTexto = naMoeda == null ? "" : naMoeda.toFixed(2).replace(".", ",");

  const [texto, setTexto] = useState(comoTexto);
  const [salvando, setSalvando] = useState(false);
  // A moeda pode mudar embaixo do campo, e o texto tem que acompanhar. Guardar
  // qual moeda o texto atual representa é o que evita gravar um número de real
  // como se fosse yuan.
  const [moedaDoTexto, setMoedaDoTexto] = useState(moedaDoCampo);
  if (moedaDoTexto !== moedaDoCampo) {
    setMoedaDoTexto(moedaDoCampo);
    setTexto(comoTexto);
  }

  async function salvar() {
    const digitado = lerReais(texto);
    const novoEmYuan =
      digitado == null ? null : paraYuan(digitado, moedaDoCampo, taxas);
    // Compara com duas casas: reescrever "10,00" sobre 10 não é uma mudança.
    const igual =
      (novoEmYuan == null && emYuan == null) ||
      (novoEmYuan != null &&
        emYuan != null &&
        Math.abs(novoEmYuan - emYuan) < 0.005);
    if (igual) return;

    setSalvando(true);
    const r = await salvarCustoDaEntregaAction(entrega.raffleId, novoEmYuan);
    setSalvando(false);
    if (!r.ok) {
      toast.error(r.error);
      setTexto(comoTexto);
      return;
    }
    toast.success(
      novoEmYuan == null
        ? "Custo apagado."
        : `Custo: ${formatarMoeda(novoEmYuan, "CNY")}`,
    );
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
      placeholder={SIMBOLO[moedaDoCampo]}
      aria-label={`Custo da entrega de ${entrega.raffleTitle}, em ${moedaDoCampo}`}
      className={cn(
        "h-8 text-right font-mono text-xs tabular-nums",
        emYuan != null && "border-emerald-500/40",
      )}
    />
  );
}

/** As taxas de câmbio, atrás de um botão, como na referência. */
function DialogDeTaxas({ taxas }: { taxas: Taxas }) {
  const router = useRouter();
  const [cny, setCny] = useState(
    taxas.cnyToBrl == null ? "" : String(taxas.cnyToBrl).replace(".", ","),
  );
  const [usd, setUsd] = useState(
    taxas.usdToBrl == null ? "" : String(taxas.usdToBrl).replace(".", ","),
  );
  const [salvando, setSalvando] = useState(false);
  const [aberto, setAberto] = useState(false);

  async function salvar() {
    setSalvando(true);
    const r = await salvarTaxasAction(lerReais(cny), lerReais(usd));
    setSalvando(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success("Taxas salvas.");
    setAberto(false);
    router.refresh();
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
        <Coins className="h-3.5 w-3.5" />
        Taxas
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Taxas de câmbio</DialogTitle>
          <DialogDescription>
            Usadas para ler em real e em dólar o custo que foi pago em yuan.
            Digitadas, e não buscadas de uma cotação automática: quem comprou é
            quem sabe a que taxa comprou.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="taxa-cny" className="text-sm font-medium">
              1 yuan vale quantos reais
            </label>
            <Input
              id="taxa-cny"
              value={cny}
              inputMode="decimal"
              onChange={(e) => setCny(e.target.value)}
              placeholder="0,76"
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="taxa-usd" className="text-sm font-medium">
              1 dólar vale quantos reais
            </label>
            <Input
              id="taxa-usd"
              value={usd}
              inputMode="decimal"
              onChange={(e) => setUsd(e.target.value)}
              placeholder="5,40"
              className="font-mono"
            />
          </div>
          <button
            type="button"
            disabled={salvando}
            onClick={salvar}
            className="h-9 w-full rounded-lg bg-primary text-sm font-bold text-primary-foreground transition-opacity hover:opacity-95 disabled:opacity-60"
          >
            {salvando ? "Salvando..." : "Salvar taxas"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

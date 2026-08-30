"use client";

// A fila de entregas em TABELA, e não em cartões.
//
// Eram cartões grandes, um por campanha, cada um com quase quinhentos pixels de
// altura: para ver cinco entregas era preciso rolar a tela inteira duas vezes.
// A tela existe para operar, com a Steam aberta do lado, e operar é varrer uma
// lista, não ler cinco fichas.
//
// Em linha, as cinco cabem numa tela só, e a comparação entre elas, que é o que
// diz o que falta fazer, acontece de relance.
//
// A tabela rola dentro do próprio quadro no celular. É o combinado do projeto:
// conteúdo largo rola na caixa dele, e a página nunca ganha rolagem lateral.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  PackageCheck,
  Undo2,
} from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { semAcento } from "@/lib/busca";
import { formatDateTime } from "@/lib/format";
import { numeroDoTitulo } from "@/lib/titulo";
import { RARITY_TEXT_VAR, WEAR_SHORT } from "@/lib/cs2";
import {
  marcarEntregaAction,
  salvarCustoDaEntregaAction,
} from "@/server/actions/entregas";
import { formatBRL } from "@/lib/format";
import { lerReais } from "@/lib/dinheiro";
import type { Delivery } from "@/server/services/deliveries";

type Filtro = "TODAS" | "PENDENTES" | "ENTREGUES";

const FILTROS: { chave: Filtro; rotulo: string }[] = [
  { chave: "PENDENTES", rotulo: "Pendentes" },
  { chave: "ENTREGUES", rotulo: "Entregues" },
  { chave: "TODAS", rotulo: "Todas" },
];

export function TabelaDeEntregas({ entregas }: { entregas: Delivery[] }) {
  // Abre em PENDENTES: a fila existe para dizer o que falta fazer, e o que já
  // saiu é histórico. Quem quer o histórico troca de aba.
  const [filtro, setFiltro] = useState<Filtro>("PENDENTES");
  const [busca, setBusca] = useState("");

  const pendentes = entregas.filter((e) => e.deliveredAt == null).length;
  // O total é a razão de anotar o custo: uma coluna de valores sem soma é uma
  // coluna de valores.
  const gasto = entregas.reduce((t, e) => t + (e.deliveryCost ?? 0), 0);
  const semCusto = entregas.filter((e) => e.deliveryCost == null).length;
  const semLink = entregas.filter(
    (e) => e.deliveredAt == null && e.winner && !e.winner.steamTradeUrl,
  ).length;

  const visiveis = useMemo(() => {
    const alvo = semAcento(busca);
    return entregas.filter((e) => {
      if (filtro === "PENDENTES" && e.deliveredAt != null) return false;
      if (filtro === "ENTREGUES" && e.deliveredAt == null) return false;
      if (alvo === "") return true;
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
            {pendentes} pendente{pendentes === 1 ? "" : "s"}
          </span>{" "}
          de {entregas.length}. Ganhador, skin e link de troca de cada campanha
          sorteada.
          {gasto > 0 && (
            <>
              {" "}
              <span className="font-semibold text-foreground">
                {formatBRL(gasto)}
              </span>{" "}
              gastos com fornecedor
              {semCusto > 0 && `, ${semCusto} sem custo anotado`}.
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
        <div className="flex rounded-lg border p-0.5">
          {FILTROS.map((f) => (
            <button
              key={f.chave}
              type="button"
              onClick={() => setFiltro(f.chave)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                filtro === f.chave
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.rotulo}
            </button>
          ))}
        </div>
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por skin, ganhador, campanha ou título"
          aria-label="Buscar entrega"
          className="h-9 w-full sm:max-w-sm"
        />
      </div>

      {/* CARTÕES no celular, TABELA no desktop.
          Tabela numa tela de 390px vira rolagem lateral: a pessoa arrasta para
          ler cada coluna e perde de vista a linha em que estava. Empilhado,
          cada entrega é um bloco fechado, com tudo à mão e nada escondido fora
          da tela.
          No desktop a tabela ganha, porque ali a comparação entre linhas é o
          que diz o que falta fazer. */}
      <div className="space-y-3 sm:hidden">
        {visiveis.map((e) => (
          <Cartao key={e.raffleId} entrega={e} />
        ))}
        {visiveis.length === 0 && (
          <p className="rounded-xl border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
            {entregas.length === 0
              ? "Nenhuma campanha sorteada ainda."
              : "Nada aqui com esse filtro."}
          </p>
        )}
      </div>

      <div className="hidden overflow-hidden rounded-xl border bg-card sm:block">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[240px]">Skin</TableHead>
                <TableHead className="min-w-[180px]">Ganhador</TableHead>
                <TableHead className="min-w-[120px]">Link de troca</TableHead>
                <TableHead className="text-right">Título</TableHead>
                <TableHead className="min-w-[130px] text-right">
                  Custo
                </TableHead>
                <TableHead className="min-w-[150px]">Sorteado</TableHead>
                {/* A coluna de ação fica GRUDADA na direita.
                    Sem isso, no celular ela some fora da rolagem horizontal e
                    marcar uma entrega exige arrastar a tabela primeiro, toda
                    vez, para cada linha. Grudada, o resto passa por baixo dela
                    e o botão está sempre onde a mão espera. */}
                <TableHead className="sticky right-0 min-w-[190px] bg-card text-right shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.6)]">
                  Entrega
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

        {visiveis.length === 0 && (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            {entregas.length === 0
              ? "Nenhuma campanha sorteada ainda."
              : "Nada aqui com esse filtro."}
          </p>
        )}
      </div>
    </div>
  );
}

function Linha({ entrega }: { entrega: Delivery }) {
  const premio = entrega.prizes[0] ?? null;
  const entregue = entrega.deliveredAt != null;

  // Sem `opacity` na linha entregue: opacidade em elemento pai cria uma camada
  // de composição própria, e dentro dela `position: sticky` para de grudar, o
  // que quebraria a coluna de ação. Ela recua pela COR do texto, que não tem
  // esse efeito colateral.

  return (
    <TableRow className={cn(entregue && "text-muted-foreground")}>
      <TableCell>
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
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
          <div className="min-w-0">
            {/* O nome com botão de copiar, do mesmo jeito que o link de
                troca: é o texto que vai colado na busca do fornecedor, e
                digitar "'Two Times' McCoy | TACP Cavalry" à mão é onde o erro
                de entrega nasce. */}
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
              <BotaoDeCopia valor={nomeDaSkin(entrega)} rotulo="Copiar nome da skin" />
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
        {entrega.winner ? (
          <>
            <p className="text-sm font-medium">{entrega.winner.name}</p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {entrega.winner.phone ?? "sem telefone"}
            </p>
          </>
        ) : (
          <p className="text-xs text-destructive">
            Título {entrega.ticketNumber} não consta como vendido.
          </p>
        )}
      </TableCell>

      <TableCell>
        {entrega.winner?.steamTradeUrl ? (
          <div className="flex items-center gap-1">
            <BotaoDeCopia valor={entrega.winner.steamTradeUrl} />
            <a
              href={entrega.winner.steamTradeUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Abrir na Steam"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ExternalLink className="h-4 w-4" />
              <span className="sr-only">Abrir na Steam</span>
            </a>
          </div>
        ) : (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            não cadastrado
          </span>
        )}
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

      <TableCell className="sticky right-0 bg-card text-right shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.6)]">
        <AcaoDeEntrega entrega={entrega} />
      </TableCell>
    </TableRow>
  );
}

function Cartao({ entrega }: { entrega: Delivery }) {
  const premio = entrega.prizes[0] ?? null;
  const entregue = entrega.deliveredAt != null;

  return (
    <article
      className={cn(
        "space-y-3 rounded-xl border bg-card p-3",
        entregue && "border-emerald-500/30",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
          {premio?.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={premio.imageUrl}
              alt=""
              className="h-full w-full object-contain p-0.5"
            />
          ) : (
            <PackageCheck className="h-5 w-5 text-muted-foreground" />
          )}
        </span>
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
            <BotaoDeCopia valor={nomeDaSkin(entrega)} rotulo="Copiar nome da skin" />
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
        {entregue && (
          <PackageCheck className="h-4 w-4 shrink-0 text-emerald-500" />
        )}
      </div>

      <div className="rounded-lg border bg-muted/20 p-2.5">
        {entrega.winner ? (
          <>
            <p className="text-sm font-semibold">{entrega.winner.name}</p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {entrega.winner.phone ?? "sem telefone"}
            </p>
            {entrega.winner.steamTradeUrl ? (
              <div className="mt-1.5 flex items-center gap-1">
                <BotaoDeCopia valor={entrega.winner.steamTradeUrl} />
                <a
                  href={entrega.winner.steamTradeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Abrir na Steam
                </a>
              </div>
            ) : (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                Link de troca não cadastrado.
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-destructive">
            Título {entrega.ticketNumber} não consta como vendido nesta
            campanha.
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Custo</span>
        <div className="w-32">
          <CampoDeCusto entrega={entrega} />
        </div>
      </div>

      <div className="flex justify-end border-t pt-2.5">
        <AcaoDeEntrega entrega={entrega} />
      </div>
    </article>
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
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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

/**
 * O custo, editável na própria linha.
 *
 * Salva ao sair do campo e no Enter, e só quando o valor mudou, igual ao campo
 * de escudo dos times: anotar preço é digitar um número e seguir, não abrir um
 * formulário.
 */
function CampoDeCusto({ entrega }: { entrega: Delivery }) {
  const router = useRouter();
  const gravado = entrega.deliveryCost;
  const [texto, setTexto] = useState(
    gravado == null ? "" : gravado.toFixed(2).replace(".", ","),
  );
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    const valor = lerReais(texto);
    if (valor === gravado) return;
    setSalvando(true);
    const r = await salvarCustoDaEntregaAction(entrega.raffleId, valor);
    setSalvando(false);
    if (!r.ok) {
      toast.error(r.error);
      setTexto(gravado == null ? "" : gravado.toFixed(2).replace(".", ","));
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
        if (e.key === "Escape") {
          setTexto(gravado == null ? "" : gravado.toFixed(2).replace(".", ","));
        }
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

function AcaoDeEntrega({ entrega }: { entrega: Delivery }) {
  const router = useRouter();
  const [salvando, setSalvando] = useState(false);
  const [abrindoNota, setAbrindoNota] = useState(false);
  const [observacao, setObservacao] = useState("");

  async function salvar(marcar: boolean) {
    setSalvando(true);
    const r = await marcarEntregaAction({
      raffleId: entrega.raffleId,
      entregue: marcar,
      observacao: marcar ? observacao : null,
    });
    setSalvando(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    setAbrindoNota(false);
    setObservacao("");
    toast.success(marcar ? "Entrega registrada." : "Entrega desmarcada.");
    router.refresh();
  }

  if (entrega.deliveredAt != null) {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          <PackageCheck className="h-3.5 w-3.5" />
          {formatDateTime(entrega.deliveredAt)}
        </span>
        {(entrega.deliveredBy || entrega.deliveryNote) && (
          <span className="max-w-[220px] truncate text-[11px] text-muted-foreground">
            {[entrega.deliveredBy, entrega.deliveryNote]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={salvando}
          onClick={() => salvar(false)}
          className="-mr-2 h-7 text-muted-foreground"
        >
          <Undo2 className="h-3.5 w-3.5" />
          Desmarcar
        </Button>
      </div>
    );
  }

  if (!abrindoNota) {
    return (
      <Button
        type="button"
        size="sm"
        disabled={salvando}
        onClick={() => setAbrindoNota(true)}
      >
        <PackageCheck className="h-4 w-4" />
        Entregue
      </Button>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Input
        autoFocus
        value={observacao}
        onChange={(e) => setObservacao(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") salvar(true);
          if (e.key === "Escape") setAbrindoNota(false);
        }}
        placeholder="Observação"
        maxLength={500}
        className="h-8 w-36"
      />
      <Button type="button" size="sm" disabled={salvando} onClick={() => salvar(true)}>
        <Check className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={salvando}
        onClick={() => setAbrindoNota(false)}
      >
        Cancelar
      </Button>
    </div>
  );
}

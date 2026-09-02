"use client";

// A tela do cronograma.
//
// Três leituras, nesta ordem, porque é a ordem em que o operador pergunta: o
// que está no ar agora, quem entra depois, e o que aconteceu até aqui. O resto
// (adicionar, reordenar, pular) são ações sobre a segunda.
//
// A ordem da fila é gravada NO SOLTAR, e não num botão "salvar ordem". Botão
// separado significa fila que parece reordenada na tela e não está no banco, e
// esse desencontro só aparece quando o sorteio errado sobe às três da manhã. A
// lista da tela anda na hora e a gravação vem atrás; se ela falhar, a ordem
// volta ao que o servidor tem e o aviso diz isso.
//
// Arrastar não é o único caminho. Todo item tem "mover para cima" e "mover
// para baixo" no menu, porque arrastar em tela de celular falha de formas que
// não dá para prever daqui, e a fila precisa ser operável do aparelho que o
// operador tiver na mão.

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  GripVertical,
  MoreVertical,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SkipForward,
  Trash2,
  Zap,
} from "lucide-react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ACOES } from "@/lib/activity-log-actions";
import { moverNaLista } from "@/lib/cronograma";
import { cn } from "@/lib/utils";
import {
  adotarAtivoAction,
  alternarAutomacaoAction,
  ativarAgoraAction,
  definirAtrasoAction,
  devolverParaFilaAction,
  enfileirarAction,
  pularItemAction,
  removerDoCronogramaAction,
  reordenarFilaAction,
  tentarNovamenteAction,
} from "@/server/actions/cronograma";

export interface ItemDoPainel {
  id: string;
  raffleId: string;
  status:
    | "AGUARDANDO"
    | "ATIVO"
    | "CONCLUIDO"
    | "PULADO"
    | "REMOVIDO"
    | "FALHOU";
  posicao: number;
  dia: string | null;
  ativadoEm: string | null;
  ativadoPor: string | null;
  concluidoEm: string | null;
  erro: string | null;
  titulo: string;
  slug: string;
  capa: string | null;
  statusDaCampanha: string;
  totalNumbers: number;
  vendidos: number;
}

interface Candidata {
  id: string;
  title: string;
  capa: string | null;
  totalNumbers: number;
  erros: string[];
  avisos: string[];
}

/** As opções de intervalo. Imediato é o padrão e o caso normal. */
const ATRASOS = [
  { valor: 0, rotulo: "Imediatamente" },
  { valor: 30, rotulo: "30 segundos" },
  { valor: 60, rotulo: "1 minuto" },
  { valor: 300, rotulo: "5 minutos" },
  { valor: 600, rotulo: "10 minutos" },
] as const;

export function CronogramaPainel({
  automacaoAtiva,
  atrasoEmSegundos,
  ultimoErro,
  ultimoErroEm,
  itens,
  candidatas,
  ativasForaDaFila,
  historico,
}: {
  automacaoAtiva: boolean;
  atrasoEmSegundos: number;
  ultimoErro: string | null;
  ultimoErroEm: string | null;
  itens: ItemDoPainel[];
  candidatas: Candidata[];
  ativasForaDaFila: { id: string; title: string }[];
  historico: { id: string; acao: string; quem: string; alvo: string | null; quando: string }[];
}) {
  const [pendente, startTransition] = useTransition();
  const [adotar, setAdotar] = useState("");

  const ativo = itens.find((i) => i.status === "ATIVO") ?? null;
  // O item que travou a fila. Enquanto ele existir, nada entra sozinho: é o
  // desenho, e a tela precisa dizer isso com todas as letras.
  const travado = itens.find((i) => i.status === "FALHOU") ?? null;
  const doServidor = useMemo(
    () => itens.filter((i) => i.status === "AGUARDANDO").map((i) => i.id),
    [itens],
  );
  // A ordem que a tela mostra. Nasce do servidor e anda no soltar; a gravação
  // vem depois e devolve esta lista ao servidor se falhar.
  const [ordem, setOrdem] = useState<string[]>(doServidor);
  const [ordemSalva, setOrdemSalva] = useState<string[]>(doServidor);
  if (
    doServidor.length !== ordemSalva.length ||
    doServidor.some((id, i) => ordemSalva[i] !== id)
  ) {
    // O servidor mudou embaixo da tela (outro admin, ou a própria ativação
    // automática). A lista local acompanha, senão a próxima gravação de ordem
    // enviaria itens que não estão mais aguardando.
    setOrdemSalva(doServidor);
    setOrdem(doServidor);
  }

  const porId = useMemo(
    () => new Map(itens.map((i) => [i.id, i])),
    [itens],
  );
  const fila = ordem.map((id) => porId.get(id)!).filter(Boolean);
  // O que saiu da fila e pode voltar. O item travado NÃO entra aqui: ele tem
  // cartão próprio, com as ações que resolvem o bloqueio.
  const foraDaFila = itens.filter(
    (i) => i.status === "PULADO" || i.status === "REMOVIDO",
  );

  const sensores = useSensors(
    // Oito pixels antes de começar a arrastar: sem isso, um toque para abrir o
    // menu vira arrasto no celular e o item muda de lugar sem ninguém pedir.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function gravarOrdem(nova: string[]) {
    const anterior = ordem;
    setOrdem(nova);
    startTransition(async () => {
      const r = await reordenarFilaAction({ ids: nova });
      if (!r.ok) {
        setOrdem(anterior);
        toast.error(r.error);
        return;
      }
      setOrdemSalva(nova);
      toast.success("Ordem salva");
    });
  }

  function aoSoltar(evento: DragEndEvent) {
    const { active, over } = evento;
    if (!over || active.id === over.id) return;
    const de = ordem.indexOf(String(active.id));
    const para = ordem.indexOf(String(over.id));
    if (de < 0 || para < 0) return;
    gravarOrdem(arrayMove(ordem, de, para));
  }

  function rodar(
    acao: () => Promise<{ ok: boolean; error?: string }>,
    sucesso: string,
  ) {
    startTransition(async () => {
      const r = await acao();
      if (!r.ok) {
        toast.error(r.error ?? "Não deu certo");
        return;
      }
      toast.success(sucesso);
    });
  }

  return (
    <div className="space-y-5">
      {/* AUTOMAÇÃO */}
      <Card className="p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                automacaoAtiva
                  ? "bg-emerald-500/15 text-emerald-500"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {automacaoAtiva ? (
                <Play className="h-4 w-4" />
              ) : (
                <Pause className="h-4 w-4" />
              )}
            </span>
            <div>
              {/* PAUSA E ERRO SÃO COISAS DIFERENTES, e a tela mostra as duas.
                  Pausa é intenção do admin; erro é estado operacional. Fundir
                  os dois faria o sistema mentir sobre o que o admin quis, e o
                  dia seguinte começaria pausado sem ninguém ter pausado. */}
              <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
                Automação {automacaoAtiva ? "ativa" : "pausada"}
                {travado && (
                  <span className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] font-bold tracking-wider text-destructive uppercase">
                    Bloqueada por erro
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {travado
                  ? "A fila está parada numa falha. Resolva o aviso abaixo para ela voltar a andar."
                  : automacaoAtiva
                    ? "O próximo da fila entra sozinho quando o sorteio atual terminar."
                    : "O sorteio no ar continua normal. Só a troca automática está parada."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={automacaoAtiva}
              disabled={pendente}
              aria-label="Automação do cronograma"
              onCheckedChange={(ativa) => {
                // Retomar com a fila cheia e ninguém no ar deixaria o site sem
                // campanha até alguém agir. Pergunta antes, e a mesma ação
                // ativa o próximo quando a resposta é sim.
                const precisaAtivar =
                  ativa && !ativo && fila.length > 0
                    ? window.confirm(
                        "Não há sorteio ativo. Ativar o próximo da fila agora?",
                      )
                    : false;
                startTransition(async () => {
                  const r = await alternarAutomacaoAction({
                    ativa,
                    ativarProximoAgora: precisaAtivar,
                  });
                  if (!r.ok) {
                    toast.error(r.error);
                    return;
                  }
                  toast.success(
                    r.data?.ativou
                      ? `Automação retomada. ${r.data.ativou} está no ar.`
                      : ativa
                        ? "Automação retomada"
                        : "Automação pausada",
                  );
                });
              }}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-4">
          <span className="text-xs font-semibold text-muted-foreground">
            Ativação do próximo
          </span>
          <Select
            value={String(atrasoEmSegundos)}
            onValueChange={(v) =>
              rodar(
                () => definirAtrasoAction({ segundos: Number(v) }),
                "Intervalo salvo",
              )
            }
          >
            <SelectTrigger className="w-48">
              <SelectValue
                labels={Object.fromEntries(
                  ATRASOS.map((a) => [String(a.valor), a.rotulo]),
                )}
              />
            </SelectTrigger>
            <SelectContent>
              {ATRASOS.map((a) => (
                <SelectItem key={a.valor} value={String(a.valor)}>
                  {a.rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            A contagem começa quando o sorteio anterior termina, não quando as
            cotas esgotam.
          </span>
        </div>
      </Card>

      {/* A FALHA QUE TRAVOU A FILA.

          Três saídas, e todas humanas: consertar e tentar de novo, desistir
          desta campanha e liberar a próxima, ou abrir para ver o que está
          errado. O sistema não escolhe nenhuma sozinho. */}
      {(travado || ultimoErro) && (
        <Card className="border-destructive/40 bg-destructive/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-destructive">
                {travado
                  ? `Falha ao ativar ${travado.titulo}`
                  : "Erro na automação"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                A fila parou aqui e NÃO pulou para a próxima campanha
                {ultimoErroEm
                  ? `. Última tentativa em ${new Date(ultimoErroEm).toLocaleString("pt-BR")}`
                  : ""}
                . Nada foi publicado pela metade.
              </p>
              <p className="mt-1 font-mono text-[11px] break-all text-muted-foreground">
                {travado?.erro ?? ultimoErro}
              </p>

              {travado && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={pendente}
                    onClick={() =>
                      rodar(
                        () => tentarNovamenteAction({ itemId: travado.id }),
                        "Sorteio ativado",
                      )
                    }
                  >
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    Tentar novamente
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pendente}
                    onClick={() =>
                      rodar(
                        () => pularItemAction({ itemId: travado.id }),
                        "Pulado. A fila voltou a andar.",
                      )
                    }
                  >
                    <SkipForward className="mr-1.5 h-3.5 w-3.5" />
                    Pular
                  </Button>
                  <Link
                    href={`/admin/sorteios/${travado.raffleId}/editar`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    Editar
                  </Link>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ATIVO AGORA */}
      <section className="space-y-2">
        <h2 className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
          Ativo agora
        </h2>
        {ativo ? (
          <Card className="p-4">
            <div className="flex items-center gap-3.5">
              <Capa url={ativo.capa} alt={ativo.titulo} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-bold">{ativo.titulo}</p>
                  <Selo tom="verde">Ativo</Selo>
                </div>
                <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                  {ativo.vendidos.toLocaleString("pt-BR")} /{" "}
                  {ativo.totalNumbers.toLocaleString("pt-BR")} números ·{" "}
                  {porcentagem(ativo.vendidos, ativo.totalNumbers)}%
                  {ativo.ativadoPor === "AUTOMATICO" && " · ativado pela fila"}
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{
                      width: `${porcentagem(ativo.vendidos, ativo.totalNumbers)}%`,
                    }}
                  />
                </div>
              </div>
              <Link
                href={`/admin/sorteios/${ativo.raffleId}/editar`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Abrir
              </Link>
            </div>
          </Card>
        ) : (
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">
              Nenhuma campanha no ar por esta fila.
            </p>
            {ativasForaDaFila.length > 0 && (
              <div className="mt-3 space-y-2 border-t pt-3">
                <p className="text-xs text-muted-foreground">
                  Uma campanha já no ar pode ser adotada pela fila, e aí o
                  cronograma continua a partir dela. É o caminho do primeiro
                  dia, quando o site já está rodando sem cronograma nenhum.
                </p>
                {/* Seletor, e não uma lista de botões: o site publica várias
                    campanhas ao mesmo tempo, e a lista inteira empurrava a
                    fila (que é o assunto da tela) para baixo da dobra. */}
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={adotar} onValueChange={(v) => setAdotar(v ?? "")}>
                    <SelectTrigger className="w-full sm:w-72">
                      <SelectValue
                        placeholder="Escolha a campanha no ar"
                        labels={Object.fromEntries(
                          ativasForaDaFila.map((c) => [c.id, c.title]),
                        )}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {ativasForaDaFila.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pendente || !adotar}
                    onClick={() =>
                      rodar(
                        () => adotarAtivoAction({ raffleId: adotar }),
                        "Campanha adotada pela fila",
                      )
                    }
                  >
                    Adotar
                  </Button>
                </div>
              </div>
            )}

            {fila.length > 0 && (
              <Button
                size="sm"
                className="mt-3"
                disabled={pendente}
                onClick={() =>
                  rodar(() => ativarAgoraAction({}), "Sorteio ativado")
                }
              >
                <Zap className="mr-1.5 h-3.5 w-3.5" />
                Ativar o próximo agora
              </Button>
            )}
          </Card>
        )}
      </section>

      {/* A FILA */}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
            Próximos da fila
          </h2>
          <AdicionarNaFila
            candidatas={candidatas}
            pendente={pendente}
            onAdicionar={(raffleId, dia) =>
              rodar(
                () => enfileirarAction({ raffleId, ...(dia ? { dia } : {}) }),
                "Adicionado à fila",
              )
            }
          />
        </div>

        {fila.length === 0 ? (
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">
              A fila está vazia. Prepare os sorteios em Sorteios, deixe-os como
              rascunho e adicione aqui.
            </p>
          </Card>
        ) : (
          <DndContext
            sensors={sensores}
            collisionDetection={closestCenter}
            onDragEnd={aoSoltar}
          >
            <SortableContext
              items={ordem}
              strategy={verticalListSortingStrategy}
            >
              <ul className="space-y-2">
                {fila.map((item, i) => (
                  <LinhaDaFila
                    key={item.id}
                    item={item}
                    posicao={i + 1}
                    proximo={i === 0}
                    diaAnterior={i > 0 ? fila[i - 1]!.dia : undefined}
                    pendente={pendente}
                    onMover={(direcao) =>
                      gravarOrdem(moverNaLista(ordem, item.id, direcao))
                    }
                    onPular={() =>
                      rodar(
                        () => pularItemAction({ itemId: item.id }),
                        "Pulado neste ciclo",
                      )
                    }
                    onRemover={() =>
                      rodar(
                        () => removerDoCronogramaAction({ itemId: item.id }),
                        "Tirado da fila. A campanha voltou a ser rascunho.",
                      )
                    }
                    onAtivar={() =>
                      rodar(
                        () => ativarAgoraAction({ itemId: item.id }),
                        "Sorteio ativado",
                      )
                    }
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </section>

      {/* FORA DA FILA */}
      {foraDaFila.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
            Fora da fila
          </h2>
          <Card className="divide-y p-0">
            {foraDaFila.map((item) => (
              <div key={item.id} className="flex items-center gap-3 p-3">
                <Capa url={item.capa} alt={item.titulo} pequena />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {item.titulo}
                </span>
                <Selo tom="cinza">
                  {item.status === "PULADO" ? "Pulado" : "Removido"}
                </Selo>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pendente}
                  onClick={() =>
                    rodar(
                      () => devolverParaFilaAction({ itemId: item.id }),
                      "De volta ao fim da fila",
                    )
                  }
                >
                  Voltar para a fila
                </Button>
              </div>
            ))}
          </Card>
        </section>
      )}

      {/* HISTÓRICO */}
      <section className="space-y-2">
        <h2 className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
          Histórico
        </h2>
        <Card className="p-4">
          {historico.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nada aconteceu ainda.
            </p>
          ) : (
            <ol className="space-y-2.5">
              {historico.map((h) => (
                <li key={h.id} className="flex gap-3 text-xs">
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {new Date(h.quando).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{h.quem}</span>{" "}
                    {ACOES[h.acao as keyof typeof ACOES] ?? h.acao}
                    {h.alvo ? ` ${h.alvo}` : ""}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </section>
    </div>
  );
}

function LinhaDaFila({
  item,
  posicao,
  proximo,
  diaAnterior,
  pendente,
  onMover,
  onPular,
  onRemover,
  onAtivar,
}: {
  item: ItemDoPainel;
  posicao: number;
  proximo: boolean;
  diaAnterior: string | null | undefined;
  pendente: boolean;
  onMover: (direcao: "cima" | "baixo") => void;
  onPular: () => void;
  onRemover: () => void;
  onAtivar: () => void;
}) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  // O cabeçalho do dia só aparece quando o dia MUDA. Repetido em toda linha,
  // ele viraria ruído; ausente, os dias se misturariam numa lista só.
  const mostrarDia = item.dia && item.dia !== diaAnterior;

  return (
    <>
      {mostrarDia && (
        <li className="pt-2 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
          {formatarDia(item.dia!)}
        </li>
      )}
      <li
        ref={setNodeRef}
        style={{ transform: CSS.Transform.toString(transform), transition }}
        className={cn(
          "flex items-center gap-3 rounded-xl border bg-card p-3",
          proximo && "border-primary/40",
          isDragging && "z-10 opacity-80 shadow-lg",
        )}
      >
        <button
          type="button"
          className="-ml-1 cursor-grab touch-none rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing"
          aria-label={`Arrastar ${item.titulo}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <span className="w-6 shrink-0 text-center text-xs font-bold tabular-nums text-muted-foreground">
          {posicao}
        </span>

        <Capa url={item.capa} alt={item.titulo} pequena />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{item.titulo}</p>
          <p className="text-[11px] tabular-nums text-muted-foreground">
            {item.totalNumbers.toLocaleString("pt-BR")} números
          </p>
        </div>

        <Selo tom={proximo ? "laranja" : "cinza"}>
          {proximo ? "Próximo" : "Aguardando"}
        </Selo>

        <DropdownMenu>
          <DropdownMenuTrigger
            className={buttonVariants({ variant: "ghost", size: "icon" })}
            aria-label={`Ações de ${item.titulo}`}
          >
            <MoreVertical className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {/* onClick, e não onSelect: este menu é o do Base UI, que ativa
                o item por clique. `onSelect` compila (div tem um evento nativo
                com esse nome) e nunca dispara, então o menu abria, fechava e
                não fazia nada. Navegação por handler pelo mesmo motivo: o Base
                UI compõe por `render`, não por `asChild`. */}
            <DropdownMenuItem
              onClick={() => router.push(`/admin/sorteios/${item.raffleId}/editar`)}
            >
              Editar sorteio
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => window.open(`/${item.slug}`, "_blank", "noopener")}
            >
              <ExternalLink className="mr-2 h-3.5 w-3.5" />
              Pré-visualizar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={pendente} onClick={() => onMover("cima")}>
              <ChevronUp className="mr-2 h-3.5 w-3.5" />
              Mover para cima
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={pendente}
              onClick={() => onMover("baixo")}
            >
              <ChevronDown className="mr-2 h-3.5 w-3.5" />
              Mover para baixo
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={pendente} onClick={onAtivar}>
              <Zap className="mr-2 h-3.5 w-3.5" />
              Ativar agora
            </DropdownMenuItem>
            <DropdownMenuItem disabled={pendente} onClick={onPular}>
              <SkipForward className="mr-2 h-3.5 w-3.5" />
              Pular neste ciclo
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={pendente}
              onClick={onRemover}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Remover do cronograma
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </li>
    </>
  );
}

function AdicionarNaFila({
  candidatas,
  pendente,
  onAdicionar,
}: {
  candidatas: Candidata[];
  pendente: boolean;
  onAdicionar: (raffleId: string, dia: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [dia, setDia] = useState(() => new Date().toISOString().slice(0, 10));

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger className={buttonVariants({ size: "sm" })}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Adicionar
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adicionar à fila</DialogTitle>
          <DialogDescription>
            Só entram rascunhos prontos. O que falta em cada um aparece na
            linha, e nenhum deles fica visível para o público enquanto espera.
          </DialogDescription>
        </DialogHeader>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5" />
          Dia do cronograma
          <input
            type="date"
            value={dia}
            onChange={(e) => setDia(e.target.value)}
            className="rounded-md border bg-background px-2 py-1 text-xs text-foreground"
          />
        </label>

        <div className="space-y-2">
          {candidatas.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum rascunho disponível.
            </p>
          )}
          {candidatas.map((c) => {
            const pronta = c.erros.length === 0;
            return (
              <div
                key={c.id}
                className="flex items-start gap-3 rounded-lg border p-2.5"
              >
                <Capa url={c.capa} alt={c.title} pequena />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{c.title}</p>
                  {pronta ? (
                    <p className="text-[11px] text-muted-foreground">
                      {c.totalNumbers.toLocaleString("pt-BR")} números
                      {c.avisos.length > 0 && ` · ${c.avisos.join(" ")}`}
                    </p>
                  ) : (
                    <p className="text-[11px] text-destructive">
                      {c.erros.join(" ")}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant={pronta ? "default" : "outline"}
                  disabled={!pronta || pendente}
                  onClick={() => {
                    onAdicionar(c.id, dia);
                    setAberto(false);
                  }}
                >
                  {pronta ? (
                    <>
                      <Check className="mr-1.5 h-3.5 w-3.5" />
                      Adicionar
                    </>
                  ) : (
                    "Incompleto"
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Capa({
  url,
  alt,
  pequena,
}: {
  url: string | null;
  alt: string;
  pequena?: boolean;
}) {
  const lado = pequena ? "h-10 w-10" : "h-14 w-14";
  if (!url) {
    return (
      <div
        aria-hidden
        className={cn("shrink-0 rounded-lg border bg-muted", lado)}
      />
    );
  }
  return (
    <div className={cn("relative shrink-0 overflow-hidden rounded-lg", lado)}>
      <Image src={url} alt={alt} fill sizes="56px" className="object-cover" />
    </div>
  );
}

function Selo({
  tom,
  children,
}: {
  tom: "verde" | "laranja" | "cinza";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase",
        tom === "verde" &&
          "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        tom === "laranja" && "border-primary/40 bg-primary/10 text-primary",
        tom === "cinza" && "border-border bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function porcentagem(vendidos: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((vendidos / total) * 100));
}

function formatarDia(iso: string): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const data = new Date(Date.UTC(ano!, mes! - 1, dia!));
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(data);
}

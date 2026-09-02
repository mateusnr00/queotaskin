"use client";

// PARA ONDE O SORTEIO VAI DEPOIS DE SALVO.
//
// A tela existe para matar cinco passos: criar o sorteio, sair da tela, abrir o
// cronograma, procurar o rascunho na lista e adicionar. Quem prepara o dia
// inteiro faz isso oito vezes por manhã, e é trabalho que o formulário podia
// ter resolvido sozinho.
//
// TRÊS ESCOLHAS, E O PADRÃO É O DE SEMPRE
//
// Rascunho continua sendo o padrão, e sem escolha explícita nada muda de
// comportamento. As outras duas passam pelos mesmos caminhos que já existiam:
// publicar usa o serviço de status, e a fila usa o serviço do cronograma, com
// a validação e a trava dele. Esta tela não escreve no banco.
//
// O DIA É RÓTULO
//
// Ele agrupa a fila no painel e nunca decide execução: fila montada para hoje
// que atravessa a meia-noite continua andando amanhã, na mesma ordem.

import { CalendarClock, FileText, ListOrdered, Rocket } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SecaoDoFormulario } from "@/components/admin/secao-de-formulario";

export type TipoDeDestino = "RASCUNHO" | "PUBLICAR" | "CRONOGRAMA";

export interface DestinoEscolhido {
  tipo: TipoDeDestino;
  dia: string;
  posicao: "inicio" | "fim";
}

/** O dia de hoje em "AAAA-MM-DD", no fuso de quem opera o painel. */
export function hojeNoBrasil(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

const OPCOES: {
  tipo: TipoDeDestino;
  rotulo: string;
  descricao: string;
  icone: typeof FileText;
}[] = [
  {
    tipo: "RASCUNHO",
    rotulo: "Salvar como rascunho",
    descricao: "Fica guardado no painel. Ninguém vê.",
    icone: FileText,
  },
  {
    tipo: "PUBLICAR",
    rotulo: "Publicar agora",
    descricao: "Vai para o ar na hora, como qualquer campanha.",
    icone: Rocket,
  },
  {
    tipo: "CRONOGRAMA",
    rotulo: "Adicionar ao cronograma",
    descricao: "Entra na fila e sobe quando o sorteio atual terminar.",
    icone: CalendarClock,
  },
];

export function DestinoDoSorteio({
  valor,
  onChange,
  desabilitado,
}: {
  valor: DestinoEscolhido;
  onChange: (novo: DestinoEscolhido) => void;
  desabilitado?: boolean;
}) {
  return (
    <SecaoDoFormulario
      titulo="Depois de salvar"
      descricao="O que acontece com este sorteio quando você salvar. O padrão é guardar como rascunho."
      icone={<CalendarClock aria-hidden className="h-4 w-4" />}
    >
      <div className="space-y-2">
        {OPCOES.map((opcao) => {
          const escolhida = valor.tipo === opcao.tipo;
          const Icone = opcao.icone;
          return (
            <label
              key={opcao.tipo}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors",
                escolhida
                  ? "border-primary/50 bg-primary/[0.06]"
                  : "bg-muted/30 hover:border-primary/30 hover:bg-muted/60",
                desabilitado && "pointer-events-none opacity-60",
              )}
            >
              <input
                type="radio"
                name="destino-do-sorteio"
                className="mt-1 accent-[var(--primary)]"
                checked={escolhida}
                disabled={desabilitado}
                onChange={() => onChange({ ...valor, tipo: opcao.tipo })}
              />
              <Icone
                aria-hidden
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0",
                  escolhida ? "text-primary" : "text-muted-foreground",
                )}
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">
                  {opcao.rotulo}
                </span>
                <span className="block text-[11px] leading-relaxed text-muted-foreground">
                  {opcao.descricao}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {/* Os detalhes só aparecem para quem escolheu a fila: dois campos
          permanentes na tela, apagados nove de cada dez vezes, seriam ruído
          num formulário que já é longo. */}
      {valor.tipo === "CRONOGRAMA" && (
        <div className="grid gap-3 rounded-xl border bg-muted/20 p-3.5 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold">
              <CalendarClock aria-hidden className="h-3.5 w-3.5" />
              Dia do cronograma
            </span>
            <input
              type="date"
              value={valor.dia}
              disabled={desabilitado}
              onChange={(e) => onChange({ ...valor, dia: e.target.value })}
              className="h-9 w-full rounded-md border bg-background px-2.5 text-sm"
            />
            <span className="block text-[11px] leading-relaxed text-muted-foreground">
              Só organiza a lista do painel. A fila não para na virada do dia.
            </span>
          </label>

          <label className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold">
              <ListOrdered aria-hidden className="h-3.5 w-3.5" />
              Posição
            </span>
            <Select
              value={valor.posicao}
              onValueChange={(v) =>
                onChange({ ...valor, posicao: v === "inicio" ? "inicio" : "fim" })
              }
            >
              <SelectTrigger className="h-9 w-full">
                <SelectValue
                  labels={{ fim: "Final da fila", inicio: "Primeiro da fila" }}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fim">Final da fila</SelectItem>
                <SelectItem value="inicio">Primeiro da fila</SelectItem>
              </SelectContent>
            </Select>
            <span className="block text-[11px] leading-relaxed text-muted-foreground">
              Dá para reordenar a qualquer momento no cronograma.
            </span>
          </label>
        </div>
      )}
    </SecaoDoFormulario>
  );
}

/**
 * O bloco de quem JÁ ESTÁ na fila.
 *
 * No lugar das três escolhas, porque para uma campanha enfileirada elas não
 * fazem sentido: publicar agora furaria a fila que o admin montou, e "adicionar
 * ao cronograma" ofereceria de novo o que já está feito. O que ela precisa
 * dizer é onde está e como chegar lá.
 */
export function NoCronograma({
  dia,
  posicao,
  situacao,
}: {
  dia: string | null;
  posicao: number | null;
  situacao: string;
}) {
  return (
    <SecaoDoFormulario
      titulo="No cronograma"
      descricao="Esta campanha está na fila. Editar o conteúdo não tira ela de lá."
      icone={<CalendarClock aria-hidden className="h-4 w-4" />}
    >
      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-muted/30 px-3.5 py-2.5">
          <dt className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
            Situação
          </dt>
          <dd className="text-sm font-semibold">{situacao}</dd>
        </div>
        <div className="rounded-xl border bg-muted/30 px-3.5 py-2.5">
          <dt className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
            Dia
          </dt>
          <dd className="text-sm font-semibold tabular-nums">
            {dia ? formatarDia(dia) : "Sem dia"}
          </dd>
        </div>
        <div className="rounded-xl border bg-muted/30 px-3.5 py-2.5">
          <dt className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
            Posição
          </dt>
          <dd className="text-sm font-semibold tabular-nums">
            {posicao == null ? "sem lugar" : `#${posicao + 1}`}
          </dd>
        </div>
      </dl>
    </SecaoDoFormulario>
  );
}

function formatarDia(iso: string): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  if (!ano || !mes || !dia) return iso;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(ano, mes - 1, dia)));
}

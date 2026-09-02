// O cronograma no painel inicial.
//
// Um cartão pequeno, e a informação é sempre a mesma pergunta: o site está
// trocando de sorteio sozinho, e qual é o próximo. Quem abre o painel de manhã
// precisa saber isso antes de qualquer número de venda, porque é o que decide
// se o dia vai exigir trabalho.
//
// Não tem botão de ação nenhum além de abrir a fila: decisão de fila se toma
// olhando a fila inteira, e um "ativar próximo" aqui, sem contexto, é o tipo
// de clique que se dá por engano.

import Link from "next/link";
import { CalendarClock, Pause, Play } from "lucide-react";

import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CartaoDoCronograma({
  automacaoAtiva,
  ativo,
  proximo,
  aguardando,
  comErro,
}: {
  automacaoAtiva: boolean;
  ativo: string | null;
  proximo: string | null;
  aguardando: number;
  comErro: boolean;
}) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-semibold">
          <CalendarClock className="h-4 w-4 text-primary" />
          Cronograma
        </h3>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase",
            comErro
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : automacaoAtiva
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-border bg-muted text-muted-foreground",
          )}
        >
          {automacaoAtiva ? (
            <Play className="h-3 w-3" />
          ) : (
            <Pause className="h-3 w-3" />
          )}
          {comErro ? "Erro" : automacaoAtiva ? "Automação ativa" : "Pausada"}
        </span>
      </div>

      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
            Ativo
          </dt>
          <dd className="truncate font-semibold">
            {ativo ?? <span className="text-muted-foreground">Nenhum</span>}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
            Próximo
          </dt>
          <dd className="truncate font-semibold">
            {proximo ?? (
              <span className="text-muted-foreground">Fila vazia</span>
            )}
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-xs text-muted-foreground">
        {aguardando === 0
          ? "Nenhum sorteio aguardando."
          : `${aguardando} sorteio${aguardando === 1 ? "" : "s"} aguardando.`}
      </p>

      <Link
        href="/admin/sorteios/cronograma"
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "mt-3 w-full",
        )}
      >
        Abrir cronograma
      </Link>
    </Card>
  );
}

// A descrição do sorteio, lida como ficha quando dá para ler.
//
// O bloco antigo era o campo do admin despejado na página: um parágrafo
// corrido onde "PRÊMIO:" e "VALOR STEAM:" tinham o mesmo peso visual do
// "boa sorte". Quem abre a página quer duas informações antes de qualquer
// texto, o que é e quanto vale, e elas estavam no meio da massa.
//
// Agora prêmio e valor saem como ficha, lado a lado no desktop e empilhados
// no telefone, e o resto continua sendo texto. É a MESMA descrição gravada:
// nada é remontado aqui, nada é buscado de novo, e campanha antiga mostra o
// valor com que foi publicada.
//
// TEXTO QUE NÃO SAIU DO TEMPLATE CONTINUA PARÁGRAFO.
//
// `lerFichaDaDescricao` devolve nulo para qualquer coisa que não comece com
// os rótulos do gerador, e aí este componente cai no parágrafo de sempre.
// Descrição escrita à mão não vira ficha inventada.

import { lerFichaDaDescricao } from "@/lib/descricao-padrao";

function Ficha({ description }: { description: string }) {
  const ficha = lerFichaDaDescricao(description);

  if (!ficha) {
    return (
      <p className="whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
    );
  }

  return (
    <>
      {/* Uma faixa só: no desktop o valor vai para a direita, no telefone
          ele desce. Sem caixa em volta, porque isto já está dentro de uma. */}
      <dl className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
        <div className="min-w-0">
          <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Prêmio
          </dt>
          <dd className="mt-1 text-sm leading-snug font-semibold break-words">
            {ficha.premio}
          </dd>
        </div>
        {ficha.valor && (
          <div className="shrink-0 sm:text-right">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Valor Steam
            </dt>
            <dd className="mt-1 text-sm leading-snug font-semibold tabular-nums">
              {ficha.valor}
            </dd>
          </div>
        )}
      </dl>

      {ficha.corpo && (
        <p className="border-t border-border/40 px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {ficha.corpo}
        </p>
      )}
    </>
  );
}

export function DetalhesDoSorteio({
  description,
  aberto,
}: {
  description: string;
  /** Modo EXPANDIDO: o texto já vem aberto, sem o clique do "ver mais". */
  aberto: boolean;
}) {
  if (aberto) {
    return (
      <div className="overflow-hidden rounded-xl border bg-card">
        <h2 className="px-4 py-3 text-sm font-semibold">Detalhes do sorteio</h2>
        <div className="border-t">
          <Ficha description={description} />
        </div>
      </div>
    );
  }

  return (
    <details className="group overflow-hidden rounded-xl border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-muted/50">
        <span>Detalhes do sorteio</span>
        <span className="text-muted-foreground transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="border-t">
        <Ficha description={description} />
      </div>
    </details>
  );
}

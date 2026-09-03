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

import { IconeDoWhatsapp } from "@/components/icones/whatsapp";
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
        {/* A COLUNA DO PREÇO É DA FICHA, NÃO DO TEXTO.
            Ela aparece sempre que o texto tem a forma da ficha, com preço ou
            sem. Antes ela sumia quando o valor faltava, e o jeito de
            trazê-la de volta era digitar "PREÇO STEAM" à mão no painel: o
            layout dependia de alguém escrever o rótulo certo.

            Sem valor, um traço. Não "carregando", não "indisponível", não
            "erro": numa campanha publicada essas palavras contam sobre a
            nossa consulta, e quem lê veio saber da skin. */}
        <div className="shrink-0 sm:text-right">
          <dt className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Preço Steam
          </dt>
          <dd className="mt-1 text-sm leading-snug font-semibold tabular-nums">
            {ficha.valor ?? (
              <span aria-label="sem preço" className="text-muted-foreground">
                -
              </span>
            )}
          </dd>
        </div>
      </dl>

      {ficha.corpo && (
        <p className="border-t border-border/40 px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {ficha.corpo}
        </p>
      )}
    </>
  );
}

/**
 * O convite para o grupo, no pé da seção.
 *
 * Fica fora do campo de descrição de propósito: colar o link dentro do texto
 * salvaria um botão em cada campanha, e trocar o convite, que expira, viraria
 * editar sorteio por sorteio. O texto continua sendo texto; o convite é
 * configuração, e sai de uma vez em todas as campanhas.
 *
 * Verde do WhatsApp em superfície, e não em bloco cheio: a ação principal
 * desta página é comprar cota, e ela é o botão laranja logo acima. Um segundo
 * botão sólido do mesmo tamanho disputaria com ela.
 */
function ConviteDoGrupo({ link, nomeDoSite }: { link: string; nomeDoSite: string }) {
  return (
    <div className="border-t border-border/40 px-4 py-3">
      <p className="text-sm leading-snug font-semibold">
        Entre no grupo da {nomeDoSite} no WhatsApp
      </p>
      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
        Receba novidades, avisos de sorteios e acompanhe a comunidade.
      </p>
      <a
        href={link}
        target="_blank"
        // `noopener` fecha o acesso da aba nova ao `window.opener` desta;
        // `noreferrer` evita mandar o endereço do sorteio junto.
        rel="noopener noreferrer"
        className="botao-de-whatsapp botao-de-whatsapp--faixa mt-2.5 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-700 sm:w-auto dark:text-emerald-400"
      >
        <IconeDoWhatsapp className="h-4 w-4" />
        Entrar no grupo do WhatsApp
      </a>
    </div>
  );
}

export function DetalhesDoSorteio({
  description,
  aberto,
  linkDoGrupo,
  nomeDoSite,
}: {
  description: string;
  /** Modo EXPANDIDO: o texto já vem aberto, sem o clique do "ver mais". */
  aberto: boolean;
  /** Convite já validado. Nulo, e o convite não aparece. */
  linkDoGrupo?: string | null;
  nomeDoSite: string;
}) {
  const convite = linkDoGrupo ? (
    <ConviteDoGrupo link={linkDoGrupo} nomeDoSite={nomeDoSite} />
  ) : null;

  if (aberto) {
    return (
      <div className="overflow-hidden rounded-xl border bg-card">
        <h2 className="px-4 py-3 text-sm font-semibold">Detalhes do sorteio</h2>
        <div className="border-t">
          <Ficha description={description} />
          {convite}
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
        {convite}
      </div>
    </details>
  );
}

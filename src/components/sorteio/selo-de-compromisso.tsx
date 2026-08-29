// A chave do sorteio, travada antes da primeira venda.
//
// POR QUE ELE ENCOLHEU
//
// Este bloco nasceu aberto e logo abaixo do título, com a explicação inteira e
// o hash de 64 caracteres à mostra. Ocupava quase uma tela de celular entre o
// nome da campanha e o preço, que é o caminho que a pessoa veio fazer. Quem
// chega para comprar tinha que rolar por uma prova criptográfica antes de
// chegar ao valor.
//
// Agora ele é uma linha fechada no fim da página, e abre no clique.
//
// O QUE NÃO MUDOU, E É O QUE IMPORTA
//
// O compromisso continua público ANTES do sorteio. O valor dele está na
// ordem, não no tamanho na tela: o hash existe enquanto as cotas são vendidas,
// então quem opera o site não pode escolher a chave depois de ver quem
// ganharia. Fechado por padrão não é escondido, é uma linha visível que abre
// no clique, sem depender de rede nem de outra página.
//
// Publicar isso só no fim, aí sim, seria o mesmo que não publicar.
//
// Componente de servidor: `details` abre e fecha sem JavaScript nenhum.

import Link from "next/link";
import { ShieldCheck } from "lucide-react";

function dataCurta(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

export function SeloDeCompromisso({
  hash,
  desde,
  publicId,
}: {
  hash: string;
  desde: string;
  /** Quando o sorteio já existe, a conferência ganha um link aqui dentro. */
  publicId: string | null;
}) {
  return (
    <details className="group overflow-hidden rounded-xl border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-4 py-3 hover:bg-muted/50">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/20">
          <ShieldCheck aria-hidden className="h-3.5 w-3.5" />
        </span>
        {/* Duas linhas, e não uma frase corrida: no celular ela quebrava no
            meio, em "chave travada em / 29/08/2026". A data no resumo é o que
            faz a linha fechada já valer alguma coisa, porque mesmo sem abrir
            ela diz que a chave é anterior à venda, que é a afirmação inteira. */}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">
            Sorteio verificável
          </span>
          <span className="block text-xs text-muted-foreground">
            chave travada em {dataCurta(desde)}
          </span>
        </span>
        <span
          aria-hidden
          className="text-muted-foreground transition-transform group-open:rotate-180"
        >
          ▾
        </span>
      </summary>

      <div className="space-y-2.5 border-t px-4 py-3">
        <p className="text-sm leading-relaxed text-muted-foreground">
          A chave deste sorteio foi travada em {dataCurta(desde)}, antes da
          primeira venda. Ela não pode ser trocada depois, e no fim é publicada
          para qualquer um refazer a conta e chegar ao mesmo ganhador.
        </p>

        <div>
          <p className="text-[10px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
            Impressão digital da chave
          </p>
          {/* O hash inteiro, e não um pedaço: um resumo cortado não serve para
              comparar com nada, e comparar é a única coisa que ele existe para
              permitir. */}
          <p className="mt-1 font-mono text-[10px] leading-relaxed break-all text-muted-foreground/70">
            {hash}
          </p>
        </div>

        {publicId && (
          <Link
            href={`/sorteio/${publicId}/verificar`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-600 transition-colors hover:bg-emerald-500/20 dark:text-emerald-400"
          >
            <ShieldCheck aria-hidden className="h-3.5 w-3.5" />
            Conferir o resultado
          </Link>
        )}
      </div>
    </details>
  );
}

import Link from "next/link";

import { RaffleCover } from "@/components/public/raffle-cover";
import type { CampanhaEmDestaque } from "@/components/auth/vitrine-de-skins";
import {
  PROPORCAO_DA_SKIN,
  RARITY_COLOR,
  RARITY_LABEL,
  WEAR_LABEL,
} from "@/lib/cs2";
import { formatBRL } from "@/lib/format";

/**
 * A campanha em disputa, dentro do cartão de criar conta.
 *
 * Responde à pergunta que a tela levanta: por que eu daria meu CPF agora.
 * Sem ela o formulário pede documento e telefone sem nada do outro lado da
 * balança.
 *
 * A segunda linha é raridade e desgaste, dado real da skin, e não uma frase
 * de efeito: nenhum campo do cadastro guarda chamada de venda, e inventar
 * uma aqui viraria a mesma promessa em toda campanha, inclusive nas que não
 * a sustentam.
 */
export function FichaDaCampanha({
  campanha,
}: {
  campanha: CampanhaEmDestaque;
}) {
  const cor = campanha.raridade ? RARITY_COLOR[campanha.raridade] : null;
  const ficha = [
    campanha.raridade ? RARITY_LABEL[campanha.raridade] : null,
    campanha.desgaste ? WEAR_LABEL[campanha.desgaste] : null,
  ].filter(Boolean);

  return (
    <Link
      href={`/s/${campanha.slug}`}
      className="flex items-center gap-3 rounded-2xl border bg-muted/30 p-3 transition-colors hover:border-foreground/25 hover:bg-muted/50"
      style={cor ? { borderColor: `${cor}40` } : undefined}
    >
      <div className="relative shrink-0">
        {cor && (
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-2 opacity-45 blur-xl"
            style={{
              background: `radial-gradient(circle, ${cor}, transparent 70%)`,
            }}
          />
        )}
        <RaffleCover
          url={campanha.capa}
          title={campanha.titulo}
          skinName={campanha.skin}
          rarity={campanha.raridade}
          variant="thumb"
          ajuste="conter"
          sizes="96px"
          style={{ aspectRatio: PROPORCAO_DA_SKIN }}
          className="relative w-24 rounded-xl"
        />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold leading-tight">
          {campanha.skin ?? campanha.titulo}
        </p>
        {ficha.length > 0 && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {ficha.join(" · ")}
          </p>
        )}
        <p className="mt-1 text-sm font-bold tabular-nums text-primary">
          {formatBRL(campanha.preco)}{" "}
          <span className="font-medium text-muted-foreground">/ número</span>
        </p>
      </div>
    </Link>
  );
}

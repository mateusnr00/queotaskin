"use client";

// O campo de prêmio dos Títulos Premiados, com o catálogo de skins atrás.
//
// Continua sendo um campo de texto, e isso é proposital: título premiado nem
// sempre é skin, e trocar por um seletor obrigatório impediria cadastrar
// "R$ 500 no Pix". O catálogo entra como sugestão, não como trava.
//
// O que ele resolve é o nome BATER. A cor da raridade na página pública sai do
// nome conferido contra o catálogo, então "AK47 Vulcan" digitado à mão não
// casa com "AK-47 | Vulcan" e sai sem cor, sem avisar ninguém. A sugestão faz
// o nome cair certo, e a marca de raridade ao lado confirma na hora que casou.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Input } from "@/components/ui/input";
import { RARITY_LABEL, RARITY_TEXT_VAR } from "@/lib/cs2";
import { chaveDoNome, separarDesgaste } from "@/lib/premio-nome";
import { cn } from "@/lib/utils";

import type { SkinRarity } from "@prisma/client";

export interface SkinDoCatalogoSimples {
  name: string;
  skinRarity: SkinRarity | null;
}

/** Quantas sugestões mostrar. Mais que isto vira lista para navegar. */
const MAXIMO_DE_SUGESTOES = 6;

/**
 * A lista sai num portal, e não dentro do campo.
 *
 * O Card do painel tem overflow-hidden, então a lista ancorada no próprio
 * campo era cortada na borda do card: as últimas linhas da tabela, que são
 * justamente as que a pessoa acabou de adicionar, ficavam com a sugestão pela
 * metade. Position fixed sozinha não resolveria com segurança, porque qualquer
 * ancestral com transform vira bloco de contenção e volta a recortar.
 */
export function CampoDePremio({
  valor,
  aoMudar,
  catalogo,
  placeholder,
}: {
  valor: string;
  aoMudar: (v: string) => void;
  catalogo: SkinDoCatalogoSimples[];
  placeholder?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const refDoCampo = useRef<HTMLDivElement | null>(null);
  const [caixa, setCaixa] = useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);

  const medir = useCallback(() => {
    const no = refDoCampo.current;
    if (!no) return;
    const r = no.getBoundingClientRect();
    setCaixa({ left: r.left, top: r.bottom + 4, width: r.width });
  }, []);

  // Remede enquanto está aberta: a lista está presa ao viewport, então rolar a
  // página sem isso a deixaria parada no lugar antigo.
  useEffect(() => {
    if (!aberto) return;
    medir();
    const alvo = { passive: true } as const;
    window.addEventListener("scroll", medir, { ...alvo, capture: true });
    window.addEventListener("resize", medir, alvo);
    return () => {
      window.removeEventListener("scroll", medir, { capture: true });
      window.removeEventListener("resize", medir);
    };
  }, [aberto, medir]);

  const porChave = useMemo(() => {
    const m = new Map<string, SkinRarity | null>();
    for (const s of catalogo) m.set(chaveDoNome(s.name), s.skinRarity);
    return m;
  }, [catalogo]);

  // A raridade que ESTE texto vai receber ao salvar, pela mesma regra do
  // servidor. Mostrar aqui é o que transforma "não casou" em algo visível.
  const raridade = porChave.get(chaveDoNome(separarDesgaste(valor).nome)) ?? null;
  const casou = porChave.has(chaveDoNome(separarDesgaste(valor).nome));

  const sugestoes = useMemo(() => {
    const busca = chaveDoNome(valor);
    if (busca.length < 2) return [];
    return catalogo
      .filter((s) => chaveDoNome(s.name).includes(busca))
      .slice(0, MAXIMO_DE_SUGESTOES);
  }, [valor, catalogo]);

  const mostrarLista = aberto && sugestoes.length > 0 && !casou;

  return (
    <div ref={refDoCampo} className="relative">
      <div className="relative">
        <Input
          placeholder={placeholder}
          value={valor}
          onChange={(e) => {
            aoMudar(e.target.value);
            setAberto(true);
          }}
          onFocus={() => setAberto(true)}
          // Fecha no próximo quadro, e não no mesmo: fechar já no blur mataria
          // a lista antes do clique na sugestão chegar.
          onBlur={() => setTimeout(() => setAberto(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setAberto(false);
          }}
          className={cn(casou && "pr-24")}
        />
        {raridade && (
          <span
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-bold uppercase tracking-wide"
            style={{ color: RARITY_TEXT_VAR[raridade] }}
          >
            {RARITY_LABEL[raridade]}
          </span>
        )}
      </div>

      {mostrarLista &&
        caixa &&
        typeof document !== "undefined" &&
        createPortal(
          <ul
            className="fixed z-50 overflow-hidden rounded-lg border bg-popover shadow-lg"
            style={{ left: caixa.left, top: caixa.top, width: caixa.width }}
          >
          {sugestoes.map((s) => (
            <li key={s.name}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  aoMudar(s.name);
                  setAberto(false);
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <span className="min-w-0 truncate">{s.name}</span>
                {s.skinRarity && (
                  <span
                    className="shrink-0 text-[11px] font-bold uppercase tracking-wide"
                    style={{ color: RARITY_TEXT_VAR[s.skinRarity] }}
                  >
                    {RARITY_LABEL[s.skinRarity]}
                  </span>
                )}
              </button>
            </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}

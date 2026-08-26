"use client";

// Escolha da skin do catálogo, no topo da criação de sorteio.
//
// Escolher preenche o título na hora e, ao salvar, cria o primeiro prêmio com
// a ficha completa e a capa. Sem isso a pessoa criava o sorteio e depois
// redigitava raridade, desgaste, float e valor na aba Prêmios, e reenviava a
// mesma foto na aba Imagens.
//
// Só aparece na criação: depois que o sorteio existe, prêmio e capa são
// editados nas próprias abas, e um seletor aqui só criaria dúvida sobre qual
// dos dois manda.

import Link from "next/link";
import { Boxes, Check, Plus } from "lucide-react";

import { RARITY_LABEL, WEAR_LABEL, rarityColor } from "@/lib/cs2";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";

type Raridade = keyof typeof RARITY_LABEL;
type Desgaste = keyof typeof WEAR_LABEL;

export interface SkinDoCatalogo {
  id: string;
  name: string;
  imageUrl: string | null;
  skinRarity: Raridade | null;
  skinWear: Desgaste | null;
  skinValueBrl: number | null;
}

export function SeletorDeSkin({
  skins,
  escolhida,
  aoEscolher,
  aoPreencherTitulo,
}: {
  skins: SkinDoCatalogo[];
  escolhida: string | null;
  aoEscolher: (id: string | null) => void;
  /** Chamado com o nome da skin para preencher o título do sorteio. */
  aoPreencherTitulo: (nome: string) => void;
}) {
  if (skins.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed bg-muted/20 p-4">
        <p className="text-sm font-semibold">Catálogo de skins vazio</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Cadastre as skins que você costuma sortear e elas aparecem aqui.
          Escolher uma preenche o prêmio e a capa sem digitar nada.
        </p>
        <Link
          href="/admin/skins"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
        >
          <Plus className="h-3.5 w-3.5" />
          Cadastrar primeira skin
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 rounded-xl border bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Boxes className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Usar skin do catálogo</span>
        </div>
        <Link
          href="/admin/skins"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Gerenciar
        </Link>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Preenche o título agora e, ao salvar, cria o prêmio com a ficha
        completa e a capa da campanha.
      </p>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {skins.map((skin) => {
          const ativa = escolhida === skin.id;
          return (
            <button
              key={skin.id}
              type="button"
              onClick={() => {
                if (ativa) {
                  aoEscolher(null);
                  return;
                }
                aoEscolher(skin.id);
                aoPreencherTitulo(skin.name);
              }}
              className={cn(
                "relative flex items-center gap-3 rounded-xl border-2 p-2.5 text-left transition-colors",
                ativa
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40"
              )}
            >
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/60"
                style={
                  skin.skinRarity
                    ? {
                        backgroundImage: `radial-gradient(circle at 50% 120%, ${rarityColor(
                          skin.skinRarity,
                          0.4
                        )}, transparent 75%)`,
                      }
                    : undefined
                }
              >
                {skin.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={skin.imageUrl}
                    alt=""
                    className="h-full w-full object-contain p-1"
                  />
                ) : (
                  <span className="text-[9px] uppercase text-muted-foreground">
                    s/ foto
                  </span>
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold">
                  {skin.name}
                </span>
                <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                  {[
                    skin.skinRarity ? RARITY_LABEL[skin.skinRarity] : null,
                    skin.skinWear ? WEAR_LABEL[skin.skinWear] : null,
                    skin.skinValueBrl != null ? formatBRL(skin.skinValueBrl) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "sem ficha"}
                </span>
              </span>

              {ativa && (
                <Check className="h-4 w-4 shrink-0 text-primary" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

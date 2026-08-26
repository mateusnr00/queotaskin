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
//
// É busca, não vitrine. A versão anterior desenhava um cartão por skin em
// grade: com o catálogo de verdade, cem skins, isso empurraria o formulário
// para metros abaixo da dobra e o campo Título sumiria da tela. Quem cria
// campanha já sabe qual skin vai sortear, então o trabalho aqui é achar uma
// conhecida pelo nome, não navegar por todas.

import Link from "next/link";
import { useMemo, useState } from "react";
import { Boxes, Plus, Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { PROPORCAO_DA_SKIN, RARITY_LABEL, WEAR_LABEL, rarityColor } from "@/lib/cs2";
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

/** Quantas linhas a busca mostra antes de exigir refinar o termo. */
const MAXIMO_NA_LISTA = 8;

/** "AK-47 | Redline (FT)" e "ak47 redline ft" precisam casar. */
function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function fichaEmTexto(skin: SkinDoCatalogo) {
  return (
    [
      skin.skinRarity ? RARITY_LABEL[skin.skinRarity] : null,
      skin.skinWear ? WEAR_LABEL[skin.skinWear] : null,
      skin.skinValueBrl != null ? formatBRL(skin.skinValueBrl) : null,
    ]
      .filter(Boolean)
      .join(" · ") || "sem ficha"
  );
}

/** `altura` em px; a largura vem da proporção do quadro, não de um quadrado. */
function Miniatura({ skin, altura }: { skin: SkinDoCatalogo; altura: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/60"
      style={{
        height: altura,
        aspectRatio: PROPORCAO_DA_SKIN,
        ...(skin.skinRarity
          ? {
              backgroundImage: `radial-gradient(circle at 50% 120%, ${rarityColor(
                skin.skinRarity,
                0.4
              )}, transparent 75%)`,
            }
          : {}),
      }}
    >
      {skin.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={skin.imageUrl} alt="" className="h-full w-full object-contain" />
      ) : (
        <span className="text-[9px] uppercase text-muted-foreground">s/ foto</span>
      )}
    </span>
  );
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
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);

  const skinEscolhida = skins.find((s) => s.id === escolhida) ?? null;

  const encontradas = useMemo(() => {
    const termo = normalizar(busca);
    if (!termo) return skins;
    // Todas as palavras precisam aparecer, em qualquer ordem: "redline ak"
    // acha a AK-47 Redline sem exigir que o nome comece assim.
    const palavras = termo.split(" ");
    return skins.filter((s) => {
      const alvo = normalizar(s.name);
      return palavras.every((p) => alvo.includes(p));
    });
  }, [skins, busca]);

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

  // Já escolheu: a busca sai de cena e fica só o que foi escolhido. Manter a
  // lista aberta depois da escolha faria a pessoa se perguntar se precisa
  // escolher de novo.
  if (skinEscolhida) {
    return (
      <div className="rounded-xl border bg-muted/20 p-3">
        <div className="flex items-center gap-3">
          <Miniatura skin={skinEscolhida} altura={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {skinEscolhida.name}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {fichaEmTexto(skinEscolhida)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              aoEscolher(null);
              setBusca("");
              setAberto(false);
            }}
            className="shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Trocar skin"
            title="Trocar skin"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Ao salvar, essa skin vira o prêmio com a ficha completa e a capa da
          campanha.
        </p>
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

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setAberto(true);
          }}
          onFocus={() => setAberto(true)}
          placeholder={`Buscar entre ${skins.length} skin${
            skins.length > 1 ? "s" : ""
          } do catálogo`}
          className="pl-8"
          // A busca é um atalho, não um campo do formulário: sem name, para
          // não ir junto no submit, e sem Enter, que aqui enviaria o sorteio
          // inteiro antes da hora.
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
            if (e.key === "Escape") setAberto(false);
          }}
        />
      </div>

      {aberto && (
        <div className="overflow-hidden rounded-lg border bg-background">
          {encontradas.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              Nenhuma skin com esse nome.
            </p>
          ) : (
            <>
              {encontradas.slice(0, MAXIMO_NA_LISTA).map((skin, i) => (
                <button
                  key={skin.id}
                  type="button"
                  onClick={() => {
                    aoEscolher(skin.id);
                    aoPreencherTitulo(skin.name);
                    setAberto(false);
                    setBusca("");
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/60",
                    i > 0 && "border-t"
                  )}
                >
                  <Miniatura skin={skin} altura={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold">
                      {skin.name}
                    </span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {fichaEmTexto(skin)}
                    </span>
                  </span>
                </button>
              ))}
              {encontradas.length > MAXIMO_NA_LISTA && (
                <p className="border-t px-3 py-2 text-center text-[11px] text-muted-foreground">
                  Mais {encontradas.length - MAXIMO_NA_LISTA} resultado
                  {encontradas.length - MAXIMO_NA_LISTA > 1 ? "s" : ""}. Refine
                  a busca.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

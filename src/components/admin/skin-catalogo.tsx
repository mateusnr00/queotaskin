"use client";

// Catálogo de skins: lista, cadastro e edição.
//
// A foto usa o mesmo caminho de upload das imagens de sorteio, incluindo a
// redução no navegador: sem ela, um render em PNG de vários MB não passaria
// pelo limite do corpo da Server Action.

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Camera,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

import {
  atualizarSkinAction,
  criarSkinAction,
  removerSkinAction,
  uploadFotoDaSkinAction,
} from "@/server/actions/skin-templates";
import { normalizeImage } from "@/lib/image-normalize";
import { ArtesDaSkin, type ArteDaSkin } from "@/components/admin/artes-da-skin";
import {
  PROPORCAO_DA_SKIN,
  QUADRO_DA_SKIN,
  RARITY_LABEL,
  WEAR_LABEL,
  rarityColor,
  WEARS_EM_ORDEM,
} from "@/lib/cs2";
import { formatBRL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type Raridade = keyof typeof RARITY_LABEL;
type Desgaste = keyof typeof WEAR_LABEL;

export interface SkinDoCatalogo {
  id: string;
  name: string;
  imageUrl: string | null;
  skinRarity: Raridade | null;
  skinWear: Desgaste | null;
  skinFloat: number | null;
  skinStatTrak: boolean;
  skinSouvenir: boolean;
  skinValueBrl: number | null;
  skinCollection: string | null;
  skinInspectUrl: string | null;
  /** Em quais desgastes a skin existe; manda nos espaços de arte. */
  desgastesDisponiveis: Desgaste[];
  /** As artes de campanha ja enviadas. */
  artes: ArteDaSkin[];
}

/** Quantas linhas por lote. Uma tela cheia cabe em bem menos que isso. */
const LOTE = 60;

const VAZIA: Omit<SkinDoCatalogo, "id"> = {
  desgastesDisponiveis: WEARS_EM_ORDEM,
  artes: [],
  name: "",
  imageUrl: null,
  skinRarity: null,
  skinWear: null,
  skinFloat: null,
  skinStatTrak: false,
  skinSouvenir: false,
  skinValueBrl: null,
  skinCollection: null,
  skinInspectUrl: null,
};

/** "AK-47 | Redline (FT)" e "ak47 redline ft" precisam casar. */
function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function SkinCatalogo({ skins }: { skins: SkinDoCatalogo[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState<SkinDoCatalogo | "nova" | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();
  const [busca, setBusca] = useState("");
  // Quantas linhas desenhar de uma vez. Com o catálogo cheio, mandar todas
  // dava 3,73 MB de HTML: o servidor renderizava 865 linhas que ninguém
  // ia ler antes de buscar. O teto cresce sob demanda e a busca continua
  // rodando sobre a lista inteira, não sobre o pedaço visível.
  const [teto, setTeto] = useState(LOTE);

  // Buscar reinicia o teto: filtrar e continuar mostrando o teto anterior
  // esconderia resultados sem dizer que existem.
  function buscar(valor: string) {
    setBusca(valor);
    setTeto(LOTE);
  }

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

  function remover(skin: SkinDoCatalogo) {
    if (!confirm(`Remover "${skin.name}" do catálogo?`)) return;
    startTransition(async () => {
      const r = await removerSkinAction(skin.id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Skin removida");
      router.refresh();
    });
  }

  if (editando) {
    return (
      <FormularioSkin
        inicial={editando === "nova" ? null : editando}
        // Sem isto, fechar o formulário e reabrir a mesma skin mostraria as
        // artes de antes: `editando` é capturado no clique de editar e nunca
        // mais era atualizado.
        aoMudarArtes={(artes) =>
          setEditando((atual) =>
            atual && atual !== "nova" ? { ...atual, artes } : atual,
          )
        }
        aoFechar={() => setEditando(null)}
        aoSalvar={() => {
          setEditando(null);
          router.refresh();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Busca e cadastro na mesma linha. A busca some com o catálogo vazio:
          filtrar o nada só ocuparia espaço e sugeriria que existe algo
          escondido atrás do campo. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {skins.length > 0 && (
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => buscar(e.target.value)}
              placeholder={`Buscar entre ${skins.length} skin${
                skins.length > 1 ? "s" : ""
              }`}
              className="pl-8"
            />
          </div>
        )}
        <Button
          type="button"
          onClick={() => setEditando("nova")}
          className="sm:w-auto"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Cadastrar skin
        </Button>
      </div>

      {skins.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center">
          <Boxe />
          <p className="text-sm font-semibold">Catálogo vazio</p>
          <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
            Cadastre as skins que você costuma sortear. Depois é só escolher da
            lista ao criar a campanha, e a ficha e a foto vão junto.
          </p>
        </Card>
      ) : encontradas.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhuma skin com esse nome.
          </p>
        </Card>
      ) : (
        /* Uma linha por skin, e a linha cabe numa altura só. A grade de
           cartões gastava 250px por skin; empilhar os dados em duas linhas
           dentro da linha da lista ainda gastava 80px e deixava a página do
           mesmo tamanho. Nome à esquerda, ficha à direita, tudo no mesmo
           eixo: 48px por skin, e o que sobra de tela é o que faz a lista
           ser navegável. */
        <Card className="divide-y overflow-hidden p-0">
          {encontradas.slice(0, teto).map((skin) => (
            <div
              key={skin.id}
              className="flex items-center gap-3 px-3 py-1.5 transition-colors hover:bg-muted/40"
            >
              <span
                className="flex h-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted/50"
                style={{
                  aspectRatio: PROPORCAO_DA_SKIN,
                  ...(skin.skinRarity
                    ? {
                        backgroundImage: `radial-gradient(circle at 50% 120%, ${rarityColor(
                          skin.skinRarity,
                          0.35,
                        )}, transparent 75%)`,
                      }
                    : {}),
                }}
              >
                {skin.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={skin.imageUrl}
                    alt=""
                    // As fotos vêm do CDN da Steam, uma por linha. Sem lazy,
                    // um catálogo de 865 skins dispara 865 downloads de uma
                    // vez e o "load" da página levava 27s. O DOM já estava
                    // pronto em 638ms; era só imagem segurando.
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="text-[9px] uppercase text-muted-foreground">
                    s/ foto
                  </span>
                )}
              </span>

              <p className="min-w-0 flex-1 truncate text-sm font-medium">
                {skin.name}
              </p>

              {/* A ficha some no celular: nome e ações é o que se usa para
                  achar e editar, e espremer os quatro dados numa tela
                  estreita cortaria justamente o nome. */}
              <div className="hidden shrink-0 items-center gap-2 text-[10px] sm:flex">
                {skin.skinStatTrak && (
                  <span className="font-semibold text-orange-500">
                    StatTrak
                  </span>
                )}
                {skin.skinWear && (
                  <span className="text-muted-foreground">
                    {WEAR_LABEL[skin.skinWear]}
                  </span>
                )}
                {skin.skinValueBrl != null && (
                  <span className="w-20 text-right tabular-nums text-muted-foreground">
                    {formatBRL(skin.skinValueBrl)}
                  </span>
                )}
                {skin.skinRarity && (
                  <span
                    className="w-24 rounded-full px-1.5 py-0.5 text-center font-semibold uppercase tracking-wider text-white"
                    style={{ backgroundColor: rarityColor(skin.skinRarity) }}
                  >
                    {RARITY_LABEL[skin.skinRarity]}
                  </span>
                )}
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setEditando(skin)}
                aria-label={`Editar ${skin.name}`}
                title="Editar"
                className="h-8 w-8 shrink-0"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remover(skin)}
                disabled={isPending}
                aria-label={`Remover ${skin.name}`}
                title="Remover"
                className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {encontradas.length > teto && (
            <button
              type="button"
              onClick={() => setTeto((t) => t + LOTE)}
              className="w-full px-3 py-3 text-center text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            >
              Mostrar mais {Math.min(LOTE, encontradas.length - teto)} de{" "}
              {(encontradas.length - teto).toLocaleString("pt-BR")} restantes
            </button>
          )}
        </Card>
      )}
    </div>
  );
}

function Boxe() {
  return (
    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
      <Camera className="h-5 w-5" />
    </span>
  );
}

function FormularioSkin({
  inicial,
  aoFechar,
  aoSalvar,
  aoMudarArtes,
}: {
  inicial: SkinDoCatalogo | null;
  aoFechar: () => void;
  aoSalvar: () => void;
  /** Sobe para o catálogo: é lá que mora o retrato da skin em edição. */
  aoMudarArtes: (artes: ArteDaSkin[]) => void;
}) {
  const [dados, setDados] = useState<Omit<SkinDoCatalogo, "id">>(
    inicial ?? VAZIA,
  );
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function campo<K extends keyof typeof dados>(
    chave: K,
    valor: (typeof dados)[K],
  ) {
    setDados((d) => ({ ...d, [chave]: valor }));
  }

  async function enviarFoto(original: File) {
    setEnviandoFoto(true);
    try {
      // Sai daqui já no quadro padrão, então o que está no banco tem
      // sempre a mesma proporção e as telas não precisam adivinhar.
      const { file } = await normalizeImage(original, {
        quadro: QUADRO_DA_SKIN,
      });
      const fd = new FormData();
      fd.append("file", file);
      let r;
      try {
        r = await uploadFotoDaSkinAction(fd);
      } catch {
        toast.error("Imagem grande demais para enviar");
        return;
      }
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      campo("imageUrl", r.data.url);
      toast.success("Foto enviada");
    } finally {
      setEnviandoFoto(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function salvar() {
    startTransition(async () => {
      // O corpo nomeia o que entra, campo a campo. `artes` e
      // `desgastesDisponiveis` ficam de fora: o primeiro é tabela à parte,
      // que salva sozinha ao enviar, e o segundo vem da fonte de itens do
      // CS2. Espalhar `dados` mandava os dois no corpo, e o zod os descartava
      // em silêncio: funciona por acidente e some no dia em que o schema
      // virar strict.
      const payload = {
        name: dados.name,
        skinStatTrak: dados.skinStatTrak,
        skinSouvenir: dados.skinSouvenir,
        imageUrl: dados.imageUrl ?? "",
        skinRarity: dados.skinRarity ?? "",
        skinWear: dados.skinWear ?? "",
        skinFloat: dados.skinFloat ?? "",
        skinValueBrl: dados.skinValueBrl ?? "",
        skinCollection: dados.skinCollection ?? "",
        skinInspectUrl: dados.skinInspectUrl ?? "",
      };
      const r = inicial
        ? await atualizarSkinAction(inicial.id, payload)
        : await criarSkinAction(payload);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(inicial ? "Skin atualizada" : "Skin cadastrada");
      aoSalvar();
    });
  }

  return (
    <div className="space-y-3">
      {/* O caminho de volta, escrito.
          O formulário toma a página inteira no lugar da lista, e a única
          saída era um "x" no canto de cima e um "Cancelar" no fim de uma
          página comprida: no meio dela, com a lista de artes aberta, não
          havia nada dizendo como voltar sem sair pelo botão do navegador. E
          "Cancelar" ao lado de "Salvar" lê como descartar, não como voltar. */}
      <button
        type="button"
        onClick={aoFechar}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar para o catálogo
      </button>

      <Card className="space-y-5 p-5 md:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">
              {inicial ? "Editar skin" : "Cadastrar skin"}
            </h2>
            <p className="text-xs text-muted-foreground">
              Só o nome é obrigatório. O resto aparece na ficha do prêmio quando
              a campanha liga a ficha técnica.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={aoFechar}
            aria-label="Voltar para o catálogo"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) enviarFoto(f);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={enviandoFoto || isPending}
            // A caixa tem a proporção do quadro, então o que aparece aqui é o
            // que foi gravado, sem faixa vazia em cima e embaixo sugerindo que
            // a foto ficou menor do que ficou.
            style={{ aspectRatio: PROPORCAO_DA_SKIN }}
            className={cn(
              "relative w-full shrink-0 overflow-hidden rounded-xl border-2 border-dashed transition-colors sm:w-56",
              dados.imageUrl
                ? "border-transparent bg-muted/30 ring-1 ring-border"
                : "border-border hover:border-primary",
            )}
          >
            {dados.imageUrl ? (
              // Sem recuo: a moldura tem a proporção do quadro, então arte
              // feita no tamanho padrão encosta nas quatro bordas. Um p-2 aqui
              // deixaria uma faixa permanente sugerindo que a foto ficou menor
              // do que o quadro.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={dados.imageUrl}
                alt="Foto da skin"
                className="h-full w-full object-contain"
              />
            ) : (
              <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
                {enviandoFoto ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Camera className="h-5 w-5" />
                )}
                <span className="text-[10px] uppercase tracking-wider">
                  Enviar foto
                </span>
              </span>
            )}
          </button>

          <div className="flex-1 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="skin-name">Nome da skin *</Label>
              <Input
                id="skin-name"
                value={dados.name}
                onChange={(e) => campo("name", e.target.value)}
                placeholder="AWP | Dragon Lore"
                maxLength={140}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="skin-rarity">Raridade</Label>
                <select
                  id="skin-rarity"
                  value={dados.skinRarity ?? ""}
                  onChange={(e) =>
                    campo(
                      "skinRarity",
                      (e.target.value || null) as Raridade | null,
                    )
                  }
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                >
                  <option value="">Não informada</option>
                  {(Object.keys(RARITY_LABEL) as Raridade[]).map((r) => (
                    <option key={r} value={r}>
                      {RARITY_LABEL[r]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="skin-wear">Desgaste</Label>
                <select
                  id="skin-wear"
                  value={dados.skinWear ?? ""}
                  onChange={(e) =>
                    campo(
                      "skinWear",
                      (e.target.value || null) as Desgaste | null,
                    )
                  }
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                >
                  <option value="">Não informado</option>
                  {(Object.keys(WEAR_LABEL) as Desgaste[]).map((w) => (
                    <option key={w} value={w}>
                      {WEAR_LABEL[w]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="skin-float">Float</Label>
            <Input
              id="skin-float"
              inputMode="decimal"
              value={dados.skinFloat ?? ""}
              onChange={(e) =>
                campo(
                  "skinFloat",
                  e.target.value === "" ? null : Number(e.target.value),
                )
              }
              placeholder="0.0342"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="skin-value">Valor de mercado (R$)</Label>
            <Input
              id="skin-value"
              inputMode="decimal"
              value={dados.skinValueBrl ?? ""}
              onChange={(e) =>
                campo(
                  "skinValueBrl",
                  e.target.value === "" ? null : Number(e.target.value),
                )
              }
              placeholder="4890"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="skin-collection">Coleção</Label>
            <Input
              id="skin-collection"
              value={dados.skinCollection ?? ""}
              onChange={(e) => campo("skinCollection", e.target.value || null)}
              placeholder="The Cobblestone Collection"
              maxLength={140}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={dados.skinStatTrak}
              onCheckedChange={(v) => campo("skinStatTrak", v)}
            />
            StatTrak
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={dados.skinSouvenir}
              onCheckedChange={(v) => campo("skinSouvenir", v)}
            />
            Souvenir
          </label>
        </div>

        {/* As artes ficam por último e fora do estado do formulário: cada uma
          salva sozinha ao ser enviada, e não junto com "Salvar skin". São
          arquivos, não campos, e amarrá-las ao botão faria a pessoa enviar
          cinco imagens e perder todas ao fechar sem salvar. */}
        <ArtesDaSkin
          // A key reinicia a lista de artes ao trocar de skin, no lugar de um
          // efeito copiando prop em estado.
          key={inicial?.id ?? "nova"}
          skinId={inicial?.id ?? null}
          desgastesDisponiveis={dados.desgastesDisponiveis}
          artes={inicial?.artes ?? []}
          // O retrato do pai anda junto. Sem isto, fechar o formulário e
          // reabrir a mesma skin mostraria as artes de antes: `editando` é
          // capturado no clique de editar e nunca mais era atualizado.
          aoMudar={aoMudarArtes}
        />

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="ghost" onClick={aoFechar}>
            Voltar sem salvar
          </Button>
          <Button
            type="button"
            onClick={salvar}
            disabled={isPending || !dados.name.trim()}
          >
            {isPending ? "Salvando..." : "Salvar skin"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

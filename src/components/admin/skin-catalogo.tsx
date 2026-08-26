"use client";

// Catálogo de skins: lista, cadastro e edição.
//
// A foto usa o mesmo caminho de upload das imagens de sorteio, incluindo a
// redução no navegador: sem ela, um render em PNG de vários MB não passaria
// pelo limite do corpo da Server Action.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";

import {
  atualizarSkinAction,
  criarSkinAction,
  removerSkinAction,
  uploadFotoDaSkinAction,
} from "@/server/actions/skin-templates";
import { normalizeImage } from "@/lib/image-normalize";
import { RARITY_LABEL, WEAR_LABEL, rarityColor } from "@/lib/cs2";
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
}

const VAZIA: Omit<SkinDoCatalogo, "id"> = {
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

export function SkinCatalogo({ skins }: { skins: SkinDoCatalogo[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState<SkinDoCatalogo | "nova" | null>(null);
  const [isPending, startTransition] = useTransition();

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
      <div className="flex justify-end">
        <Button type="button" onClick={() => setEditando("nova")}>
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
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {skins.map((skin) => (
            <Card key={skin.id} className="overflow-hidden p-0">
              <div
                className="relative flex h-32 items-center justify-center bg-muted/40"
                style={
                  skin.skinRarity
                    ? {
                        backgroundImage: `radial-gradient(circle at 50% 120%, ${rarityColor(
                          skin.skinRarity,
                          0.35
                        )}, transparent 70%)`,
                      }
                    : undefined
                }
              >
                {skin.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={skin.imageUrl}
                    alt={skin.name}
                    className="h-full w-full object-contain p-3"
                  />
                ) : (
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    sem foto
                  </span>
                )}
              </div>

              <div className="space-y-2 p-4">
                <p className="text-sm font-semibold leading-tight">{skin.name}</p>
                <div className="flex flex-wrap gap-1.5 text-[10px]">
                  {skin.skinRarity && (
                    <span
                      className="rounded-full px-2 py-0.5 font-semibold uppercase tracking-wider text-white"
                      style={{ backgroundColor: rarityColor(skin.skinRarity) }}
                    >
                      {RARITY_LABEL[skin.skinRarity]}
                    </span>
                  )}
                  {skin.skinWear && (
                    <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
                      {WEAR_LABEL[skin.skinWear]}
                    </span>
                  )}
                  {skin.skinStatTrak && (
                    <span className="rounded-full bg-orange-500/20 px-2 py-0.5 font-semibold text-orange-500">
                      StatTrak
                    </span>
                  )}
                  {skin.skinValueBrl != null && (
                    <span className="rounded-full bg-muted px-2 py-0.5 font-medium tabular-nums text-muted-foreground">
                      {formatBRL(skin.skinValueBrl)}
                    </span>
                  )}
                </div>

                <div className="flex gap-1 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => setEditando(skin)}
                  >
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Editar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remover(skin)}
                    disabled={isPending}
                    aria-label="Remover"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
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
}: {
  inicial: SkinDoCatalogo | null;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const [dados, setDados] = useState<Omit<SkinDoCatalogo, "id">>(
    inicial ?? VAZIA
  );
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function campo<K extends keyof typeof dados>(chave: K, valor: (typeof dados)[K]) {
    setDados((d) => ({ ...d, [chave]: valor }));
  }

  async function enviarFoto(original: File) {
    setEnviandoFoto(true);
    try {
      const { file } = await normalizeImage(original);
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
      const payload = {
        ...dados,
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
        <Button type="button" variant="ghost" size="icon" onClick={aoFechar}>
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
          className={cn(
            "relative h-32 w-full shrink-0 overflow-hidden rounded-xl border-2 border-dashed transition-colors sm:w-44",
            dados.imageUrl
              ? "border-transparent bg-muted/30 ring-1 ring-border"
              : "border-border hover:border-primary"
          )}
        >
          {dados.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={dados.imageUrl}
              alt="Foto da skin"
              className="h-full w-full object-contain p-2"
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
                  campo("skinRarity", (e.target.value || null) as Raridade | null)
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
                  campo("skinWear", (e.target.value || null) as Desgaste | null)
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
              campo("skinFloat", e.target.value === "" ? null : Number(e.target.value))
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
              campo("skinValueBrl", e.target.value === "" ? null : Number(e.target.value))
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

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="ghost" onClick={aoFechar}>
          Cancelar
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
  );
}

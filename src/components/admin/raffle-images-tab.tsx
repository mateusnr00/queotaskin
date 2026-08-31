"use client";

// Aba "Imagens" do editor de sorteio. Permite enviar até N imagens via
// Supabase Storage, definir a capa e remover. Inputs e botões funcionam
// individualmente via server actions; não há "Salvar" geral nesta aba.

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Camera,
  ImagePlus,
  Link2,
  Loader2,
  Star,
  Trash2,
  Upload,
} from "lucide-react";

import {
  addRaffleImageByUrlAction,
  deleteRaffleImageAction,
  setRaffleCoverAction,
  uploadRaffleImageAction,
} from "@/server/actions/raffle-content";
import { Button } from "@/components/ui/button";
import { SecaoDoFormulario } from "@/components/admin/secao-de-formulario";
import { Input } from "@/components/ui/input";
import { normalizeImage } from "@/lib/image-normalize";
import { StickySaveBar } from "@/components/admin/sticky-save-bar";
import { MAX_IMAGES_PER_RAFFLE } from "@/lib/raffle-images";
import { cn } from "@/lib/utils";

export interface RaffleImageItem {
  id: string;
  url: string;
  isCover: boolean;
  order: number;
}

interface Props {
  raffleId: string;
  initialImages: RaffleImageItem[];
}

export function RaffleImagesTab({ raffleId, initialImages }: Props) {
  const [images, setImages] = useState<RaffleImageItem[]>(initialImages);
  const [isUploading, setIsUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [urlValue, setUrlValue] = useState("");
  const [isAddingUrl, setIsAddingUrl] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleAddUrl() {
    const url = urlValue.trim();
    if (!url) {
      toast.error("Cole uma URL antes");
      return;
    }
    setIsAddingUrl(true);
    try {
      const result = await addRaffleImageByUrlAction({ raffleId, url });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setImages((prev) => [
        ...prev,
        {
          id: result.data.id,
          url: result.data.url,
          isCover: prev.length === 0,
          order: prev.length,
        },
      ]);
      setUrlValue("");
      toast.success("Imagem adicionada");
    } finally {
      setIsAddingUrl(false);
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    let enviadas = 0;
    try {
      for (const original of Array.from(files)) {
        // Encolhe no navegador antes de enviar: o corpo de uma Server Action
        // não passa de alguns MB, e render de skin em PNG estoura isso.
        const { file } = await normalizeImage(original);
        const fd = new FormData();
        fd.append("raffleId", raffleId);
        fd.append("file", file);

        let result;
        try {
          result = await uploadRaffleImageAction(fd);
        } catch {
          // Corpo recusado antes de chegar na action: o erro vem como falha
          // de rede, sem mensagem nossa. Traduz para algo acionável.
          toast.error(`"${original.name}" é grande demais para enviar`);
          continue;
        }
        if (!result.ok) {
          toast.error(`"${original.name}": ${result.error}`);
          continue;
        }
        enviadas += 1;
        setImages((prev) => [
          ...prev,
          {
            id: result.data.id,
            url: result.data.url,
            isCover: prev.length === 0,
            order: prev.length,
          },
        ]);
      }
      if (enviadas > 0) {
        toast.success(enviadas === 1 ? "Imagem enviada" : `${enviadas} imagens enviadas`);
      }
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleDelete(id: string) {
    if (!confirm("Remover essa imagem?")) return;
    startTransition(async () => {
      const result = await deleteRaffleImageAction({ id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setImages((prev) => {
        const removed = prev.find((i) => i.id === id);
        const after = prev.filter((i) => i.id !== id);
        // Se removeu a capa, promove a primeira restante.
        if (removed?.isCover && after.length > 0) {
          after[0] = { ...after[0], isCover: true };
        }
        return after;
      });
      toast.success("Imagem removida");
    });
  }

  function handleSetCover(id: string) {
    startTransition(async () => {
      const result = await setRaffleCoverAction({ raffleId, imageId: id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setImages((prev) =>
        prev.map((img) => ({ ...img, isCover: img.id === id }))
      );
      toast.success("Capa atualizada");
    });
  }

  return (
    <>
      <SecaoDoFormulario
        titulo="Imagens da campanha"
        descricao={`A primeira vira a capa nos cards e no compartilhamento. Qualquer formato serve, e a imagem é reduzida antes do envio. Até ${MAX_IMAGES_PER_RAFFLE} por campanha.`}
        icone={<Camera className="h-4 w-4" />}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        <DropZone
          onPick={() => inputRef.current?.click()}
          onDrop={(files) => handleFiles(files)}
          isUploading={isUploading}
        />

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            ou cole uma URL
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Link2 className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddUrl();
                }
              }}
              placeholder="https://exemplo.com/imagem.jpg"
              inputMode="url"
              disabled={isAddingUrl}
              className="pl-8"
            />
          </div>
          <Button
            type="button"
            onClick={handleAddUrl}
            disabled={isAddingUrl || !urlValue.trim()}
            size="lg"
          >
            {isAddingUrl ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="mr-1.5 h-4 w-4" />
            )}
            Adicionar
          </Button>
        </div>

        {images.length === 0 ? (
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-xs leading-relaxed text-amber-300">
            Nenhuma imagem ainda. Sem capa, a campanha aparece nos cards com um
            fundo genérico, e é a capa que faz alguém parar para ler.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {images.map((img) => (
              <div
                key={img.id}
                className={cn(
                  "group relative rounded-lg overflow-hidden border bg-card",
                  img.isCover && "ring-2 ring-primary"
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt="Imagem do sorteio"
                  className="w-full aspect-square object-cover"
                />
                {img.isCover && (
                  <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">
                    <Star className="h-2.5 w-2.5 fill-current" />
                    Capa
                  </span>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-end gap-1">
                  {!img.isCover && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => handleSetCover(img.id)}
                      disabled={isPending}
                      className="h-7 px-2"
                    >
                      <Star className="h-3.5 w-3.5 mr-1" />
                      Capa
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDelete(img.id)}
                    disabled={isPending}
                    className="h-7 px-2"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Esta aba não tem botão de salvar: enviar, definir capa e remover
            já gravam na hora. A barra fica assim mesmo para a pessoa não
            procurar um "Salvar" que não existe. */}
      </SecaoDoFormulario>
      <StickySaveBar status="Enviar, definir capa e remover já gravam na hora: esta aba não tem botão de salvar." />
    </>
  );
}

function DropZone({
  onPick,
  onDrop,
  isUploading,
}: {
  onPick: () => void;
  onDrop: (files: FileList) => void;
  isUploading: boolean;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (e.dataTransfer.files.length > 0) onDrop(e.dataTransfer.files);
      }}
      onClick={onPick}
      className={cn(
        "relative rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors",
        over
          ? "border-primary bg-primary/5"
          : "border-border bg-muted/20 hover:bg-muted/40"
      )}
    >
      {isUploading ? (
        <Loader2 className="mx-auto h-10 w-10 text-primary animate-spin" />
      ) : (
        <ImagePlus className="mx-auto h-10 w-10 text-muted-foreground" />
      )}
      <h3 className="mt-2 font-semibold text-sm">
        Soltar ou clicar para selecionar
      </h3>
      <p className="text-xs text-muted-foreground mt-0.5">
        Solte arquivos aqui ou clique para procurar no seu computador
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3 pointer-events-none"
      >
        <Upload className="mr-1.5 h-3.5 w-3.5" />
        Escolher arquivos
      </Button>
    </div>
  );
}

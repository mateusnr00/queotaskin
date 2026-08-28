"use client";

// As artes de campanha de uma skin, no cadastro do catálogo.
//
// Arte não é foto. A foto é o render do jogo, veio da fonte de itens do CS2 e
// continua sendo o que aparece em "Ver as skins premiadas". A arte é feita à
// mão, tem logo, fundo e o nome escrito, e é ela que vira a capa do sorteio
// quando essa skin é escolhida na criação.
//
// Uma por desgaste, porque a arte traz o desgaste escrito nela: a de
// "AK-47 | Redline (Field Tested)" não serve para a Minimal Wear. O primeiro
// espaço, "qualquer desgaste", é para quem não quer desenhar cinco: ele entra
// só quando não existe arte do desgaste escolhido.
//
// Só aparecem os desgastes em que a skin existe, a mesma lista que a criação
// do sorteio usa. Agente e faca sem pintura ficam só com o espaço genérico.

import { useRef, useState, useTransition } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import type { SkinWear } from "@prisma/client";

import {
  removerArteDaSkinAction,
  salvarArteDaSkinAction,
  uploadFotoDaSkinAction,
} from "@/server/actions/skin-templates";
import { QUADRO_DA_SKIN, PROPORCAO_DA_SKIN, WEARS_EM_ORDEM, WEAR_STEAM } from "@/lib/cs2";
import { normalizeImage } from "@/lib/image-normalize";
import { cn } from "@/lib/utils";

export interface ArteDaSkin {
  id: string;
  wear: SkinWear | null;
  url: string;
}

export function ArtesDaSkin({
  skinId,
  desgastesDisponiveis,
  artes,
}: {
  /** Nulo enquanto a skin não foi salva: arte precisa de skin para pertencer. */
  skinId: string | null;
  desgastesDisponiveis: SkinWear[];
  artes: ArteDaSkin[];
}) {
  if (!skinId) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/20 p-4">
        <p className="text-sm font-semibold">Arte da campanha</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Salve a skin primeiro. Depois, a arte enviada aqui vira a capa do
          sorteio toda vez que você escolher esta skin.
        </p>
      </div>
    );
  }

  // O genérico primeiro: é o que resolve para quem tem uma arte só.
  const espacos: (SkinWear | null)[] = [
    null,
    ...WEARS_EM_ORDEM.filter((d) => desgastesDisponiveis.includes(d)),
  ];

  return (
    <div className="space-y-2.5 rounded-xl border bg-muted/20 p-4">
      <div>
        <p className="text-sm font-semibold">Arte da campanha</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Vira a capa do sorteio quando esta skin é escolhida. A foto acima
          continua sendo o render que aparece em &ldquo;Ver as skins
          premiadas&rdquo;. A do desgaste escolhido manda; a de
          &ldquo;qualquer desgaste&rdquo; entra quando não há a específica.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {espacos.map((wear) => (
          <Espaco
            key={wear ?? "generica"}
            skinId={skinId}
            wear={wear}
            arte={artes.find((a) => a.wear === wear) ?? null}
          />
        ))}
      </div>
    </div>
  );
}

function Espaco({
  skinId,
  wear,
  arte,
}: {
  skinId: string;
  wear: SkinWear | null;
  arte: ArteDaSkin | null;
}) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const rotulo = wear ? WEAR_STEAM[wear] : "Qualquer desgaste";

  async function enviar(original: File) {
    setEnviando(true);
    try {
      // Sai daqui já no quadro padrão, então a capa tem sempre a mesma
      // proporção e a página do sorteio não precisa adivinhar recorte.
      const { file } = await normalizeImage(original, { quadro: QUADRO_DA_SKIN });
      const fd = new FormData();
      fd.append("file", file);
      let envio;
      try {
        envio = await uploadFotoDaSkinAction(fd);
      } catch {
        toast.error("Imagem grande demais para enviar");
        return;
      }
      if (!envio.ok) {
        toast.error(envio.error);
        return;
      }
      const salvo = await salvarArteDaSkinAction(skinId, wear, envio.data.url);
      if (!salvo.ok) {
        toast.error(salvo.error);
        return;
      }
      toast.success(`Arte de ${rotulo} salva`);
      router.refresh();
    } finally {
      setEnviando(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function remover() {
    if (!arte) return;
    startTransition(async () => {
      const r = await removerArteDaSkinAction(arte.id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Arte removida");
      router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) enviar(f);
        }}
      />
      <div className="relative">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={enviando || isPending}
          style={{ aspectRatio: PROPORCAO_DA_SKIN }}
          title={arte ? `Trocar a arte de ${rotulo}` : `Enviar a arte de ${rotulo}`}
          className={cn(
            "w-full overflow-hidden rounded-lg border-2 border-dashed transition-colors",
            arte
              ? "border-transparent bg-muted/30 ring-1 ring-border"
              : "border-border hover:border-primary",
          )}
        >
          {arte ? (
            // Sem recuo: a moldura tem a proporção do quadro, então a arte
            // feita no tamanho padrão encosta nas quatro bordas.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={arte.url}
              alt={`Arte de ${rotulo}`}
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-muted-foreground">
              {enviando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
            </span>
          )}
        </button>

        {arte && (
          <button
            type="button"
            onClick={remover}
            disabled={isPending}
            aria-label={`Remover a arte de ${rotulo}`}
            title="Remover"
            className="absolute right-1 top-1 rounded-md bg-background/85 p-1 text-muted-foreground transition-colors hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <p
        className={cn(
          "truncate text-center text-[10px] font-semibold uppercase tracking-wider",
          arte ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {rotulo}
      </p>
    </div>
  );
}

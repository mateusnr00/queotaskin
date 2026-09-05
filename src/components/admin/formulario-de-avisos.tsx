"use client";

// Aba "Avisos" do painel: um pop-up de imagem (estilo promoção de restaurante)
// que aparece no site com um "X" para fechar. O admin sobe a arte (5:3 ou
// 9:16), escolhe a proporção, opcionalmente cola um link para onde a imagem
// leva, e liga/desliga. A imagem sobe na hora (uploadLogoAction slot="aviso");
// os demais campos salvam no botão.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImageUp, Trash2, Link2, Eye } from "lucide-react";

import { uploadLogoAction } from "@/server/actions/settings";
import { salvarAvisoAction, removerImagemDoAvisoAction } from "@/server/actions/avisos";
import { normalizeImage } from "@/lib/image-normalize";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type Aspecto = "5:3" | "9:16";

export function FormularioDeAvisos({
  initial,
}: {
  initial: {
    avisoAtivo: boolean;
    avisoAspecto: Aspecto;
    avisoImagemUrl: string | null;
    avisoLinkUrl: string | null;
  };
}) {
  const router = useRouter();
  const [ativo, setAtivo] = useState(initial.avisoAtivo);
  const [aspecto, setAspecto] = useState<Aspecto>(initial.avisoAspecto);
  const [imagemUrl, setImagemUrl] = useState<string | null>(initial.avisoImagemUrl);
  const [linkUrl, setLinkUrl] = useState(initial.avisoLinkUrl ?? "");
  const [enviando, setEnviando] = useState(false);
  const [salvando, startSalvar] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  async function enviarImagem(original: File) {
    setEnviando(true);
    try {
      const { file } = await normalizeImage(original, { ladoMaximo: 2560 });
      const fd = new FormData();
      fd.append("file", file);
      fd.append("slot", "aviso");
      let result;
      try {
        result = await uploadLogoAction(fd);
      } catch {
        toast.error("Imagem grande demais para enviar");
        return;
      }
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setImagemUrl(result.data.url);
      toast.success("Imagem enviada");
      router.refresh();
    } finally {
      setEnviando(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function removerImagem() {
    if (!confirm("Remover a imagem do aviso? Isso também desliga o aviso.")) return;
    startSalvar(async () => {
      const r = await removerImagemDoAvisoAction();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setImagemUrl(null);
      setAtivo(false);
      toast.success("Imagem removida");
      router.refresh();
    });
  }

  function salvar() {
    startSalvar(async () => {
      const r = await salvarAvisoAction({
        avisoAtivo: ativo,
        avisoAspecto: aspecto,
        avisoLinkUrl: linkUrl.trim(),
      });
      if (!r.ok) {
        toast.error(r.error);
        // Ligar sem imagem volta o switch para desligado.
        if (!imagemUrl) setAtivo(false);
        return;
      }
      toast.success("Aviso salvo");
      router.refresh();
    });
  }

  const razao = aspecto === "9:16" ? "aspect-[9/16] max-w-[240px]" : "aspect-[5/3] max-w-md";

  return (
    <div className="space-y-6">
      {/* Imagem + preview no formato escolhido */}
      <div className="rounded-2xl border p-4 md:p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label className="text-sm font-semibold">Imagem do aviso</Label>
            <p className="text-xs text-muted-foreground">
              Use uma arte em <strong>5:3</strong> (paisagem) ou{" "}
              <strong>9:16</strong> (story). PNG, JPG ou WebP, até 3 MB.
            </p>
          </div>
          {imagemUrl && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={removerImagem}
              disabled={salvando || enviando}
            >
              <Trash2 className="h-4 w-4" />
              Remover
            </Button>
          )}
        </div>

        {/* Proporção */}
        <div className="flex items-center gap-2">
          {(["5:3", "9:16"] as const).map((op) => (
            <button
              key={op}
              type="button"
              onClick={() => setAspecto(op)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                aspecto === op
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-input text-muted-foreground hover:text-foreground",
              )}
            >
              {op === "5:3" ? "Paisagem 5:3" : "Story 9:16"}
            </button>
          ))}
        </div>

        {/* Preview / envio */}
        <div className="flex flex-col items-center gap-3">
          <div
            className={cn(
              "w-full overflow-hidden rounded-xl border bg-muted/40",
              razao,
            )}
          >
            {imagemUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imagemUrl}
                alt="Prévia do aviso"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                Nenhuma imagem
              </div>
            )}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void enviarImagem(f);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={enviando || salvando}
          >
            <ImageUp className="h-4 w-4" />
            {enviando ? "Enviando..." : imagemUrl ? "Trocar imagem" : "Enviar imagem"}
          </Button>
        </div>
      </div>

      {/* Link opcional */}
      <div className="rounded-2xl border p-4 md:p-5 space-y-2">
        <Label htmlFor="aviso-link" className="text-sm font-semibold">
          Link ao clicar <span className="font-normal text-muted-foreground">(opcional)</span>
        </Label>
        <div className="relative">
          <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="aviso-link"
            inputMode="url"
            placeholder="https://..."
            className="pl-9"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Se preencher, a imagem vira um link. Vazio: a imagem só fecha no “X”.
        </p>
      </div>

      {/* Ligar / desligar + salvar */}
      <div className="rounded-2xl border p-4 md:p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Switch
            id="aviso-ativo"
            checked={ativo}
            onCheckedChange={setAtivo}
            disabled={!imagemUrl}
          />
          <div>
            <Label htmlFor="aviso-ativo" className="text-sm font-semibold">
              Mostrar aviso no site
            </Label>
            <p className="text-xs text-muted-foreground">
              {imagemUrl
                ? "Aparece como pop-up para quem visita o site, uma vez por imagem."
                : "Envie uma imagem para poder ativar."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {imagemUrl && (
            <a
              href={imagemUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground underline"
            >
              <Eye className="h-3.5 w-3.5" />
              Ver imagem
            </a>
          )}
          <Button type="button" onClick={salvar} disabled={salvando || enviando}>
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

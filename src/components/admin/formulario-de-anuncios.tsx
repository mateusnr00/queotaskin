"use client";

// Configuração de anúncio: o pixel da Meta e o montador de link com marcas
// de origem.
//
// Os dois andam juntos e resolvem metades diferentes da mesma pergunta. O
// pixel diz para a Meta o que aconteceu no site, e é assim que ela aprende a
// quem mostrar o anúncio. As marcas de origem ficam na reserva, e é assim que
// o painel sabe de qual campanha veio cada venda mesmo sem depender do que a
// Meta reporta.

import { useState, useTransition } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { updateMetaPixelAction } from "@/server/actions/settings";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const ROTULO =
  "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

export function FormularioDeAnuncios({
  metaPixelId,
}: {
  metaPixelId: string;
}) {
  const [pixel, setPixel] = useState(metaPixelId);
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function salvar() {
    setErro(null);
    startTransition(async () => {
      const r = await updateMetaPixelAction({ metaPixelId: pixel });
      if (!r.ok) {
        setErro(r.error);
        toast.error(r.error);
        return;
      }
      toast.success(pixel ? "Pixel ligado" : "Pixel desligado");
    });
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-5 md:p-6">
        <div className="space-y-1">
          <h2 className="text-base font-bold">Pixel da Meta</h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Com o pixel ligado, o site avisa a Meta quando alguém abre uma
            página, começa uma reserva e conclui o pagamento. É com esses três
            avisos que ela otimiza a entrega do anúncio.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pixel" className={ROTULO}>
            Id do pixel
          </Label>
          <Input
            id="pixel"
            value={pixel}
            onChange={(e) => setPixel(e.target.value)}
            placeholder="1234567890123456"
            inputMode="numeric"
            className="h-11 max-w-sm tabular-nums"
            aria-invalid={Boolean(erro)}
          />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Está no Gerenciador de Eventos da Meta, em Fontes de dados. Só
            números.{" "}
            <span className="font-medium text-foreground">
              Deixe vazio para desligar
            </span>
            : sem id, nenhum script da Meta é carregado no site.
          </p>
          {erro && (
            <p role="alert" className="text-xs font-medium text-destructive">
              {erro}
            </p>
          )}
        </div>

        <div>
          <Button onClick={salvar} disabled={isPending}>
            {isPending ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </Card>

      <MontadorDeLink />
    </div>
  );
}

/** Os valores que a Meta preenche sozinha quando o link é montado no anúncio. */
const SUGESTOES = [
  { campo: "utm_source", exemplo: "facebook", ajuda: "de onde veio" },
  { campo: "utm_medium", exemplo: "cpc", ajuda: "que tipo de tráfego" },
  { campo: "utm_campaign", exemplo: "ak-redline-agosto", ajuda: "qual campanha" },
] as const;

function MontadorDeLink() {
  const [endereco, setEndereco] = useState("");
  const [valores, setValores] = useState<Record<string, string>>({
    utm_source: "facebook",
    utm_medium: "cpc",
    utm_campaign: "",
  });
  const [copiado, setCopiado] = useState(false);

  const base = endereco.trim();
  const marcas = SUGESTOES.filter((s) => valores[s.campo]?.trim())
    .map((s) => `${s.campo}=${encodeURIComponent(valores[s.campo].trim())}`)
    .join("&");
  // O separador depende de já haver querystring: um segundo "?" quebra o link.
  const pronto = base
    ? marcas
      ? `${base}${base.includes("?") ? "&" : "?"}${marcas}`
      : base
    : "";

  async function copiar() {
    try {
      await navigator.clipboard.writeText(pronto);
      setCopiado(true);
      toast.success("Link copiado");
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto abaixo");
    }
  }

  return (
    <Card className="space-y-4 p-5 md:p-6">
      <div className="space-y-1">
        <h2 className="text-base font-bold">Link do anúncio</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Monte aqui o endereço que vai no anúncio. As marcas viajam na URL,
          são guardadas quando a pessoa chega, e ficam gravadas na reserva
          mesmo que ela só compre depois de navegar pelo site.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="destino" className={ROTULO}>
          Endereço do sorteio
        </Label>
        <Input
          id="destino"
          value={endereco}
          onChange={(e) => setEndereco(e.target.value)}
          placeholder="https://queotaskin.com/ak-47-redline"
          className="h-11"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {SUGESTOES.map((s) => (
          <div key={s.campo} className="space-y-1.5">
            <Label htmlFor={s.campo} className={ROTULO}>
              {s.campo}
            </Label>
            <Input
              id={s.campo}
              value={valores[s.campo] ?? ""}
              onChange={(e) =>
                setValores((v) => ({ ...v, [s.campo]: e.target.value }))
              }
              placeholder={s.exemplo}
              className="h-11"
            />
            <p className="text-[11px] text-muted-foreground">{s.ajuda}</p>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Label className={ROTULO}>Link pronto</Label>
        <p
          className={cn(
            "min-h-11 select-all break-all rounded-lg border bg-muted/40 px-3 py-2.5 font-mono text-xs",
            pronto ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {pronto || "Preencha o endereço do sorteio acima"}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={copiar} disabled={!pronto} variant="outline">
            {copiado ? (
              <Check className="mr-1.5 h-4 w-4" />
            ) : (
              <Copy className="mr-1.5 h-4 w-4" />
            )}
            {copiado ? "Copiado" : "Copiar link"}
          </Button>
          {pronto && (
            <a
              href={pronto}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-muted"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Abrir
            </a>
          )}
        </div>
      </div>
    </Card>
  );
}

"use client";

// A tela de rastreamento: os pixels e o montador de link com marcas de origem.
//
// As duas metades respondem perguntas diferentes da mesma dúvida. Os pixels
// dizem para a plataforma de anúncio o que aconteceu no site, e é assim que
// ela aprende a quem mostrar o anúncio. As marcas de origem ficam gravadas na
// reserva, e é assim que o painel sabe de qual campanha veio cada venda sem
// depender do que a plataforma reporta.

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PainelDeAnalytics,
  type IdsDeAnalytics,
} from "@/components/admin/painel-de-analytics";
import { cn } from "@/lib/utils";

const ROTULO =
  "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

export function FormularioDeAnuncios({ ids }: { ids: IdsDeAnalytics }) {
  return (
    <div className="space-y-6">
      <Secao
        titulo="Ferramentas de medição"
        descricao="Cada ferramenta entra no site só depois de receber um identificador. Sem id, nenhum script de terceiro é carregado para quem compra."
      >
        <PainelDeAnalytics inicial={ids} />
      </Secao>

      <Secao
        titulo="Link do anúncio"
        descricao="As marcas de origem viajam na URL e ficam gravadas na reserva, mesmo que a pessoa só compre depois de navegar pelo site."
      >
        <MontadorDeLink />
      </Secao>
    </div>
  );
}

/** Um bloco da página, com o título fora dos cards para agrupar os três. */
function Secao({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {titulo}
      </h2>
      <p className="mb-3 mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
        {descricao}
      </p>
      {children}
    </section>
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
          <Button
            onClick={copiar}
            disabled={!pronto}
            variant="outline"
            className="min-h-11"
          >
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
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-muted"
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

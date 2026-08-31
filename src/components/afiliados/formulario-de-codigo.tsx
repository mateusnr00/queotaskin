"use client";

// "Alguém te indicou?", para quem criou conta antes de receber o link.
//
// O caminho normal é o cookie: quem chega por /?ref=CODIGO já sai do cadastro
// vinculado, sem digitar nada. Este formulário existe para o caso comum de
// quem criou conta primeiro e recebeu o código depois, no grupo.
//
// Uma vez vinculado, some da tela: o vínculo não troca, e deixar o campo ali
// prometeria uma escolha que o servidor recusa.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2 } from "lucide-react";

import { aplicarCodigoDeIndicacaoAction } from "@/server/actions/afiliados";
import { normalizarCodigo } from "@/lib/afiliados";
import { Input } from "@/components/ui/input";
import { Moldura } from "@/components/ui/moldura";

export function FormularioDeCodigo() {
  const router = useRouter();
  const [codigo, setCodigo] = useState("");
  const [enviando, startTransition] = useTransition();

  function enviar() {
    startTransition(async () => {
      const r = await aplicarCodigoDeIndicacaoAction(codigo);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Pronto! Você foi vinculado a ${r.data.codigo}.`);
      setCodigo("");
      router.refresh();
    });
  }

  return (
    <Moldura>
      <section className="space-y-3 p-5 md:p-6">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <Link2 aria-hidden className="h-4 w-4 text-muted-foreground" />
          Alguém te indicou?
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Digite o código de quem te trouxe. Vale uma vez só: depois de
          registrado, o vínculo não muda.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={codigo}
            onChange={(e) => setCodigo(normalizarCodigo(e.target.value))}
            placeholder="Ex.: MATEUS7K"
            className="font-mono tracking-widest uppercase"
            maxLength={20}
            disabled={enviando}
          />
          <button
            type="button"
            onClick={enviar}
            disabled={enviando || codigo.length < 4}
            className="h-10 shrink-0 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-95 disabled:opacity-60"
          >
            {enviando ? "Aplicando..." : "Aplicar"}
          </button>
        </div>
      </section>
    </Moldura>
  );
}

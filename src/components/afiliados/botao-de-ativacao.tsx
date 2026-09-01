"use client";

// "Quero ser afiliado", e acabou.
//
// Sem fila, sem aprovação, sem formulário: o programa não dá dinheiro nem
// acesso a dado de ninguém, dá cupom quando alguém que a pessoa trouxe paga de
// verdade. Uma tela de "aguarde a análise" só perderia quem se interessou no
// minuto em que leu a regra.
//
// O clique cria o afiliado, gera o código e o link, e a própria página se
// redesenha já com eles. Nenhum cupom nasce aqui.

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

import { quereSerAfiliadoAction } from "@/server/actions/afiliados";

export function BotaoDeAtivacao() {
  const router = useRouter();
  const [enviando, startTransition] = useTransition();

  function ativar() {
    startTransition(async () => {
      const r = await quereSerAfiliadoAction();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Pronto! Seu código é ${r.data.codigo}.`);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={ativar}
      disabled={enviando}
      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-black tracking-wide text-primary-foreground uppercase transition-opacity hover:opacity-95 disabled:opacity-60 sm:w-auto"
    >
      <Sparkles aria-hidden className="h-4 w-4" />
      {enviando ? "Ativando..." : "Quero ser afiliado"}
    </button>
  );
}

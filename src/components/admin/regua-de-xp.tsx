"use client";

// A régua de XP do painel, no Admin → Ranking.
//
// O número já aparecia nesta página ("R$ 1 pago = 10 XP"), mas só como
// leitura: não havia por onde mudá-lo, e o crédito de XP nem olhava para ele,
// usava uma constante própria. Agora é o mesmo número nos dois lados, e este
// campo é onde ele se decide.
//
// O AVISO NÃO É DECORAÇÃO.
//
// Mexer aqui muda a economia inteira do rank, e a escada de níveis é uma
// tabela fixa em XP: dobrar a régua é dobrar a velocidade de todo mundo daqui
// para a frente. Quem está prestes a salvar precisa ler isso antes, e não
// descobrir depois.

import { useState, useTransition } from "react";
import { Gauge } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SecaoDoFormulario } from "@/components/admin/secao-de-formulario";
import { salvarReguaDeXpAction } from "@/server/actions/regua-de-xp";

export function ReguaDeXp({ inicial }: { inicial: number }) {
  const [valor, setValor] = useState(String(inicial));
  const [salvando, iniciar] = useTransition();

  const numero = Number(valor);
  const valido = Number.isInteger(numero) && numero >= 1 && numero <= 100;
  const mudou = numero !== inicial;

  function salvar() {
    iniciar(async () => {
      const r = await salvarReguaDeXpAction({ xpPerBrl: numero });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Régua salva: R$ 1 = ${r.data.xpPerBrl} XP`);
    });
  }

  return (
    <SecaoDoFormulario
      titulo="Régua de XP"
      descricao="Quanto XP cada real pago credita. Vale para o crédito das compras e para a barra de progresso, que são o mesmo número."
      icone={<Gauge className="h-4 w-4" />}
    >
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-semibold" htmlFor="xp-por-real">
          R$ 1 pago vale
        </label>
        <Input
          id="xp-por-real"
          value={valor}
          onChange={(e) => setValor(e.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
          className="h-9 w-20 font-mono"
          aria-describedby="xp-por-real-ajuda"
        />
        <span className="text-xs text-muted-foreground">XP</span>
        <Button
          type="button"
          size="sm"
          className="h-9"
          disabled={salvando || !valido || !mudou}
          onClick={salvar}
        >
          {salvando ? "Salvando..." : "Salvar régua"}
        </Button>
      </div>

      <p
        id="xp-por-real-ajuda"
        className="text-[11px] leading-relaxed text-muted-foreground"
      >
        Vale só para compras novas. O XP já creditado não é recalculado, e cada
        lançamento guarda a régua com que foi feito: a compra de ontem continua
        explicável depois que a de hoje passa a valer outra coisa.
      </p>

      {mudou && valido && (
        <p className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-[11px] leading-relaxed text-amber-500">
          Os níveis são degraus fixos de XP, então mudar a régua muda a
          velocidade de todo mundo. Com {numero} XP por real, o nível 1 passa a
          sair por R$ {Math.ceil(1000 / numero).toLocaleString("pt-BR")} e o
          nível 21 por R$ {Math.ceil(300_000 / numero).toLocaleString("pt-BR")},
          antes dos multiplicadores.
        </p>
      )}
    </SecaoDoFormulario>
  );
}

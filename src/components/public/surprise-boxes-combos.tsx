import { Gift } from "lucide-react";

import { CaixaSurpresaArte } from "@/components/public/caixa-surpresa-arte";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";

// Degraus de caixa surpresa na página da campanha.
//
// Os degraus já existiam no painel e eram usados para CRIAR as caixas
// depois do pagamento, mas nunca apareciam no site. Quem estava decidindo
// quantos números comprar não tinha como saber que 25 rendem mais caixa por
// título do que 10, que é a razão de o degrau existir.
//
// O texto muda com o modo, e isso não é detalhe de escrita. Sem acumular, o
// sistema aplica só o MAIOR degrau alcançado, então dizer "a cada 10
// títulos" prometeria duas caixas a quem compra 20 e entregaria uma.
// Acumulando, os degraus somam e a promessa é outra.

export interface ComboPublico {
  titulos: number;
  caixas: number;
  destaque: boolean;
}

export function SurpriseBoxesCombos({
  combos,
  precoPorNumero,
  acumulativo,
}: {
  combos: ComboPublico[];
  precoPorNumero: number;
  /** true = os degraus somam; false = vale só o maior alcançado. */
  acumulativo: boolean;
}) {
  if (combos.length === 0) return null;

  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4 md:p-5">
      <div className="flex items-center justify-between gap-3">
        {/* Título e regra empilhados, não na mesma linha: com a arte ocupando
            80px à direita, "vale o maior degrau" quebrava no meio na largura
            do celular. */}
        <div className="min-w-0">
          <h2 className="text-base font-bold">Caixas surpresas</h2>
          <p className="text-xs text-muted-foreground">
            {acumulativo ? "os degraus somam" : "vale o maior degrau"}
          </p>
        </div>
        {/* A caixa em si, e não só a palavra. Quem chega na campanha sem
            saber o que é uma caixa surpresa entende pela figura antes de ler
            os degraus. */}
        <CaixaSurpresaArte tamanho={80} className="-my-2" />
      </div>

      <ul className="space-y-2">
        {combos.map((c) => (
          <li
            key={c.titulos}
            className={cn(
              "flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5",
              c.destaque
                ? "border-primary/60 bg-primary/10"
                : "border-border bg-muted/30"
            )}
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {acumulativo ? "A cada" : "A partir de"}
              </p>
              <p className="text-base font-extrabold leading-tight">
                {c.titulos.toLocaleString("pt-BR")}{" "}
                {c.titulos === 1 ? "título" : "títulos"}
              </p>
              <p className="text-xs tabular-nums text-muted-foreground">
                {formatBRL(precoPorNumero * c.titulos)}
              </p>
            </div>

            <div className="shrink-0 text-right">
              <p className="flex items-center justify-end gap-1.5 text-base font-extrabold leading-tight text-primary">
                {c.caixas.toLocaleString("pt-BR")}{" "}
                {c.caixas === 1 ? "caixa" : "caixas"}
                <Gift className="h-4 w-4" />
              </p>
              <p className="text-[11px] text-muted-foreground">
                {c.caixas === 1 ? "1 chance" : `${c.caixas} chances`} de
                contemplação
              </p>
            </div>
          </li>
        ))}
      </ul>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        As caixas ficam disponíveis para abrir logo depois do pagamento
        confirmado, no seu comprovante.
      </p>
    </section>
  );
}

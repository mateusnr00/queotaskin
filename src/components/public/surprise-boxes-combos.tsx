import { CaixaSurpresaArte } from "@/components/public/caixa-surpresa-arte";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";

// Degraus de caixa surpresa na página da campanha.
//
// Os degraus já existiam no painel e eram usados para CRIAR as caixas
// depois do pagamento, mas nunca apareciam no site. Quem estava decidindo
// quantos números comprar não tinha como saber que 30 rendem mais caixa por
// título do que 10, que é a razão de o degrau existir.
//
// A regra do modo, "a cada" contra "a partir de", fica colada no número de
// títulos de cada degrau, e não numa legenda no cabeçalho. Isso não é
// economia de texto: sem acumular, o sistema aplica só o MAIOR degrau
// alcançado, então "a cada 10 títulos" prometeria duas caixas a quem compra
// 20 e entregaria uma. A regra precisa estar onde o número está.
//
// Vira grade a partir de sm. Em linha corrida no desktop sobravam
// oitocentos pixels de vazio no meio de cada degrau, com o número de um
// lado e a caixa do outro, e era daí que vinha a maior parte da sensação de
// página pobre. Em grade os três ficam lado a lado e dá para comparar de
// relance, que é o que a pessoa quer fazer ali.
//
// A ordem dentro do card também mudou. Antes o degrau começava pelo que
// custa, "a partir de 30 títulos", e terminava no que ganha. Agora abre
// pelo que ganha: "5 caixas" é o motivo de o bloco existir, o resto é
// condição.

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
      <h2 className="text-base font-bold">Caixas surpresas</h2>

      <ul
        className={cn(
          "grid gap-2",
          combos.length === 2 && "sm:grid-cols-2",
          combos.length >= 3 && "sm:grid-cols-3"
        )}
      >
        {combos.map((c, i) => (
          <li
            key={c.titulos}
            className={cn(
              "flex items-center gap-3 rounded-xl border px-3 py-2.5",
              // No celular a linha fica deitada, senão três degraus viram
              // uma tela inteira de rolagem. Da grade em diante ela levanta
              // e centraliza, que é o que preenche a coluna.
              "sm:flex-col sm:justify-center sm:gap-1.5 sm:py-4 sm:text-center",
              c.destaque
                ? "contorno-pulsa border-primary/60 bg-primary/10"
                : "border-border bg-muted/30"
            )}
          >
            <CaixaSurpresaArte
              tamanho={44}
              className="caixa-balanca"
              // Escalonado para os três não balançarem em bloco: junto vira
              // tique nervoso da página, defasado vira onda.
              style={{ animationDelay: `${i * 520}ms` }}
            />

            <div className="min-w-0 flex-1 sm:flex-none">
              <p className="text-lg font-extrabold leading-tight text-primary">
                {c.caixas.toLocaleString("pt-BR")}{" "}
                {c.caixas === 1 ? "caixa" : "caixas"}
              </p>
              <p className="text-xs leading-tight text-muted-foreground">
                {acumulativo ? "a cada" : "a partir de"}{" "}
                <span className="font-semibold text-foreground">
                  {c.titulos.toLocaleString("pt-BR")}{" "}
                  {c.titulos === 1 ? "título" : "títulos"}
                </span>
              </p>
            </div>

            <p className="shrink-0 text-sm font-bold tabular-nums sm:mt-0.5 sm:text-base">
              {formatBRL(precoPorNumero * c.titulos)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

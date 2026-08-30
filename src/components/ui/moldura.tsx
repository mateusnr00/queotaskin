/**
 * As peças de desenho compartilhadas: moldura, etiqueta e placa.
 *
 * Nasceram dentro da tela de Entregas, foram para Relatórios e agora servem
 * também a Meus títulos, que é página pública. Por isso saíram de components/
 * admin: copiar seria como as telas divergiriam no primeiro ajuste, alguém
 * mexe no raio de uma e esquece as outras, e o site passa a ter três dialetos.
 *
 * A referência é o cartão de entrar e criar conta (BORDA_DE_AUTH): borda em
 * gradiente, cantos concêntricos e um fio de luz na aresta de cima.
 */

import { cn } from "@/lib/utils";
import { BORDA_DE_AUTH } from "@/components/auth/cartao-de-auth";

/**
 * A casca dupla: borda em gradiente por fora, miolo escuro por dentro.
 *
 * O raio de dentro sai do de fora menos o respiro (1.75rem - 0.375rem), senão
 * os dois arcos não são concêntricos e a peça parece torta de perto.
 *
 * Sem o halo vermelho do cartão de auth de propósito. Lá existe UM cartão
 * focal e o brilho o destaca; aqui são várias molduras empilhadas, e o mesmo
 * halo repetido vira um borrão vermelho atrás de tudo.
 */
export function Moldura({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[1.75rem] border border-transparent p-1.5",
        className,
      )}
      style={BORDA_DE_AUTH}
    >
      <div className="overflow-hidden rounded-[1.375rem] bg-[#0e1013] shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]">
        {children}
      </div>
    </div>
  );
}

/** Diz de que parte do painel a tela é, sem gastar uma linha explicando. */
export function Etiqueta({
  icone,
  children,
}: {
  icone: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-[10px] font-bold tracking-[0.18em] text-red-400 uppercase">
      {icone}
      {children}
    </span>
  );
}

/** O tom de cada placa. O número manda na cor, e a cor avisa antes da leitura. */
export type TomDaPlaca =
  | "neutro"
  | "alerta"
  | "bom"
  | "ruim"
  | "custo"
  | "marca";

const TOM: Record<TomDaPlaca, { caixa: string; valor: string }> = {
  neutro: { caixa: "border-white/10 bg-white/[0.03]", valor: "" },
  alerta: {
    caixa: "border-red-500/40 bg-red-500/[0.07]",
    valor: "text-red-400",
  },
  bom: {
    caixa: "border-emerald-500/30 bg-emerald-500/[0.06]",
    valor: "text-emerald-400",
  },
  ruim: {
    caixa: "border-red-500/40 bg-red-500/[0.07]",
    valor: "text-red-400",
  },
  custo: {
    caixa: "border-amber-500/25 bg-amber-500/[0.05]",
    valor: "text-amber-400",
  },
  /** Métrica que é boa notícia sem ser dinheiro: recorrência, crescimento. */
  marca: {
    caixa: "border-primary/30 bg-primary/[0.06]",
    valor: "text-primary",
  },
};

/**
 * Um número em placa, com rótulo pequeno em cima.
 *
 * `destaque` é para os dois ou três números que respondem a pergunta da tela:
 * eles crescem, e o resto vira contexto em volta. Placas todas do mesmo
 * tamanho obrigam a ler as cinco para achar a que importa.
 */
export function Placa({
  rotulo,
  valor,
  nota,
  icone,
  tom = "neutro",
  destaque,
}: {
  rotulo: string;
  valor: string;
  nota?: string;
  icone: React.ReactNode;
  tom?: TomDaPlaca;
  destaque?: boolean;
}) {
  const t = TOM[tom];
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3",
        t.caixa,
        destaque && "px-5 py-4",
      )}
    >
      <p
        className={cn(
          "flex items-center gap-1.5 text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase",
          tom !== "neutro" && t.valor,
        )}
      >
        {icone}
        {rotulo}
      </p>
      <p
        className={cn(
          "mt-1 font-black tabular-nums",
          destaque ? "text-2xl md:text-3xl" : "text-2xl",
          t.valor,
        )}
      >
        {valor}
      </p>
      {nota && <p className="text-[11px] text-muted-foreground">{nota}</p>}
    </div>
  );
}

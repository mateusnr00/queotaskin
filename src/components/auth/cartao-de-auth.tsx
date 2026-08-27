/**
 * O cartão das telas de entrar e criar conta.
 *
 * A borda é um gradiente de um pixel, feita com um envelope pintado e um
 * miolo opaco por cima, e não com `border` de cor sólida: borda comum não
 * aceita gradiente, e o brilho alaranjado descendo para o vermelho é o que
 * amarra o cartão à arte do painel ao lado.
 *
 * O halo por fora é sombra, então não ocupa espaço no fluxo e os elementos
 * em volta não se deslocam por causa dele.
 *
 * Existe como componente para entrar e criar conta não divergirem: eram dois
 * blocos soltos, cada um com seu espaçamento, e quem ia de uma para a outra
 * via a página inteira se remontar.
 */
export function CartaoDeAuth({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-3xl p-px shadow-[0_0_90px_-24px_rgba(239,68,68,0.55)]"
      style={{
        background:
          "linear-gradient(150deg, rgba(239,68,68,.75), rgba(249,115,22,.35) 45%, rgba(239,68,68,.55))",
      }}
    >
      <div className="rounded-[calc(1.5rem-1px)] bg-card p-6 md:p-8">
        {children}
      </div>
    </div>
  );
}

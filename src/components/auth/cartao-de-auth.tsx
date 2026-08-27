/**
 * O cartão das telas de entrar e criar conta.
 *
 * A borda é um gradiente, e a técnica é background-clip, não um envelope
 * pintado com um miolo opaco por cima.
 *
 * O envelope quebrava nas quinas, e não por descuido de valor: com raio de
 * 26,4px por fora, 23px por dentro e 1px de folga, os dois arcos se
 * encontram no ponto de 45°. Fora dali a faixa aparece; exatamente na quina
 * ela tem largura zero. Acertar o raio de dentro para 25,4px resolveria hoje
 * e voltaria a quebrar no dia em que alguém mudasse --radius, porque a conta
 * fica escrita à mão em dois lugares que ninguém lembra de manter juntos.
 *
 * Com background-clip não há conta nenhuma: um elemento, um raio, uma borda
 * de 1px transparente. O gradiente pinta até a borda (border-box) e a cor do
 * cartão pinta até o miolo (padding-box). O navegador calcula os dois arcos
 * a partir do mesmo raio, então a faixa tem a mesma espessura em cima, do
 * lado e na quina, com qualquer raio e em qualquer tela.
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
      className="rounded-3xl border border-transparent p-6 shadow-[0_0_90px_-24px_rgba(239,68,68,0.55)] md:p-8"
      style={{
        background:
          "linear-gradient(var(--card), var(--card)) padding-box, linear-gradient(150deg, rgba(239,68,68,.75), rgba(249,115,22,.35) 45%, rgba(239,68,68,.55)) border-box",
      }}
    >
      {children}
    </div>
  );
}

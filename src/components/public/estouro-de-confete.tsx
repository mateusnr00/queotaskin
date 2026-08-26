// O estouro que cobre a caixa no momento em que ela abre.
//
// Duas camadas com papéis distintos. O clarão é um disco que cresce e cobre
// a caixa inteira: é ele que esconde a troca entre "caixa fechada" e
// "resultado", porque confete espalhado deixa vão entre um papel e outro, e
// pelo vão dá para ver o corte acontecendo. Os papéis são a festa em cima
// disso.
//
// As trajetórias são fixas, calculadas uma vez quando o módulo carrega, e
// não sorteadas a cada montagem. Sorteio aqui traria duas coisas ruins:
// diferença entre o que o servidor desenha e o que o navegador desenha, e
// eventualmente um estouro feio, com metade dos papéis para o mesmo lado.
// Ângulo distribuído com variação por índice dá espalhamento parelho sempre.
//
// O papel voa para fora da linha de propósito, e a linha não corta o que
// escapa: estouro que para na borda parece porta abrindo, não explosão.

const CORES = [
  "#f59e0b", // âmbar, a cor do engradado
  "#ef4444", // vermelho, a cor do laço
  "#fbbf24",
  "#ffffff",
  "#fb923c",
  "#dc2626",
];

const QUANTIDADE = 30;

const PARTICULAS = Array.from({ length: QUANTIDADE }, (_, i) => {
  // A variação por índice desencosta os papéis do desenho de estrela que
  // ângulos perfeitamente regulares produzem, sem virar sorteio.
  const angulo = (i * 360) / QUANTIDADE + ((i * 37) % 23) - 11;
  const radianos = (angulo * Math.PI) / 180;
  const distancia = 60 + ((i * 53) % 54);
  return {
    dx: `${(Math.cos(radianos) * distancia).toFixed(1)}px`,
    dy: `${(Math.sin(radianos) * distancia).toFixed(1)}px`,
    giro: `${((i * 79) % 400) - 200}deg`,
    atraso: (i % 5) * 20,
    cor: CORES[i % CORES.length]!,
    largura: 6 + (i % 3) * 2,
    altura: 10 + (i % 4) * 3,
    redondo: i % 4 === 0,
  };
});

export function EstouroDeConfete({
  x,
  atraso,
}: {
  /** Distância da borda esquerda da linha até o centro da caixa, em px. */
  x: number;
  /** Quando estourar, em ms depois da montagem. Casa com o fim do tremor. */
  atraso: number;
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 overflow-visible"
    >
      {/* Âncora sem tamanho no centro da caixa. Os filhos se centram nela
          pelo translate(-50%, -50%) dos keyframes. */}
      <div className="absolute top-1/2" style={{ left: x }}>
        <span
          className="estouro-clarao absolute block h-20 w-20 rounded-full"
          style={{
            animationDelay: `${atraso}ms`,
            background:
              "radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(251,191,36,0.85) 45%, rgba(249,115,22,0) 72%)",
          }}
        />
        {PARTICULAS.map((p, i) => (
          <span
            key={i}
            className="confete-voa absolute block"
            style={
              {
                "--dx": p.dx,
                "--dy": p.dy,
                "--giro": p.giro,
                animationDelay: `${atraso + p.atraso}ms`,
                background: p.cor,
                width: p.largura,
                height: p.altura,
                borderRadius: p.redondo ? "9999px" : "2px",
              } as React.CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}

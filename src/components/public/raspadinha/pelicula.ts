// A película metálica da raspadinha, pintada no canvas.
//
// Nada aqui é "background: gray". Uma raspadinha física tem uma folha de
// alumínio impressa, e o que a faz parecer metal são quatro coisas somadas:
// um gradiente que não é linear, granulado fino, manchas de luminosidade
// maiores que o granulado, e um brilho que se move com a luz.
//
// Tudo desenhado em canvas, e não em CSS, por um motivo prático: é a mesma
// superfície que o gesto apaga com destination-out. Uma película em CSS por
// cima do canvas não seria apagada pelo dedo.

/** Champanhe e prata, as duas cores da folha. */
const PRATA_ESCURA = "#8a8578";
const PRATA = "#c9c2b0";
const CHAMPANHE = "#e6dcc4";
const BRILHO = "#f7f2e4";

/**
 * Pinta a película inteira.
 *
 * `luz` é a posição horizontal do brilho, de 0 a 1. Ela acompanha o ponteiro
 * no desktop; sem ponteiro fica no meio.
 */
export function desenharPelicula(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  luz = 0.5,
) {
  // 1. O gradiente de base, na diagonal. Cinco paradas e não duas: metal
  //    escovado tem faixa clara, faixa escura e o retorno, e dois pontos só
  //    produzem a rampa lisa que denuncia plástico.
  const base = ctx.createLinearGradient(0, 0, w, h);
  base.addColorStop(0, PRATA_ESCURA);
  base.addColorStop(0.25, PRATA);
  base.addColorStop(0.45, CHAMPANHE);
  base.addColorStop(0.62, PRATA);
  base.addColorStop(0.82, CHAMPANHE);
  base.addColorStop(1, PRATA_ESCURA);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  // 2. Manchas largas de luminosidade. São o que impede a superfície de
  //    parecer uniforme quando o dedo tira só um pedaço.
  for (let i = 0; i < 7; i++) {
    const cx = ((i * 137.5) % 100) / 100;
    const cy = ((i * 61.8) % 100) / 100;
    const raio = Math.max(w, h) * (0.18 + ((i * 7) % 5) * 0.05);
    const mancha = ctx.createRadialGradient(
      cx * w, cy * h, 0,
      cx * w, cy * h, raio,
    );
    const claro = i % 2 === 0;
    mancha.addColorStop(0, claro ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.10)");
    mancha.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = mancha;
    ctx.fillRect(0, 0, w, h);
  }

  // 3. O brilho que segue a luz. Estreito e inclinado, como o reflexo de uma
  //    lâmpada numa folha metálica.
  const faixa = ctx.createLinearGradient(
    (luz - 0.22) * w, 0,
    (luz + 0.22) * w, h,
  );
  faixa.addColorStop(0, "rgba(255,255,255,0)");
  faixa.addColorStop(0.5, "rgba(255,255,255,0.30)");
  faixa.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = faixa;
  ctx.fillRect(0, 0, w, h);

  // 4. O granulado. Retângulos de 1px em vez de ImageData porque o custo é
  //    uma fração e, nesta densidade, olho nenhum distingue os dois.
  //    Determinístico de propósito: com Math.random, cada repintura mudaria
  //    a textura e a película pareceria piscar ao girar o telefone.
  const grãos = Math.min(2600, Math.round(w * h * 0.045));
  for (let i = 0; i < grãos; i++) {
    const s = Math.sin(i * 12.9898) * 43758.5453;
    const x = ((s - Math.floor(s)) * w) | 0;
    const t = Math.sin(i * 78.233) * 43758.5453;
    const y = ((t - Math.floor(t)) * h) | 0;
    const u = Math.sin(i * 39.425) * 43758.5453;
    const claro = u - Math.floor(u) > 0.5;
    ctx.fillStyle = claro ? "rgba(255,255,255,0.11)" : "rgba(0,0,0,0.09)";
    ctx.fillRect(x, y, 1, 1);
  }

  // 5. Linhas diagonais finíssimas, a marca discreta da casa. Quase
  //    invisíveis de perto e perceptíveis no conjunto, que é o que faz uma
  //    superfície impressa parecer impressa.
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = BRILHO;
  ctx.lineWidth = 1;
  for (let x = -h; x < w; x += 9) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + h, h);
    ctx.stroke();
  }
  ctx.restore();

  // 6. Sombra interna nas bordas: dá a impressão de que a folha está colada
  //    numa reentrância do papel, e não pousada por cima dele.
  const borda = ctx.createLinearGradient(0, 0, 0, h);
  borda.addColorStop(0, "rgba(0,0,0,0.22)");
  borda.addColorStop(0.12, "rgba(0,0,0,0)");
  borda.addColorStop(0.88, "rgba(0,0,0,0)");
  borda.addColorStop(1, "rgba(0,0,0,0.22)");
  ctx.fillStyle = borda;
  ctx.fillRect(0, 0, w, h);
}

/** O texto no meio da película. */
export function desenharChamada(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  texto = "RASPE AQUI",
) {
  const corpo = Math.max(11, Math.min(17, w * 0.055));
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${corpo}px ui-sans-serif, system-ui, sans-serif`;
  // Escrito em duas passadas, escura embaixo e clara em cima: é como texto
  // gravado em relevo se comporta, e uma passada só ficaria plano.
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.letterSpacing = `${corpo * 0.22}px`;
  ctx.fillText(texto, w / 2, h / 2 + 1);
  ctx.fillStyle = "rgba(60,52,32,0.55)";
  ctx.fillText(texto, w / 2, h / 2);
  ctx.restore();
}

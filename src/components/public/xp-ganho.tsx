// Quanto a conta andou com esta compra, mostrado no comprovante pago.
//
// Existe porque o XP era invisível no momento em que ele acontece. A pessoa
// pagava, ganhava XP e só descobriria isso se fosse até "Minha conta" por
// conta própria. Mostrar aqui fecha o ciclo no único instante em que ela está
// olhando e sabe que acabou de fazer algo.
//
// Componente de servidor: não tem estado nem interação, e o cálculo todo já
// vem pronto de quem renderiza.
//
// O DESENHO É EM TRÊS COLUNAS
//
// Emblema, texto e o ganho. Antes era o selo de patente ao lado de um bloco
// com nome, barra e frase, e o número do XP, que é a notícia, dividia a linha
// de cima com o rótulo "Sua conta avançou". Agora o ganho tem uma coluna só
// dele, separada por um fio, e é a única coisa grande do cartão à direita:
// quem bate o olho lê "+180 XP" antes de qualquer outra coisa.
//
// A COR VEM DO TEMA, O EMBLEMA NÃO
//
// O acento (fio da esquerda, barra, número do ganho) é var(--primary), e não
// um vermelho fixo, porque cada tenant escolhe a paleta em Personalizar tema:
// com a cor cravada no código, uma loja de tema azul ganharia um cartão
// vermelho no meio da tela. Já o emblema é azul fixo de propósito: ele é o
// símbolo do XP, como o verde é o do pagamento confirmado, e não muda de cor
// junto com a marca.

import { rankProgress } from "@/lib/rank";

export function XpGanho({
  ganho,
  total,
  xpPerBrl,
}: {
  /** XP creditado por esta compra. */
  ganho: number;
  /** XP acumulado depois dela. */
  total: number;
  xpPerBrl: number;
}) {
  // Nada creditado, nada a dizer. Acontece em sorteio gratuito e quando o
  // rank está desligado no painel, e um "+0 XP" ali seria pior do que a
  // ausência do bloco: parece defeito.
  if (ganho <= 0) return null;

  const depois = rankProgress(total, xpPerBrl);
  const antes = rankProgress(Math.max(0, total - ganho), xpPerBrl);

  // O rótulo é o que a pessoa lê na tela, e comparar por ele cobre os dois
  // tipos de degrau numa checagem só: "Prata Elite" vira "Ouro I", e "Lenda
  // Global" vira "MVP".
  const subiu = antes.rank.label !== depois.rank.label;

  return (
    <div className="xp-cartao xp-entra relative flex items-center gap-2.5 overflow-hidden rounded-2xl border p-3.5 sm:gap-4 sm:p-5">
      {/* O fio de luz da esquerda, na cor da marca. Mesma ideia da faixa de
          preço da campanha: marca a borda do cartão sem fechar uma moldura
          colorida em volta dele. */}
      <span aria-hidden className="xp-fio absolute inset-y-[20%] left-0 w-0.5" />

      <EmblemaDeXp />

      <div className="min-w-0 flex-1">
        <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground sm:text-xs">
          {/* Visto verde, do tamanho de um acento. A página inteira já diz
              "pagamento confirmado" no cabeçalho, então aqui a linha diz o
              que ESTE cartão veio contar: o XP entrou. */}
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10 text-[9px] font-bold text-emerald-500 dark:text-emerald-400">
            ✓
          </span>
          XP creditado
        </p>

        <h3 className="text-pretty text-[15px] font-bold leading-tight tracking-tight sm:text-base">
          {subiu ? (
            <>
              Você subiu para{" "}
              <span style={{ color: depois.rank.color }}>
                {depois.rank.label}
              </span>
            </>
          ) : (
            <>
              Sua compra rendeu <span className="text-primary">XP</span>
            </>
          )}
        </h3>

        <p className="mt-1 text-pretty text-[11px] leading-snug text-muted-foreground sm:text-xs">
          {subiu
            ? `Antes você estava em ${antes.rank.label}.`
            : `Você está em ${depois.rank.label}, com ${total.toLocaleString("pt-BR")} XP.`}
        </p>

        {/* A BARRA E A PORCENTAGEM.

            A barra sai do servidor já na largura final, então a transição de
            CSS nunca dispara: quem faz ela correr é a animação `barra-cresce`,
            que interpola de zero até a largura que o elemento já tem. É o
            mesmo recurso da barra de vendas da campanha, e é o que mantém o
            valor certo para quem está sem JavaScript. */}
        <div className="mt-2.5 flex items-center gap-2.5">
          <div
            role="progressbar"
            aria-valuenow={Math.round(depois.percent)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={
              depois.atMax
                ? "Patente máxima"
                : `Progresso para ${depois.nextLabel}`
            }
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
          >
            <span
              className="xp-barra barra-cresce block h-full rounded-full"
              style={{ width: `${Math.min(100, Math.max(0, depois.percent))}%` }}
            />
          </div>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {Math.round(depois.percent)}%
          </span>
        </div>

        <p className="mt-1.5 text-pretty text-[11px] leading-snug text-muted-foreground">
          {depois.atMax ? (
            "Você está na patente máxima."
          ) : (
            <>
              Faltam{" "}
              <strong className="font-semibold text-foreground tabular-nums">
                {depois.xpToNext.toLocaleString("pt-BR")} XP
              </strong>{" "}
              para {depois.nextLabel}.
            </>
          )}
        </p>
      </div>

      {/* O GANHO, na coluna da direita.

          Separado por um fio e não por um cartão dentro do cartão: é a mesma
          notícia, só que o número. `self-stretch` faz o fio ir de borda a
          borda do conteúdo, senão ele ficaria flutuando na altura do texto. */}
      <div className="flex min-w-[66px] shrink-0 flex-col items-end justify-center self-stretch border-l pl-2.5 sm:min-w-[92px] sm:pl-4">
        <span className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-[10px]">
          Você ganhou
        </span>
        <span className="xp-estoura text-base font-extrabold leading-none tabular-nums text-primary sm:text-xl">
          +{ganho.toLocaleString("pt-BR")} XP
        </span>
      </div>
    </div>
  );
}

/**
 * O emblema do XP.
 *
 * Divisas, colchetes laterais e a estrela: é a gramática de insígnia que o
 * jogador já lê como patente, e por isso ele diz "você subiu" antes de
 * qualquer palavra do cartão. Fica em azul fixo porque representa o XP, e não
 * a marca da loja nem a patente atual: a cor da patente já aparece no nome
 * dela, e um emblema que muda de cor a cada nível deixaria de ser o mesmo
 * símbolo.
 */
function EmblemaDeXp() {
  return (
    <div
      aria-hidden
      className="relative grid h-[52px] w-[52px] shrink-0 place-items-center sm:h-[78px] sm:w-[78px]"
    >
      <svg viewBox="0 0 100 100" fill="none" className="h-full w-full">
        <path
          d="M23 31L50 15L77 31"
          stroke="#68C9FF"
          strokeWidth="8"
          strokeLinecap="square"
        />
        <path d="M28 43L50 30L72 43" stroke="#68C9FF" strokeWidth="7" />
        <path d="M18 35L10 40V73L21 80" stroke="#68C9FF" strokeWidth="7" />
        <path d="M82 35L90 40V73L79 80" stroke="#68C9FF" strokeWidth="7" />
        <path
          d="M50 43L56 57L72 58L60 68L64 84L50 75L36 84L40 68L28 58L44 57Z"
          fill="#68C9FF"
        />
      </svg>
      <span className="absolute bottom-0.5 text-[10px] font-black leading-none tracking-wide text-[#66c8ff] sm:text-[13px]">
        XP
      </span>
    </div>
  );
}

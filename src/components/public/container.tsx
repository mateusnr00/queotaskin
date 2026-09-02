// A largura do conteúdo das páginas públicas.
//
// Cada página tinha a sua: a home em 4xl dentro de 6xl, "sorteios" e "meus
// títulos" em 3xl, "minha conta" e "afiliados" em 5xl. Navegar entre elas
// fazia o conteúdo estreitar e alargar a cada clique, como se cada tela fosse
// de um site diferente, e o cabeçalho (que é o mesmo em todas) ficava com
// margens que não batiam com nada abaixo dele.
//
// A medida vem da home, que é a página que define o desenho do site. São duas
// caixas, e não uma: a de fora segura o respiro lateral e vertical, a de
// dentro limita a linha de leitura. Com uma só, o `px-4` entraria na conta do
// máximo e o conteúdo ficaria 32px mais estreito que na home em tela grande.
//
// Quem precisar de uma largura diferente passa `largura`, e isso fica visível
// na página em vez de escondido numa classe inventada no meio do JSX.

import { cn } from "@/lib/utils";

/** As larguras que o site usa, para ninguém escrever `max-w-` na mão. */
const LARGURAS = {
  /** O padrão, e a medida da home. */
  leitura: "max-w-4xl",
  /** Para tela de tabela ou grade, que sufoca em 4xl. */
  larga: "max-w-6xl",
} as const;

export function ContainerPublico({
  children,
  largura = "leitura",
  className,
}: {
  children: React.ReactNode;
  largura?: keyof typeof LARGURAS;
  className?: string;
}) {
  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 md:py-10">
      <div className={cn("mx-auto", LARGURAS[largura], className)}>
        {children}
      </div>
    </div>
  );
}

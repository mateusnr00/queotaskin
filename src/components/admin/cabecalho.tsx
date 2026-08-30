import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Etiqueta } from "@/components/ui/moldura";

/**
 * O cabeçalho das telas do painel.
 *
 * Existia um por página, cada um com o seu tamanho de título e a sua migalha
 * montada à mão: "Clientes" era 2xl, "Catálogo de skins" era xl, o painel
 * inicial usava outra escala de cor. Diferença sem intenção é o que faz um
 * painel parecer remendo, e era ela que se via ao navegar de uma tela para a
 * outra.
 *
 * A etiqueta em cima diz de que parte do painel a tela é, sem gastar uma linha
 * de texto explicando.
 */
export function CabecalhoDeAdmin({
  etiqueta,
  icone,
  titulo,
  descricao,
  migalha = [],
  acoes,
}: {
  etiqueta: string;
  icone: React.ReactNode;
  titulo: React.ReactNode;
  descricao?: React.ReactNode;
  /** Do mais geral ao mais específico. O último item é a página atual. */
  migalha?: { rotulo: string; href?: string }[];
  acoes?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <Etiqueta icone={icone}>{etiqueta}</Etiqueta>
        <h1 className="mt-2 text-2xl font-black tracking-tight md:text-3xl">
          {titulo}
        </h1>
        {descricao && (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {descricao}
          </p>
        )}
        {migalha.length > 0 && (
          <nav
            aria-label="Você está aqui"
            className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"
          >
            {migalha.map((item, i) => (
              <span key={item.rotulo} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRight aria-hidden className="h-3 w-3" />}
                {item.href ? (
                  <Link href={item.href} className="hover:text-foreground">
                    {item.rotulo}
                  </Link>
                ) : (
                  <span>{item.rotulo}</span>
                )}
              </span>
            ))}
          </nav>
        )}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </header>
  );
}

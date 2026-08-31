// Um bloco de campos com nome, dentro das abas de editar campanha.
//
// A aba Geral era um cartão único com dezoito campos em fila, todos do mesmo
// tamanho e sem um respiro: título, URL, descrição, privacidade, categoria,
// modelo de reserva, modalidade, datas, sete chaves. Para achar "data do
// sorteio" era preciso ler tudo, porque nada dizia onde uma coisa acabava e a
// outra começava, e assuntos diferentes ficavam colados (o texto que o
// comprador lê no meio das regras de venda).
//
// Cada seção agora responde a uma pergunta e diz qual é logo no topo.

import { Moldura } from "@/components/ui/moldura";

export function SecaoDoFormulario({
  titulo,
  descricao,
  icone,
  children,
}: {
  titulo: string;
  descricao?: string;
  icone?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Moldura>
      <div className="space-y-4 p-4 md:p-5">
        <div className="flex items-start gap-3">
          {icone && (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-muted-foreground">
              {icone}
            </span>
          )}
          <div className="min-w-0">
            <h3 className="text-sm font-bold">{titulo}</h3>
            {descricao && (
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {descricao}
              </p>
            )}
          </div>
        </div>
        <div className="space-y-4">{children}</div>
      </div>
    </Moldura>
  );
}

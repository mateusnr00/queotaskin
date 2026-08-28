// O preço da campanha, na primeira dobra.
//
// Era uma faixa com rótulo à esquerda e valor à direita, os dois no mesmo
// peso de linha de tabela. Lia como ficha técnica, e preço não é ficha
// técnica: é o argumento que decide a compra, e é a informação que a pessoa
// veio buscar quando abriu a página.
//
// Três mudanças, em ordem de importância:
//
//   o número manda      passa a ser o maior elemento do bloco, com o "R$"
//                       menor ao lado. Antes empatava em altura com o
//                       rótulo cinza ao lado dele.
//   diz por unidade     "R$ 1,50" sozinho não responde "por quê?". Podia
//                       ser o total do sorteio, e essa dúvida trava a
//                       compra. Agora está escrito.
//   liga no botão       o mesmo laranja do "Quero participar", para o olho
//                       ir do preço ao botão em vez de tratar os dois como
//                       blocos separados.
//
// Sem animação aqui de propósito. O movimento desta dobra fica todo na barra
// de progresso: espalhar brilho por vários elementos ao mesmo tempo cansa e
// tira o sentido de cada um.

export function PrecoDaCampanha({
  preco,
  unidade = "por número",
}: {
  /** Já formatado, com o símbolo. */
  preco: string;
  unidade?: string;
}) {
  // O símbolo sai do número para poder ter tamanho próprio: "R$" na mesma
  // altura do valor rouba peso do que interessa.
  const casa = preco.match(/^(R\$)\s*(.+)$/);
  const simbolo = casa?.[1] ?? "";
  const valor = casa?.[2] ?? preco;

  return (
    <div className="relative overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-br from-primary/[0.13] via-primary/[0.06] to-transparent px-4 py-3 md:px-5">
      {/* O fio na borda esquerda, na cor do botão: é o que amarra preço e
          ação sem precisar de mais uma caixa colorida. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-primary to-primary/40"
      />
      <div className="flex items-center justify-between gap-3 pl-1.5">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Por apenas
          </p>
          <p className="text-xs font-medium text-muted-foreground">{unidade}</p>
        </div>
        <p className="flex shrink-0 items-baseline gap-1 text-primary">
          <span className="text-base font-bold md:text-lg">{simbolo}</span>
          <span className="text-3xl font-extrabold tabular-nums tracking-tight md:text-4xl">
            {valor}
          </span>
        </p>
      </div>
    </div>
  );
}

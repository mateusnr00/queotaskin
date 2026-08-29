// O emblema do time, do tamanho de um selo, ao lado do nome da pessoa.
//
// A REGRA QUE MANDA AQUI
//
// Ele funciona sem imagem nenhuma. Enquanto o time não tiver escudo no
// registro, o emblema desenha a TAG sobre a cor do time, e isso não é um
// espaço vazio esperando arquivo: é um estado acabado, que cabe na linha e se
// lê de longe. Quando o escudo chegar, ele entra no lugar da TAG e nada mais
// muda, nem o banco, nem quem chama este componente.
//
// Por que assim: escudo de organização é marca registrada, e este site vende
// cotas. Depender do arquivo para a tela existir seria amarrar a funcionalidade
// a uma decisão jurídica que não é deste componente.

import Image from "next/image";

import { cn } from "@/lib/utils";
import { textoSobreACor, type TimeDeCS2 } from "@/lib/times-cs2";

const TAMANHOS = {
  sm: { caixa: "h-4 w-4 text-[7px]", px: 16 },
  md: { caixa: "h-5 w-5 text-[8px]", px: 20 },
  lg: { caixa: "h-9 w-9 text-[11px]", px: 36 },
} as const;

export function EmblemaDoTime({
  time,
  tamanho = "md",
  className,
}: {
  time: TimeDeCS2;
  tamanho?: keyof typeof TAMANHOS;
  className?: string;
}) {
  const { caixa, px } = TAMANHOS[tamanho];

  if (time.escudo) {
    return (
      <Image
        src={time.escudo}
        alt={time.nome}
        width={px}
        height={px}
        className={cn("shrink-0 rounded-[5px] object-contain", caixa, className)}
      />
    );
  }

  return (
    <span
      // O nome do time no title e no aria-label: sem isso a TAG "TMZ" não diz
      // nada a quem não acompanha a cena, nem a um leitor de tela.
      title={time.nome}
      aria-label={time.nome}
      role="img"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[5px] font-black tracking-tight",
        caixa,
        className,
      )}
      style={{
        backgroundColor: time.cor,
        // Preto nos times de cor clara. Branco fixo deixava "NAVI" ilegível
        // sobre o amarelo, abaixo de 2:1.
        color: textoSobreACor(time.cor),
        // O anel interno é o que separa o emblema do fundo escuro do site
        // quando a cor do time também é escura, que é o caso de metade da
        // lista. Sem ele, FURIA e Spirit somem no card.
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.22)",
      }}
    >
      {time.tag.slice(0, 4).toUpperCase()}
    </span>
  );
}

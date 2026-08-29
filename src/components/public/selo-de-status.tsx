import { cn } from "@/lib/utils";

/**
 * O selo laranja da campanha, com o pulso de atenção.
 *
 * Existe como componente porque o mesmo selo aparece em três telas: a home,
 * a lista de campanhas e a página do sorteio. Estava copiado nas três, e uma
 * cópia sempre fica para trás: foi assim que o pulso entrou só na página do
 * sorteio e não na home, que é onde a maioria chega primeiro.
 *
 * O texto vem de statusDaCampanha e é automático nas quatro faixas de venda.
 * Este componente só desenha.
 *
 * Um elemento só, de novo. Chegou a ser três, para um halo poder sair de trás
 * da pílula sem apagar junto com ela. O halo saiu: ele era um segundo
 * movimento competindo com o piscar, e a soma dos dois agitava em vez de
 * chamar atenção. Sem halo, a casca e a camada extra não têm mais o que fazer.
 * O respiro inteiro vive no CSS, em `.selo-pulsa`.
 */
export function SeloDeStatus({
  texto,
  className,
}: {
  texto: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "selo-pulsa inline-flex items-center rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-semibold tracking-wider text-primary-foreground uppercase",
        className
      )}
    >
      {texto}
    </span>
  );
}

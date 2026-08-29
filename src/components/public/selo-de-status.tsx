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
 * SÃO TRÊS ELEMENTOS, E NÃO UM
 *
 * O selo era um `span` só, com a opacidade indo de 1 a 0,45 e voltando. Nunca
 * apagava, e um brilho que só diminui não chama atenção: o olho para de
 * registrar movimento que não tem começo nem fim.
 *
 * Agora a pílula apaga de vez e volta, e um halo sai de trás dela no instante
 * do retorno. O halo precisa ficar FORA do elemento que apaga, senão ele
 * apagaria junto e não haveria halo nenhum. Daí a casca por fora: ela não
 * anima, segura o halo atrás e a pílula na frente.
 *
 * As duas ficam `relative` de propósito. Elemento posicionado pinta depois de
 * conteúdo em linha, então um halo absoluto ao lado de uma pílula estática
 * cobriria o texto; posicionando as duas, quem manda é a ordem no HTML, e a
 * pílula vem depois.
 */
export function SeloDeStatus({
  texto,
  className,
}: {
  texto: string;
  className?: string;
}) {
  return (
    <span className={cn("selo-pulsa", className)}>
      <span aria-hidden className="selo-pulsa-halo" />
      <span className="selo-pulsa-pilula">{texto}</span>
    </span>
  );
}

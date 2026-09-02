// O glifo do WhatsApp.
//
// Escrito à mão porque o lucide, que é a fonte de ícones do resto do site, não
// tem marcas: ele tirou os logos do pacote. Vive num componente só para não
// haver dois WhatsApp diferentes no mesmo site conforme a tela.
//
// DESENHO DE TRAÇO, E NÃO GLIFO CHEIO
//
// Era o logo maciço. Virou contorno: balão e telefone desenhados com a mesma
// espessura de linha do resto da interface, que é toda de ícones lineares
// (lucide). O logo cheio era a única mancha sólida no meio de uma fileira de
// traços, e puxava o olho para o botão de conversar como se ele fosse a ação
// principal da tela, o que ele nunca é.
//
// A ESPESSURA ACOMPANHA O TAMANHO
//
// O traço é medido em unidades da caixa de 64, então ele encolhe junto com o
// ícone: 2.3 é o desenho na medida original, e a 16 pixels isso vira meio
// pixel, que sai da tela lavado. Por isso a espessura entra por propriedade,
// com o padrão pensado para os botões pequenos do painel, e o desenho grande
// pede o valor original.
//
// Herda a cor por currentColor, então serve no botão claro sobre a faixa
// laranja do prêmio e no botão verde do painel.

export function IconeDoWhatsapp({
  className,
  /**
   * Espessura do traço, em unidades da caixa de 64.
   *
   * 4 é o padrão porque o uso mais comum é um botão de 16 a 20 pixels, e ali
   * o traço de 2.3 do desenho original quase some. Em tamanho grande, passe
   * 2.3 para ter a linha fina que o desenho pede.
   */
  strokeWidth = 4,
}: {
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      focusable="false"
    >
      {/* O balão, com a ponta que sobra embaixo à esquerda. */}
      <path d="M32 6C17.6 6 6 17.2 6 31c0 5.2 1.7 10 4.6 14L7 57l12.6-3.4c3.7 1.9 7.9 2.9 12.4 2.9C46.4 56.5 58 45.3 58 31 58 17.2 46.4 6 32 6Z" />
      {/* O telefone de dentro. */}
      <path d="M23.2 18.8c-.9 0-1.7.5-2.2 1.3-1.3 2.1-1.7 4.3-1 6.9 1.5 5.6 6.4 11.5 12 15.1 3.7 2.4 7.8 3.9 10.9 3 1.8-.6 4.3-3.8 4.7-5.6.3-1.2-.3-1.9-1.4-2.5l-6.7-3.2c-1-.5-1.9-.3-2.6.6l-2.4 2.9c-3.3-1.6-5.9-4-7.8-7.1l2.5-2.5c.8-.8 1-1.7.5-2.8l-3.2-4.2c-.8-1.2-1.7-1.9-3.3-1.9Z" />
    </svg>
  );
}

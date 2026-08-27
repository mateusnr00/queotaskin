import Image from "next/image";

import { RARITY_COLOR } from "@/lib/cs2";

// O visual das telas de entrar e criar conta.
//
// O lado esquerdo era um gradiente vazio com a logo num canto e um texto no
// rodapé. Pior que o vazio era o texto: "crie campanhas, gerencie reservas e
// acompanhe as vendas em tempo real" descreve o painel de quem vende, e quem
// cria conta aqui é quem compra. A pessoa lia a promessa de outro produto.
//
// Hoje a arte é o fundo da tela inteira, e não a metade esquerda: dividida
// ao meio ela terminava numa linha vertical no centro do monitor, arte de um
// lado e preto liso do outro, o que fazia a página parecer duas.

/** Espectro das raridades do CS2, do azul ao dourado. */
const ESPECTRO = [
  RARITY_COLOR.MIL_SPEC,
  RARITY_COLOR.RESTRICTED,
  RARITY_COLOR.CLASSIFIED,
  RARITY_COLOR.COVERT,
  RARITY_COLOR.CONTRABAND,
];

/** A faixa de raridades, que é a assinatura visual do CS2. */
export function FaixaDeRaridade({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={className}
      style={{
        background: `linear-gradient(90deg, ${ESPECTRO.join(", ")})`,
      }}
    />
  );
}

/**
 * A arte de fundo das telas de conta, cobrindo a página inteira.
 *
 * `cover` aqui, e não `contain` como quando ela ocupava só uma coluna: em
 * tela cheia a proporção da arte (1,56) é quase a da janela de um monitor
 * comum, então o recorte tira alguns pixels das bordas em vez de serrar as
 * armas ao meio, que era o risco de encaixá-la numa coluna em pé.
 *
 * `fixed` para o fundo não rolar junto com o conteúdo. No celular a tela
 * passa da dobra, e fundo que acompanha a rolagem termina numa faixa preta
 * no fim do caminho.
 *
 * Sem o arquivo, o fundo é desenhado no CSS. O interruptor é explícito de
 * propósito: apontar um <Image> para um arquivo que talvez não exista
 * trocaria a tela por um retângulo quebrado, e ninguém perceberia até
 * alguém abrir a página.
 */
const ARTE_DE_FUNDO = "/auth-fundo.webp";
export const TEM_ARTE_DE_FUNDO = true;

export function FundoDaTela() {
  return (
    <div aria-hidden className="fixed inset-0 bg-black">
      {TEM_ARTE_DE_FUNDO ? (
        <Image
          src={ARTE_DE_FUNDO}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
      ) : (
        <>
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(70% 55% at 30% 45%, rgba(220,38,38,.34), transparent 70%), radial-gradient(50% 40% at 12% 10%, rgba(249,115,22,.20), transparent 72%), linear-gradient(180deg,#0d0b0d,#08080a)",
            }}
          />
          <div
            className="absolute inset-0 opacity-[0.05]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.8) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          />
        </>
      )}

      {/* Véu. O conteúdo fica em cima da arte, e sem ele o texto branco do
          rodapé cairia justo sobre a parte clara das armas. Escurece mais no
          pé, que é onde o texto mora, e menos no meio, onde está o desenho
          que se quer ver. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,.5) 0%, rgba(0,0,0,.2) 35%, rgba(0,0,0,.75) 100%)",
        }}
      />
    </div>
  );
}

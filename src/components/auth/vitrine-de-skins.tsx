import Image from "next/image";

import { prisma } from "@/lib/db";
import { RaffleCover } from "@/components/public/raffle-cover";
import type { SkinWear } from "@prisma/client";

import {
  PROPORCAO_DA_SKIN,
  RARITY_COLOR,
  RARITY_ORDER,
  headlineSkin,
} from "@/lib/cs2";

// O visual das telas de entrar e criar conta.
//
// O lado esquerdo era um gradiente vazio com a logo num canto e um texto no
// rodapé. Pior que o vazio era o texto: "crie campanhas, gerencie reservas e
// acompanhe as vendas em tempo real" descreve o painel de quem vende, e quem
// cria conta aqui é quem compra. A pessoa lia a promessa de outro produto.
//
// Agora o painel é a arte, e a campanha em disputa aparece como ficha dentro
// do cartão do formulário: é a resposta para "o que eu ganho criando conta",
// que é a pergunta da tela. Sai do banco, então acompanha o que está em
// cartaz sem ninguém editar imagem.

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
 * A arte de fundo do painel esquerdo.
 *
 * `contain` e não `cover`, e isso não é detalhe. A arte é deitada, 1565 por
 * 1005, e a coluna é em pé: qualquer recorte que preenchesse a coluna
 * cortaria as pontas das duas armas, e arma serrada ao meio é pior que arte
 * pequena. Como os quatro cantos do arquivo são preto puro, sobre um painel
 * preto a moldura vazia não se vê, e o efeito é o de sangrar até a borda.
 *
 * Sem o arquivo, o fundo é desenhado no CSS. O interruptor é explícito de
 * propósito: apontar um <Image> para um arquivo que talvez não exista
 * trocaria o painel por um retângulo quebrado, e ninguém perceberia até
 * alguém abrir a tela.
 */
const ARTE_DE_FUNDO = "/auth-fundo.webp";
export const TEM_ARTE_DE_FUNDO = true;

export function FundoDoPainel() {
  return (
    <>
      {TEM_ARTE_DE_FUNDO ? (
        // Sem priority de propósito. O painel é `hidden lg:flex`, e uma
        // imagem prioritária seria pré-carregada mesmo escondida: todo
        // visitante de celular pagaria 120KB por uma arte que não vê. Sem
        // ele a carga é preguiçosa, e elemento com display:none nunca cruza
        // a viewport, então no celular ela simplesmente não é buscada.
        <Image
          src={ARTE_DE_FUNDO}
          alt=""
          aria-hidden
          fill
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-contain"
        />
      ) : (
        <>
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(70% 55% at 45% 45%, rgba(220,38,38,.34), transparent 70%), radial-gradient(50% 40% at 15% 12%, rgba(249,115,22,.20), transparent 72%), linear-gradient(180deg,#0d0b0d,#08080a)",
            }}
          />
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.05]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.8) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          />
        </>
      )}
      {/* Vinheta. Segura o contraste do texto que fica no pé do painel, em
          cima de arte que ninguém sabe quão clara vai ser. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,.3) 0%, transparent 28%, rgba(0,0,0,.8) 100%)",
        }}
      />
    </>
  );
}

export type CampanhaEmDestaque = {
  slug: string;
  titulo: string;
  capa: string | null;
  skin: string | null;
  raridade: keyof typeof RARITY_COLOR | null;
  desgaste: SkinWear | null;
  preco: number;
};

/**
 * A campanha de maior raridade em disputa agora. É a mesma leitura que a
 * pessoa já tem dentro do jogo: vermelho vale mais que roxo, dourado é faca.
 */
export async function campanhaEmDestaque(
  tenantId: string
): Promise<CampanhaEmDestaque | null> {
  const campanhas = await prisma.raffle.findMany({
    where: { tenantId, status: "ACTIVE", privacy: "PUBLIC" },
    orderBy: [{ showOnHome: "desc" }, { createdAt: "desc" }],
    take: 6,
    select: {
      title: true,
      slug: true,
      pricePerNumber: true,
      images: { where: { isCover: true }, take: 1, select: { url: true } },
      prizes: {
        select: {
          description: true,
          skinName: true,
          skinRarity: true,
          skinWear: true,
          skinFloat: true,
          skinStatTrak: true,
          skinSouvenir: true,
        },
      },
    },
  });

  const lista = campanhas
    .map((c) => {
      const destaque = headlineSkin(c.prizes);
      return {
        slug: c.slug,
        titulo: c.title,
        capa: c.images[0]?.url ?? null,
        skin: destaque?.skinName ?? null,
        raridade: destaque?.skinRarity ?? null,
        desgaste: destaque?.skinWear ?? null,
        preco: Number(c.pricePerNumber),
      };
    })
    .sort(
      (a, b) =>
        (b.raridade ? RARITY_ORDER[b.raridade] : -1) -
        (a.raridade ? RARITY_ORDER[a.raridade] : -1)
    );

  return lista[0] ?? null;
}

/**
 * A skin em disputa, grande, no meio do painel.
 *
 * Sem capa cadastrada o RaffleCover cai no desenho de reserva, com o nome e
 * a raridade dentro da moldura, e é isso mesmo que se quer aqui: a
 * alternativa era o painel ficar vazio até alguém subir arte, e meia tela
 * preta é pior que a mesma skin aparecendo de dois jeitos em colunas
 * diferentes.
 */
export function SkinDoPainel({ campanha }: { campanha: CampanhaEmDestaque }) {
  const cor = campanha.raridade ? RARITY_COLOR[campanha.raridade] : null;

  return (
    <div className="relative mx-auto w-full max-w-lg">
      {cor && (
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-10 opacity-50 blur-3xl"
          style={{
            background: `radial-gradient(circle at 50% 55%, ${cor}, transparent 68%)`,
          }}
        />
      )}
      <RaffleCover
        url={campanha.capa}
        title={campanha.titulo}
        skinName={campanha.skin}
        rarity={campanha.raridade}
        ajuste="conter"
        priority
        sizes="(min-width: 1024px) 512px, 90vw"
        style={{ aspectRatio: PROPORCAO_DA_SKIN }}
        className="relative w-full drop-shadow-2xl"
      />
    </div>
  );
}

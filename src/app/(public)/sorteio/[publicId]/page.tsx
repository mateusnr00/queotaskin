// A página da transmissão: /sorteio/DRW-20260829-8F2C
//
// Um endereço só para as três fases da vida do sorteio. Antes, mostra a hora
// marcada e a contagem para ela; durante, transmite; depois, vira o
// comprovante permanente do resultado. É o link que se manda no grupo antes
// de começar e que continua servindo semanas depois, quando alguém pergunta
// quem ganhou.
//
// O estado inicial é renderizado no servidor, e não buscado pela página
// depois de montar. Assim o primeiro quadro já está na fase certa, com a
// contagem no segundo certo, em vez de piscar um esqueleto e corrigir. Quem
// abre com a rede ruim vê o sorteio, não um carregando.

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { idPublicoValido } from "@/lib/sorteio-ao-vivo";
import {
  carregarEstadoPublico,
  dadosDeReivindicacao,
} from "@/server/services/sorteio-ao-vivo";
import { TransmissaoDoSorteio } from "@/components/sorteio/transmissao";

// Nunca estático: a página é diferente a cada segundo, e uma versão guardada
// no CDN entregaria a contagem parada na hora em que foi gerada.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ publicId: string }>;
}): Promise<Metadata> {
  const { publicId } = await params;
  if (!idPublicoValido(publicId)) return { title: "Sorteio" };

  const estado = await carregarEstadoPublico(publicId).catch(() => null);
  if (!estado) return { title: "Sorteio" };

  const titulo =
    estado.status === "FINISHED"
      ? `Resultado do sorteio: ${estado.campanha.titulo}`
      : `Sorteio ao vivo: ${estado.campanha.titulo}`;

  return {
    title: titulo,
    description:
      estado.status === "FINISHED"
        ? `Resultado do sorteio ${estado.publicId}.`
        : "Sorteio automático, sincronizado para todos os participantes.",
    // O link é compartilhado no grupo enquanto o sorteio acontece. Um preview
    // guardado pelo aplicativo de mensagem mostraria uma fase que já passou.
    other: { "cache-control": "no-store" },
  };
}

export default async function PaginaDoSorteio({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  if (!idPublicoValido(publicId)) notFound();

  const estado = await carregarEstadoPublico(publicId);
  if (!estado) notFound();

  // Resolvido AQUI, no servidor, e nunca no endpoint público de estado: aquela
  // resposta é a mesma para todo mundo e pode ser guardada em cache, então um
  // dado por espectador ali entregaria o link de um ganhador para outra pessoa.
  const session = await auth();
  const reivindicacao = await dadosDeReivindicacao(
    publicId,
    session?.user?.id,
  ).catch(() => null);

  return (
    <TransmissaoDoSorteio
      estadoInicial={estado}
      reivindicacao={reivindicacao}
    />
  );
}

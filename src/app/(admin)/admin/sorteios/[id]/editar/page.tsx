import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowLeft,
  ExternalLink,
  History,
  ShoppingCart,
  Ticket,
} from "lucide-react";

import { prisma } from "@/lib/db";
import { camposObrigatoriosCoerentes } from "@/lib/validations/raffle";
import { RaffleForm } from "@/components/admin/raffle-form";
import { RaffleStatusActions } from "@/components/admin/raffle-status-actions";
import { requireAdmin } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { toPrizeDraft } from "@/lib/prize-mapper";
import { raffleUrl } from "@/lib/raffle-url";
import { contarOcupados } from "@/server/services/vendidos";
import { Etiqueta, Moldura } from "@/components/ui/moldura";

export const metadata: Metadata = { title: "Editar sorteio" };

type RaffleFormRequiredFields = {
  name: boolean;
  phone: boolean;
  cpf: boolean;
  email: boolean;
  socialName: boolean;
  birthDate: boolean;
};

// Abas validas na URL. Sem a lista, um ?aba= qualquer abriria o formulario
// numa aba inexistente e o conteudo sairia em branco.
const ABAS = [
  "geral",
  "titulos",
  "imagens",
  "premios",
  "premiados",
  "pagamento",
  "promocoes",
  "excluir",
];

/** Data para o formato do <input type="datetime-local">, no fuso oficial. */
function paraCampoLocal(data: Date | null): string | null {
  if (!data) return null;
  const partes = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(data);
  return partes.replace(" ", "T");
}

export default async function EditRafflePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const session = await requireAdmin();
  const tenantId = await getActiveTenantIdForAdmin(session.user);
  const { id } = await params;
  const { aba } = await searchParams;
  // Vem de quem acabou de criar o sorteio clicando numa aba que precisava
  // dele existindo. Continua de onde parou em vez de cair em Geral.
  const abaInicial = aba && ABAS.includes(aba) ? aba : undefined;

  const raffle = await prisma.raffle.findUnique({
    where: { id },
    include: {
      images: { orderBy: { order: "asc" } },
      prizes: { orderBy: { position: "asc" } },
      promotions: { orderBy: { quantity: "asc" } },
      awardedTickets: { orderBy: { number: "asc" } },
    },
  });
  if (!raffle) notFound();
  // Bloqueia cross-tenant: admin de outro tenant não pode editar essa rifa.
  if (raffle.tenantId !== tenantId) notFound();

  const urlPublica = await raffleUrl(raffle.slug);

  // Estado do gateway no tenant, usado pela aba Pagamento pra mostrar
  // qual é o "padrão do site" e se as credenciais de cada provider já
  // foram cadastradas.
  // Só nome e raridade: é o que a sugestão de prêmio precisa, e a ficha
  // completa de centenas de skins não tem por que atravessar a rede.
  const catalogoDePremios = (
    await prisma.skinTemplate.findMany({
      where: { tenantId: raffle.tenantId },
      orderBy: { name: "asc" },
      select: { name: true, skinRarity: true, skinWears: true },
    })
  ).map((sk) => ({
    name: sk.name,
    skinRarity: sk.skinRarity,
    desgastes: sk.skinWears,
  }));

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      paymentProvider: true,
      syncpayClientId: true,
      syncpayClientSecretEnc: true,
      codepayClientId: true,
      codepayPasswordEnc: true,
      sigilopayClientId: true,
      sigilopayClientSecretEnc: true,
      nexuspagApiKeyEnc: true,
    },
  });
  const configuredProviders = {
    syncpay: Boolean(tenant.syncpayClientId && tenant.syncpayClientSecretEnc),
    codepay: Boolean(tenant.codepayClientId && tenant.codepayPasswordEnc),
    sigilopay: Boolean(
      tenant.sigilopayClientId && tenant.sigilopayClientSecretEnc,
    ),
    nexuspag: Boolean(tenant.nexuspagApiKeyEnc),
  };

  // Nome, telefone e CPF sempre ligados; o resto é escolha do admin. A mesma
  // função roda na gravação, então o que a tela mostra é o que o banco guarda.
  const requiredFields: RaffleFormRequiredFields = camposObrigatoriosCoerentes(
    raffle.requiredFields as Partial<RaffleFormRequiredFields> | null,
  );

  // Pra cada título premiado, descobre se o número ainda está à venda e, se
  // não estiver, quem ficou com ele.
  //
  // As duas coisas vêm da MESMA consulta, sem filtro de status, porque
  // "ocupado" aqui é qualquer bilhete existente: reservado também bloqueia. Um
  // título premiado num número que já tem dono não paga ninguém, a marcação
  // acontece na entrada do pagamento, e aquele pagamento já entrou, então a
  // aba precisa dizer isso na cara em vez de deixar o prêmio parecendo no ar.
  const awardedNumbers = raffle.awardedTickets.map((a) => a.number);
  const claimedTickets =
    awardedNumbers.length === 0
      ? []
      : await prisma.ticket.findMany({
          where: { raffleId: raffle.id, number: { in: awardedNumbers } },
          select: {
            number: true,
            status: true,
            reservation: { select: { participantName: true } },
          },
        });
  const participantByNumber = new Map<string, string>();
  const ocupadosNaLista = new Set<number>();
  for (const t of claimedTickets) {
    ocupadosNaLista.add(t.number);
    if (
      t.reservation?.participantName &&
      (t.status === "PAID" || t.status === "AWARDED")
    ) {
      participantByNumber.set(String(t.number), t.reservation.participantName);
    }
  }
  // Quantos títulos da campanha ainda estão livres. O botão de sortear só
  // escolhe entre eles, e o número em si é a resposta para "ainda dá para
  // cadastrar mais premiados?".
  const titulosDisponiveis = Math.max(
    0,
    raffle.totalNumbers - (await contarOcupados(raffle.id)),
  );
  const initialAwardedTickets = raffle.awardedTickets.map((a) => ({
    number: a.number,
    prizeDescription: a.prizeDescription,
    participantName: participantByNumber.get(String(a.number)) ?? null,
    ocupado: ocupadosNaLista.has(a.number),
    // As condições precisam ir e voltar: a ação de salvar APAGA e recria a
    // lista inteira, então uma condição que não chega ao formulário some no
    // primeiro salvamento da aba, sem ninguém perceber.
    saidaTitulosDe: a.saidaTitulosDe,
    saidaTitulosAte: a.saidaTitulosAte,
    saidaDataDe: a.saidaDataDe?.toISOString() ?? null,
    saidaDataAte: a.saidaDataAte?.toISOString() ?? null,
    saidaDdds: a.saidaDdds,
  }));
  const initialAwardedConfig = {
    enabled: raffle.awardedTicketsEnabled,
    showList: raffle.awardedTicketsShowList,
    viewMode:
      raffle.awardedTicketsViewMode === "modal"
        ? ("modal" as const)
        : ("list" as const),
    winnerText: raffle.awardedTicketsWinnerText ?? "",
    loserShow: raffle.awardedTicketsLoserShow,
    loserTitle: raffle.awardedTicketsLoserTitle ?? "",
    loserText: raffle.awardedTicketsLoserText ?? "",
  };

  return (
    <div className="space-y-6">
      {/* O topo da edição.
          Era um cartão em degradê que só repetia o nome, e daqui não havia
          caminho para a lista de compras: para ver quem comprou era preciso
          voltar em sorteios e entrar de novo pela outra porta. Os três
          destinos que se usam junto com a edição agora ficam na mesma linha. */}
      <div className="space-y-3">
        <Link
          href="/admin/sorteios"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar para sorteios
        </Link>

        <Moldura>
          <div className="space-y-4 p-4 md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Etiqueta icone={<Ticket aria-hidden className="h-3 w-3" />}>
                    Editando a campanha
                  </Etiqueta>
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {raffle.totalNumbers.toLocaleString("pt-BR")} títulos ·{" "}
                    {titulosDisponiveis.toLocaleString("pt-BR")} livres
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-xl font-black tracking-tight md:text-2xl">
                    {raffle.title}
                  </h1>
                  {/* URL absoluta do host público, não caminho relativo.
                      Este painel roda em admin.<domínio>, e ali o caminho da
                      campanha não é página pública: o link caía de volta no
                      admin em vez de abrir o sorteio. */}
                  <Link
                    href={urlPublica}
                    target="_blank"
                    className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    /{raffle.slug}
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
                {raffle.shortDescription && (
                  <p className="line-clamp-1 text-sm text-muted-foreground">
                    {raffle.shortDescription}
                  </p>
                )}
              </div>
              <div className="shrink-0">
                <RaffleStatusActions id={raffle.id} status={raffle.status} />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
              <LinkDoTopo
                href={`/admin/sorteios/${raffle.id}/compras`}
                icone={<ShoppingCart aria-hidden className="h-4 w-4" />}
                rotulo="Lista de compras"
              />
              <LinkDoTopo
                href={urlPublica}
                icone={<ExternalLink aria-hidden className="h-4 w-4" />}
                rotulo="Ver a página"
                externo
              />
              <LinkDoTopo
                href={`/admin/logs?alvoTipo=Raffle&alvoId=${raffle.id}`}
                icone={<History aria-hidden className="h-4 w-4" />}
                rotulo="Histórico"
              />
            </div>
          </div>
        </Moldura>
      </div>

      <RaffleForm
        catalogoDePremios={catalogoDePremios}
        mode={{ kind: "edit", id: raffle.id }}
        abaInicial={abaInicial}
        raffleTitle={raffle.title}
        initialTrofeuUrl={raffle.trofeuUrl}
        initialPrincipal={raffle.principal}
        initialImages={raffle.images.map((img) => ({
          id: img.id,
          url: img.url,
          isCover: img.isCover,
          order: img.order,
        }))}
        initialPrizes={raffle.prizes.map(toPrizeDraft)}
        initialPrizesConfig={{
          show: raffle.prizesShow,
          showSkinSpecs: raffle.showSkinSpecs,
          ebook: {
            enabled: raffle.ebookEnabled,
            title: raffle.ebookTitle ?? "",
            text: raffle.ebookText ?? "",
            url: raffle.ebookUrl ?? "",
            buttonText: raffle.ebookButtonText ?? "",
          },
        }}
        initialPromotions={raffle.promotions.map((p) => ({
          quantity: p.quantity,
          price: Number(p.price),
          label: p.label,
          type: p.type,
        }))}
        initialPromotionsConfig={{
          enabled: raffle.promotionsEnabled,
          doubleEnabled: raffle.promotionsDoubleEnabled,
          // <input type="datetime-local"> quer "YYYY-MM-DDTHH:mm" sem fuso e
          // sem segundos. toISOString devolveria UTC, e a hora apareceria
          // deslocada no campo.
          doubleFrom: paraCampoLocal(raffle.promotionsDoubleFrom),
          doubleUntil: paraCampoLocal(raffle.promotionsDoubleUntil),
          accumulative: raffle.promotionsAccumulative,
        }}
        initialPaymentProvider={
          raffle.paymentProvider === "CODEPAY" ||
          raffle.paymentProvider === "SYNCPAY" ||
          raffle.paymentProvider === "SIGILOPAY" ||
          raffle.paymentProvider === "NEXUSPAG"
            ? raffle.paymentProvider
            : null
        }
        tenantPaymentDefault={tenant.paymentProvider}
        configuredProviders={configuredProviders}
        initialAwardedTickets={initialAwardedTickets}
        titulosDisponiveis={titulosDisponiveis}
        initialAwardedConfig={initialAwardedConfig}
        defaultValues={{
          title: raffle.title,
          slug: raffle.slug,
          shortDescription: raffle.shortDescription ?? "",
          description: raffle.description ?? "",
          descriptionMode: raffle.descriptionMode,
          category: raffle.category ?? "",
          privacy: raffle.privacy,
          showOnHome: raffle.showOnHome,
          drawDate: raffle.drawDate,
          salesStart: raffle.salesStart,
          autoCloseOnDraw: raffle.autoCloseOnDraw,
          showDrawDate: raffle.showDrawDate,
          allowReceiptDownload: raffle.allowReceiptDownload,
          aceitaCupomDeAfiliado: raffle.aceitaCupomDeAfiliado,
          showParticipantName: raffle.showParticipantName,
          modality: raffle.modality,
          reservationModel: raffle.reservationModel,
          requiredFields,
          totalNumbers: raffle.totalNumbers,
          pricePerNumber: Number(raffle.pricePerNumber),
          isFree: raffle.isFree,
          freeLabel: raffle.freeLabel,
          hasFee: raffle.hasFee,
          feeAmount: raffle.feeAmount ? Number(raffle.feeAmount) : null,
          reservationTimeoutMinutes: raffle.reservationTimeoutMinutes,
          minPurchase: raffle.minPurchase,
          maxPurchase: raffle.maxPurchase,
          initialQuantity: raffle.initialQuantity,
          maxPerBuyer: raffle.maxPerBuyer,
          minLevel: raffle.minLevel,
          showProgressBar: raffle.showProgressBar,
          showDailyRanking: raffle.showDailyRanking,
          showOverallRanking: raffle.showOverallRanking,
          showShareButtons: raffle.showShareButtons,
          selectionCards: raffle.selectionCards ?? [],
          selectionCardsBestseller: raffle.selectionCardsBestseller ?? -1,
        }}
      />
    </div>
  );
}

/** Um atalho do topo da edição: ícone, nome, e nada mais. */
function LinkDoTopo({
  href,
  icone,
  rotulo,
  externo,
}: {
  href: string;
  icone: React.ReactNode;
  rotulo: string;
  externo?: boolean;
}) {
  return (
    <Link
      href={href}
      target={externo ? "_blank" : undefined}
      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.02] px-4 py-2 text-xs font-semibold text-muted-foreground transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-white/20 hover:bg-white/[0.05] hover:text-foreground"
    >
      {icone}
      {rotulo}
    </Link>
  );
}

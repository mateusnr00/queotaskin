import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, ChevronRight, ExternalLink } from "lucide-react";

import { prisma } from "@/lib/db";
import { RaffleForm } from "@/components/admin/raffle-form";
import { RaffleStatusActions } from "@/components/admin/raffle-status-actions";
import { requireAdmin } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { toPrizeDraft } from "@/lib/prize-mapper";
import { raffleUrl } from "@/lib/raffle-url";

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
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      paymentProvider: true,
      syncpayClientId: true,
      syncpayClientSecretEnc: true,
      codepayClientId: true,
      codepayPasswordEnc: true,
    },
  });
  const configuredProviders = {
    syncpay: Boolean(tenant.syncpayClientId && tenant.syncpayClientSecretEnc),
    codepay: Boolean(tenant.codepayClientId && tenant.codepayPasswordEnc),
  };

  // Fallback pra campos faltantes no JSON: tudo OFF (identidade vem da
  // conta logada, admin liga toggle por rifa quando quiser pedir extra).
  const rawRF = raffle.requiredFields as Partial<RaffleFormRequiredFields>;
  const requiredFields: RaffleFormRequiredFields = {
    name: rawRF.name ?? false,
    phone: rawRF.phone ?? false,
    cpf: rawRF.cpf ?? false,
    email: rawRF.email ?? false,
    socialName: rawRF.socialName ?? false,
    birthDate: rawRF.birthDate ?? false,
  };

  // Pra cada título premiado, descobre se já foi comprado e por quem.
  // Mostra na UI ao lado do número (igual SkinsLendarias).
  const awardedNumbers = raffle.awardedTickets.map((a) => a.number);
  const claimedTickets =
    awardedNumbers.length === 0
      ? []
      : await prisma.ticket.findMany({
          where: {
            raffleId: raffle.id,
            number: { in: awardedNumbers },
            status: { in: ["PAID", "AWARDED"] },
          },
          select: {
            number: true,
            reservation: { select: { participantName: true } },
          },
        });
  const participantByNumber = new Map<string, string>();
  for (const t of claimedTickets) {
    if (t.reservation?.participantName) {
      participantByNumber.set(String(t.number), t.reservation.participantName);
    }
  }
  const initialAwardedTickets = raffle.awardedTickets.map((a) => ({
    number: a.number,
    prizeDescription: a.prizeDescription,
    participantName: participantByNumber.get(String(a.number)) ?? null,
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
      {/* Header card: breadcrumb compacto, título da rifa em destaque,
          status pill + ações alinhados à direita. */}
      <div className="space-y-3">
        <Link
          href="/admin/sorteios"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar para sorteios
        </Link>

        <div className="rounded-2xl border bg-gradient-to-br from-card to-muted/30 p-5 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 space-y-2">
              <nav className="flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap">
                <Link href="/admin" className="hover:text-foreground">
                  Admin
                </Link>
                <ChevronRight className="h-3 w-3" />
                <Link href="/admin/sorteios" className="hover:text-foreground">
                  Sorteios
                </Link>
                <ChevronRight className="h-3 w-3" />
                <span>Editar</span>
              </nav>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl md:text-2xl font-bold tracking-tight truncate">
                  {raffle.title}
                </h1>
                {/* URL absoluta do host público, não caminho relativo.
                    Este painel roda em admin.<domínio>, e ali o caminho da
                    campanha não é página pública: o link caía de volta no
                    admin em vez de abrir o sorteio. */}
                <Link
                  href={urlPublica}
                  target="_blank"
                  className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  /{raffle.slug}
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
              {raffle.shortDescription && (
                <p className="text-sm text-muted-foreground line-clamp-1">
                  {raffle.shortDescription}
                </p>
              )}
            </div>
            <div className="shrink-0">
              <RaffleStatusActions id={raffle.id} status={raffle.status} />
            </div>
          </div>
        </div>
      </div>

      <RaffleForm
        mode={{ kind: "edit", id: raffle.id }}
        abaInicial={abaInicial}
        raffleTitle={raffle.title}
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
          accumulative: raffle.promotionsAccumulative,
        }}
        initialPaymentProvider={
          raffle.paymentProvider === "CODEPAY" ||
          raffle.paymentProvider === "SYNCPAY"
            ? raffle.paymentProvider
            : null
        }
        tenantPaymentDefault={tenant.paymentProvider}
        configuredProviders={configuredProviders}
        initialAwardedTickets={initialAwardedTickets}
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

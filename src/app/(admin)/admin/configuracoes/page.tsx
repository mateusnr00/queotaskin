import { CabecalhoDeAdmin } from "@/components/admin/cabecalho";
import type { Metadata } from "next";
import { Settings } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { SettingsForm } from "@/components/admin/settings-form";

export const metadata: Metadata = { title: "Configurações" };

export default async function ConfiguracoesPage() {
  const session = await requireAdmin();
  const tenantId = await getActiveTenantIdForAdmin(session.user);

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      logoUrl: true,
      logoShape: true,
      faviconUrl: true,
      authBackgroundUrl: true,
      trofeuUrl: true,
      name: true,
      siteDescription: true,
      supportPhone: true,
      supportEmail: true,
      whatsappGroupUrl: true,
      homeCampaignsTitle: true,
      homeCampaignsCaption: true,
      showWinnersOnHome: true,
      paidImageUrl: true,
      loginMode: true,
      numbersNomenclature: true,
      quantityCardsHeading: true,
      minPurchaseAge: true,
      affiliateCookieHours: true,
      rankingOrderBy: true,
      rankingCacheMinutes: true,
      requireAddressOnSignup: true,
      allowPublicAffiliate: true,
      shareButtonsGlobal: true,
      allowQuantityKeyboardInput: true,
      buyerPrivacy: true,
      carouselAutoPlay: true,
      showCardPrices: true,
      showAppButton: true,
      instantPrizesOrder: true,
      awardedSectionTitle: true,
      showAwardedOnlyWhenDistributed: true,
      showAwardedNumbers: true,
      showAwardedNumbersBoxes: true,
      showAwardedNumbersRoulette: true,
      showAwardedNumbersScratchCard: true,
      aggregateInstantAwards: true,
      disableInstantAwardsRepeatWinners: true,
      showPromotionsPercentage: true,
      showCombosPrice: true,
      showFees: true,
      somDoSorteioAtivo: true,
      somContagemUrl: true,
      somContagemFinalUrl: true,
      somRolagemUrl: true,
      somRevelacaoUrl: true,
    },
  });

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <CabecalhoDeAdmin
          etiqueta="Ajustes"
          icone={<Settings aria-hidden className="h-3 w-3" />}
          titulo="Configurações"
          migalha={[
            { rotulo: "Admin", href: "/admin" },
            { rotulo: "Configurações" },
          ]}
        />
      </div>

      <SettingsForm
        initial={{
          logoUrl: tenant.logoUrl,
          logoShape: tenant.logoShape,
          faviconUrl: tenant.faviconUrl,
          authBackgroundUrl: tenant.authBackgroundUrl,
          trofeuUrl: tenant.trofeuUrl,
          companyName: tenant.name,
          siteDescription: tenant.siteDescription ?? "",
          supportPhone: tenant.supportPhone,
          supportEmail: tenant.supportEmail,
          whatsappGroupUrl: tenant.whatsappGroupUrl,
          homeCampaignsTitle: tenant.homeCampaignsTitle ?? "",
          homeCampaignsCaption: tenant.homeCampaignsCaption ?? "",
          showWinnersOnHome: tenant.showWinnersOnHome,
          thankYouImageUrl: tenant.paidImageUrl,
          loginMode: tenant.loginMode === "cpf" ? "cpf" : "phone",
          numbersNomenclature:
            tenant.numbersNomenclature === "numeros" ||
            tenant.numbersNomenclature === "bilhetes" ||
            tenant.numbersNomenclature === "numeros_sorte"
              ? tenant.numbersNomenclature
              : "titulos",
          quantityCardsHeading: tenant.quantityCardsHeading ?? "",
          minPurchaseAge:
            tenant.minPurchaseAge === 16 || tenant.minPurchaseAge === 21
              ? tenant.minPurchaseAge
              : 18,
          affiliateCookieHours: tenant.affiliateCookieHours,
          rankingOrderBy:
            tenant.rankingOrderBy === "total" ? "total" : "quantity",
          rankingCacheMinutes: tenant.rankingCacheMinutes,
          requireAddressOnSignup: tenant.requireAddressOnSignup,
          allowPublicAffiliate: tenant.allowPublicAffiliate,
          shareButtonsGlobal: tenant.shareButtonsGlobal,
          allowQuantityKeyboardInput: tenant.allowQuantityKeyboardInput,
          buyerPrivacy: tenant.buyerPrivacy,
          carouselAutoPlay: tenant.carouselAutoPlay,
          showCardPrices: tenant.showCardPrices,
          showAppButton: tenant.showAppButton,
          instantPrizesOrder: tenant.instantPrizesOrder,
          awardedSectionTitle: tenant.awardedSectionTitle,
          showAwardedOnlyWhenDistributed: tenant.showAwardedOnlyWhenDistributed,
          showAwardedNumbers: tenant.showAwardedNumbers,
          showAwardedNumbersBoxes: tenant.showAwardedNumbersBoxes,
          showAwardedNumbersRoulette: tenant.showAwardedNumbersRoulette,
          showAwardedNumbersScratchCard: tenant.showAwardedNumbersScratchCard,
          aggregateInstantAwards: tenant.aggregateInstantAwards,
          disableInstantAwardsRepeatWinners:
            tenant.disableInstantAwardsRepeatWinners,
          showPromotionsPercentage: tenant.showPromotionsPercentage,
          showCombosPrice: tenant.showCombosPrice,
          showFees: tenant.showFees,
          somDoSorteioAtivo: tenant.somDoSorteioAtivo,
          somContagemUrl: tenant.somContagemUrl,
          somContagemFinalUrl: tenant.somContagemFinalUrl,
          somRolagemUrl: tenant.somRolagemUrl,
          somRevelacaoUrl: tenant.somRevelacaoUrl,
        }}
      />
    </div>
  );
}

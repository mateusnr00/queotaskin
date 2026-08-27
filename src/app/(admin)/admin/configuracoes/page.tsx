import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";

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
      name: true,
      siteDescription: true,
      supportPhone: true,
      supportEmail: true,
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
    },
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          Configurações
        </h1>
        <nav className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/admin" className="hover:text-foreground">
            Admin
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span>Configurações</span>
        </nav>
      </div>

      <SettingsForm
        initial={{
          logoUrl: tenant.logoUrl,
          logoShape: tenant.logoShape,
          faviconUrl: tenant.faviconUrl,
          authBackgroundUrl: tenant.authBackgroundUrl,
          companyName: tenant.name,
          siteDescription: tenant.siteDescription ?? "",
          supportPhone: tenant.supportPhone,
          supportEmail: tenant.supportEmail,
          homeCampaignsTitle: tenant.homeCampaignsTitle ?? "",
          homeCampaignsCaption: tenant.homeCampaignsCaption ?? "",
          showWinnersOnHome: tenant.showWinnersOnHome,
          thankYouImageUrl: tenant.paidImageUrl,
          loginMode:
            tenant.loginMode === "cpf" ? "cpf" : "phone",
          numbersNomenclature:
            tenant.numbersNomenclature === "numeros" ||
            tenant.numbersNomenclature === "bilhetes" ||
            tenant.numbersNomenclature === "numeros_sorte"
              ? tenant.numbersNomenclature
              : "titulos",
          quantityCardsHeading: tenant.quantityCardsHeading ?? "",
          minPurchaseAge:
            tenant.minPurchaseAge === 16 ||
            tenant.minPurchaseAge === 21
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
          showAwardedOnlyWhenDistributed:
            tenant.showAwardedOnlyWhenDistributed,
          showAwardedNumbers: tenant.showAwardedNumbers,
          showAwardedNumbersBoxes: tenant.showAwardedNumbersBoxes,
          showAwardedNumbersRoulette: tenant.showAwardedNumbersRoulette,
          showAwardedNumbersScratchCard:
            tenant.showAwardedNumbersScratchCard,
          aggregateInstantAwards: tenant.aggregateInstantAwards,
          disableInstantAwardsRepeatWinners:
            tenant.disableInstantAwardsRepeatWinners,
          showPromotionsPercentage: tenant.showPromotionsPercentage,
          showCombosPrice: tenant.showCombosPrice,
          showFees: tenant.showFees,
        }}
      />
    </div>
  );
}

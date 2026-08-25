"use client";

// Form de configurações gerais do site (Sorteamos-style):
// - Tabs horizontais (Geral funcional + 5 placeholders)
// - Aba Geral: avatar/logo, nome, descrição, telefone de suporte
// - Aba Experiência do Usuário: textos da home + toggle ganhadores
//
// Cada aba tem o próprio botão Salvar / auto-save conforme o caso.
// Identidade do site (Geral) usa um único Salvar; experiência do usuário
// salva inline igual ao painel de tema.

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  Camera,
  GripVertical,
  Headset,
  Heart,
  Link2,
  Loader2,
  Phone,
  Settings,
  ShoppingBag,
  Tag,
  Trash2,
  Trophy,
  Upload,
} from "lucide-react";

import {
  removeLogoAction,
  setLogoByUrlAction,
  updateSiteAction,
  uploadLogoAction,
} from "@/server/actions/settings";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { normalizeImage } from "@/lib/image-normalize";

type LoginMode = "phone" | "cpf";
type NumbersNomenclature =
  | "titulos"
  | "numeros"
  | "bilhetes"
  | "numeros_sorte";

interface Props {
  initial: {
    logoUrl: string | null;
    companyName: string;
    siteDescription: string;
    supportPhone: string | null;
    supportEmail: string | null;
    homeCampaignsTitle: string;
    homeCampaignsCaption: string;
    showWinnersOnHome: boolean;
    thankYouImageUrl: string | null;
    loginMode: LoginMode;
    numbersNomenclature: NumbersNomenclature;
    quantityCardsHeading: string;
    minPurchaseAge: 16 | 18 | 21;
    affiliateCookieHours: number;
    rankingOrderBy: "quantity" | "total";
    rankingCacheMinutes: number;
    requireAddressOnSignup: boolean;
    allowPublicAffiliate: boolean;
    shareButtonsGlobal: boolean;
    allowQuantityKeyboardInput: boolean;
    buyerPrivacy: boolean;
    carouselAutoPlay: boolean;
    showCardPrices: boolean;
    showAppButton: boolean;
    instantPrizesOrder: string[];
    awardedSectionTitle: string;
    showAwardedOnlyWhenDistributed: boolean;
    showAwardedNumbers: boolean;
    showAwardedNumbersBoxes: boolean;
    showAwardedNumbersRoulette: boolean;
    showAwardedNumbersScratchCard: boolean;
    aggregateInstantAwards: boolean;
    disableInstantAwardsRepeatWinners: boolean;
    showPromotionsPercentage: boolean;
    showCombosPrice: boolean;
    showFees: boolean;
  };
}

// Slugs canônicos das modalidades de prêmio instantâneo + label.
type PrizeModality =
  | "awarded_numbers"
  | "awarded_box"
  | "reward_spin"
  | "scratch_card";

const PRIZE_MODALITY_LABELS: Record<PrizeModality, string> = {
  awarded_numbers: "Títulos Premiados",
  awarded_box: "Caixas Premiados",
  reward_spin: "Roleta Premiada",
  scratch_card: "Raspadinha",
};

const AFFILIATE_COOKIE_OPTIONS = [1, 2, 3, 4, 5, 6, 12, 24, 48, 72, 96, 120];
const RANKING_CACHE_OPTIONS = [1, 2, 3, 4, 5, 10, 15, 20, 30, 45, 60];

export function SettingsForm({ initial }: Props) {
  return (
    <Tabs defaultValue="geral" className="gap-4">
      <div className="border-b -mx-4 md:-mx-6 px-4 md:px-6 overflow-x-auto">
        <TabsList variant="line" className="h-auto py-1 gap-0">
          <Tab value="geral" icon={Settings} label="Geral" />
          <Tab value="suporte" icon={Headset} label="Chats & Suporte" />
          <Tab value="compra" icon={ShoppingBag} label="Campanha / Compra" />
          <Tab value="ux" icon={Heart} label="Experiência do Usuário" />
          <Tab value="premios" icon={Trophy} label="Prêmios Instantâneos" />
          <Tab value="promos" icon={Tag} label="Preços / Promoções" />
        </TabsList>
      </div>

      <TabsContent value="geral">
        <GeralTab initial={initial} />
      </TabsContent>

      <TabsContent value="ux">
        <UxTab initial={initial} />
      </TabsContent>

      <TabsContent value="compra">
        <CompraTab initial={initial} />
      </TabsContent>

      <TabsContent value="premios">
        <PremiosTab initial={initial} />
      </TabsContent>

      <TabsContent value="promos">
        <PromosTab initial={initial} />
      </TabsContent>

      {[["suporte", "Chats & Suporte"]].map(([value, label]) => (
        <TabsContent key={value} value={value}>
          <Card className="p-8 text-center text-sm text-muted-foreground">
            <p className="font-semibold text-foreground mb-1">{label}</p>
            <p>Configurações dessa seção em breve.</p>
          </Card>
        </TabsContent>
      ))}
    </Tabs>
  );
}

function Tab({
  value,
  icon: Icon,
  label,
}: {
  value: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any;
  label: string;
}) {
  return (
    <TabsTrigger
      value={value}
      className="flex-none px-3 py-2 text-xs sm:text-sm gap-1.5"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </TabsTrigger>
  );
}

// ---------------- ABA GERAL ----------------

function GeralTab({ initial }: Props) {
  const [logoUrl, setLogoUrl] = useState<string | null>(initial.logoUrl);
  const [companyName, setCompanyName] = useState(initial.companyName);
  const [siteDescription, setSiteDescription] = useState(initial.siteDescription);
  const [supportPhone, setSupportPhone] = useState(initial.supportPhone ?? "");
  const [supportEmail, setSupportEmail] = useState(initial.supportEmail ?? "");
  const [logoUrlInput, setLogoUrlInput] = useState("");
  const [isAddingLogoUrl, setIsAddingLogoUrl] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isUploading, setIsUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(original: File) {
    setIsUploading(true);
    try {
      // Mesmo motivo da aba de imagens: encolhe antes de enviar, porque o
      // corpo da Server Action tem teto e o corte acontece no framework.
      const { file } = await normalizeImage(original);
      const fd = new FormData();
      fd.append("file", file);

      let result;
      try {
        result = await uploadLogoAction(fd);
      } catch {
        toast.error("Imagem grande demais para enviar");
        return;
      }
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setLogoUrl(result.data.url);
      toast.success("Logo atualizado");
    } finally {
      setIsUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleLogoUrl() {
    const url = logoUrlInput.trim();
    if (!url) {
      toast.error("Cole uma URL antes");
      return;
    }
    setIsAddingLogoUrl(true);
    try {
      const result = await setLogoByUrlAction({ url });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setLogoUrl(result.data.url);
      setLogoUrlInput("");
      toast.success("Logo atualizado");
    } finally {
      setIsAddingLogoUrl(false);
    }
  }

  function removeLogo() {
    if (!confirm("Remover o logo atual?")) return;
    startTransition(async () => {
      const result = await removeLogoAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setLogoUrl(null);
      toast.success("Logo removido");
    });
  }

  function save() {
    startTransition(async () => {
      const result = await updateSiteAction({
        companyName,
        siteDescription,
        supportPhone: supportPhone || null,
        supportEmail: supportEmail || null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Configurações salvas");
    });
  }

  return (
    <Card className="p-5 md:p-6 space-y-5">
      {/* Logo */}
      <div className="flex flex-col items-center gap-2 py-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={isUploading || isPending}
          className={cn(
            "relative h-32 w-32 rounded-full overflow-hidden border-2 border-dashed transition-colors group",
            logoUrl
              ? "border-transparent ring-1 ring-border"
              : "border-border hover:border-primary"
          )}
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="Logo"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground bg-muted/30">
              {isUploading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <Camera className="h-6 w-6" />
              )}
              <span className="mt-1 text-[10px] uppercase tracking-wider">
                Atualizar foto
              </span>
            </div>
          )}
          {logoUrl && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
              {isUploading ? (
                <Loader2 className="h-6 w-6 text-white animate-spin" />
              ) : (
                <Upload className="h-6 w-6 text-white" />
              )}
            </div>
          )}
        </button>
        <p className="text-[11px] text-muted-foreground text-center">
          Permitidos *.jpeg, *.jpg, *.png, *.gif, *.webp
          <br />
          Tamanho máximo 3 MB
        </p>
        {logoUrl && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={removeLogo}
            disabled={isPending}
            className="text-destructive"
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Remover logo
          </Button>
        )}

        <div className="w-full max-w-sm space-y-2 pt-2">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              ou cole uma URL
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Link2 className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={logoUrlInput}
                onChange={(e) => setLogoUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleLogoUrl();
                  }
                }}
                placeholder="https://exemplo.com/logo.png"
                inputMode="url"
                disabled={isAddingLogoUrl}
                className="pl-8"
              />
            </div>
            <Button
              type="button"
              onClick={handleLogoUrl}
              disabled={isAddingLogoUrl || !logoUrlInput.trim()}
              size="lg"
            >
              {isAddingLogoUrl ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="mr-1.5 h-4 w-4" />
              )}
              Usar URL
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="companyName">Nome do site *</Label>
        <Input
          id="companyName"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          maxLength={120}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="siteDescription">Descrição</Label>
        <Input
          id="siteDescription"
          value={siteDescription}
          onChange={(e) => setSiteDescription(e.target.value)}
          maxLength={200}
          placeholder="Ex: Sua sorte está aqui"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="supportPhone">
          Telefone para suporte &quot;problemas com a sua compra?&quot;
        </Label>
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="supportPhone"
            inputMode="tel"
            value={supportPhone}
            onChange={(e) => setSupportPhone(e.target.value)}
            placeholder="(99) 99999-9999"
            className="pl-9"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="supportEmail">E-mail para suporte</Label>
        <Input
          id="supportEmail"
          type="email"
          value={supportEmail}
          onChange={(e) => setSupportEmail(e.target.value)}
          placeholder="suporte@exemplo.com"
        />
      </div>

      <div className="flex justify-end pt-2 border-t">
        <Button type="button" onClick={save} disabled={isPending}>
          {isPending ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </Card>
  );
}

// ---------------- ABA EXPERIÊNCIA DO USUÁRIO ----------------

function UxTab({ initial }: Props) {
  const [campaignsTitle, setCampaignsTitle] = useState(
    initial.homeCampaignsTitle
  );
  const [campaignsCaption, setCampaignsCaption] = useState(
    initial.homeCampaignsCaption
  );
  const [showWinners, setShowWinners] = useState(initial.showWinnersOnHome);
  // Comportamentos globais (selects + 8 switches).
  const [affiliateCookieHours, setAffiliateCookieHours] = useState(
    initial.affiliateCookieHours
  );
  const [rankingOrderBy, setRankingOrderBy] = useState(initial.rankingOrderBy);
  const [rankingCacheMinutes, setRankingCacheMinutes] = useState(
    initial.rankingCacheMinutes
  );
  const [requireAddress, setRequireAddress] = useState(
    initial.requireAddressOnSignup
  );
  const [allowPublicAffiliate, setAllowPublicAffiliate] = useState(
    initial.allowPublicAffiliate
  );
  const [shareButtonsGlobal, setShareButtonsGlobal] = useState(
    initial.shareButtonsGlobal
  );
  const [allowQuantityKeyboard, setAllowQuantityKeyboard] = useState(
    initial.allowQuantityKeyboardInput
  );
  const [buyerPrivacy, setBuyerPrivacy] = useState(initial.buyerPrivacy);
  const [carouselAutoPlay, setCarouselAutoPlay] = useState(
    initial.carouselAutoPlay
  );
  const [showCardPrices, setShowCardPrices] = useState(initial.showCardPrices);
  const [showAppButton, setShowAppButton] = useState(initial.showAppButton);
  const [isPending, startTransition] = useTransition();

  function apply(update: Record<string, unknown>, msg: string) {
    startTransition(async () => {
      const result = await updateSiteAction(update);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(msg);
    });
  }

  function saveTexts() {
    apply(
      {
        homeCampaignsTitle: campaignsTitle.trim(),
        homeCampaignsCaption: campaignsCaption.trim(),
      },
      "Texto da home atualizado"
    );
  }

  function toggleWinners(v: boolean) {
    setShowWinners(v);
    apply(
      { showWinnersOnHome: v },
      v ? "Ganhadores visíveis na home" : "Ganhadores ocultos"
    );
  }

  // Helper genérico pros toggles inline (atualiza estado + persiste).
  function applyToggle(
    key: string,
    setter: (v: boolean) => void
  ): (v: boolean) => void {
    return (v: boolean) => {
      setter(v);
      apply({ [key]: v }, "Configuração atualizada");
    };
  }

  return (
    <Card className="p-5 md:p-6 space-y-5">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Página inicial
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          Personalize os textos da home pública. Campos vazios escondem o
          cabeçalho da seção de campanhas.
        </p>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="campaignsTitle">
              Título da seção de campanhas
            </Label>
            <Input
              id="campaignsTitle"
              value={campaignsTitle}
              onChange={(e) => setCampaignsTitle(e.target.value)}
              placeholder="Ex: ⚡ Campanhas (vazio = esconder)"
              maxLength={60}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="campaignsCaption">Subtítulo / legenda</Label>
            <Input
              id="campaignsCaption"
              value={campaignsCaption}
              onChange={(e) => setCampaignsCaption(e.target.value)}
              placeholder="Ex: Escolha sua sorte"
              maxLength={120}
            />
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={saveTexts}
              disabled={
                isPending ||
                (campaignsTitle === initial.homeCampaignsTitle &&
                  campaignsCaption === initial.homeCampaignsCaption)
              }
            >
              Salvar textos
            </Button>
          </div>
        </div>
      </div>

      <label className="flex items-start justify-between gap-3 rounded-lg border bg-muted/30 p-3 cursor-pointer">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">
            Mostrar seção de ganhadores na home
          </p>
          <p className="text-xs text-muted-foreground">
            Quando ligado, a home pública mostra os últimos sorteados. Útil
            só depois que houver sorteios concluídos com ganhador.
          </p>
        </div>
        <Switch
          checked={showWinners}
          onCheckedChange={toggleWinners}
          disabled={isPending}
        />
      </label>

      {/* ============ COMPORTAMENTO GLOBAL ============
          Selects de afiliado/ranking + 8 switches que afetam a UI pública. */}
      <div className="border-t pt-5 space-y-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Comportamento da campanha
        </h3>

        <div className="space-y-1.5">
          <Label>Duração do Cookie de Afiliado (horas)</Label>
          <Select
            value={String(affiliateCookieHours)}
            onValueChange={(v) => {
              if (!v) return;
              const n = Number(v);
              setAffiliateCookieHours(n);
              apply({ affiliateCookieHours: n }, "Cookie atualizado");
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue
                labels={Object.fromEntries(
                  AFFILIATE_COOKIE_OPTIONS.map((n) => [
                    String(n),
                    `${n} horas`,
                  ])
                )}
              />
            </SelectTrigger>
            <SelectContent>
              {AFFILIATE_COOKIE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} horas
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Ranking de Compras</Label>
          <Select
            value={rankingOrderBy}
            onValueChange={(v) => {
              if (v !== "quantity" && v !== "total") return;
              setRankingOrderBy(v);
              apply({ rankingOrderBy: v }, "Ranking atualizado");
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue
                labels={{
                  quantity: "Ordenar por quantidade de títulos",
                  total: "Ordenar por valor total gasto",
                }}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="quantity">
                Ordenar por quantidade de títulos
              </SelectItem>
              <SelectItem value="total">
                Ordenar por valor total gasto
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Duração do Cache do Ranking (minutos)</Label>
          <Select
            value={String(rankingCacheMinutes)}
            onValueChange={(v) => {
              if (!v) return;
              const n = Number(v);
              setRankingCacheMinutes(n);
              apply({ rankingCacheMinutes: n }, "Cache atualizado");
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue
                labels={Object.fromEntries(
                  RANKING_CACHE_OPTIONS.map((n) => [
                    String(n),
                    `${n} minutos`,
                  ])
                )}
              />
            </SelectTrigger>
            <SelectContent>
              {RANKING_CACHE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} minutos
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <UxToggle
          label="Estado/Cidade no cadastro"
          description="Ative para exigir o preenchimento de Estado e Cidade no cadastro do participante."
          checked={requireAddress}
          onChange={applyToggle("requireAddressOnSignup", setRequireAddress)}
          disabled={isPending}
        />
        <UxToggle
          label="Afiliado Público"
          description="Ative para permitir que os usuários criem códigos de afiliados."
          checked={allowPublicAffiliate}
          onChange={applyToggle(
            "allowPublicAffiliate",
            setAllowPublicAffiliate
          )}
          disabled={isPending}
        />
        <UxToggle
          label="Botões de Compartilhamento"
          description="Ative para mostrar os botões de compartilhamento do link nas páginas de campanha."
          checked={shareButtonsGlobal}
          onChange={applyToggle("shareButtonsGlobal", setShareButtonsGlobal)}
          disabled={isPending}
        />
        <UxToggle
          label="Atualizar quantidade de títulos na compra"
          description="Ative para permitir que o cliente atualize a quantidade de títulos manualmente pelo teclado."
          checked={allowQuantityKeyboard}
          onChange={applyToggle(
            "allowQuantityKeyboardInput",
            setAllowQuantityKeyboard
          )}
          disabled={isPending}
        />
        <UxToggle
          label="Privacidade do Comprador"
          description="Ative para ocultar informações do comprador, como nome completo, telefone, CPF, etc. As informações das compras e dos ganhadores serão mantidas em sigilo."
          checked={buyerPrivacy}
          onChange={applyToggle("buyerPrivacy", setBuyerPrivacy)}
          disabled={isPending}
        />
        <UxToggle
          label="Ativar troca de imagens automática"
          description="Ative para permitir que as imagens do carrossel na página da campanha sejam alternadas automaticamente."
          checked={carouselAutoPlay}
          onChange={applyToggle("carouselAutoPlay", setCarouselAutoPlay)}
          disabled={isPending}
        />
        <UxToggle
          label="Ativar exibição de preços nos cards"
          description="Ative para mostrar o preço em cada card de seleção de quantidade de títulos."
          checked={showCardPrices}
          onChange={applyToggle("showCardPrices", setShowCardPrices)}
          disabled={isPending}
        />
        <UxToggle
          label="Mostrar botão do aplicativo"
          description="Ative para mostrar o botão do aplicativo na tela principal."
          checked={showAppButton}
          onChange={applyToggle("showAppButton", setShowAppButton)}
          disabled={isPending}
        />
      </div>
    </Card>
  );
}

// Toggle inline com label + descrição, no padrão visual da UxTab.
function UxToggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start justify-between gap-3 rounded-lg border bg-muted/30 p-3 cursor-pointer">
      <div className="space-y-0.5 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
      />
    </label>
  );
}

// ---------------- ABA CAMPANHA / COMPRA ----------------
// Config per-tenant que afeta como a página pública de reserva se comporta:
// método de login, nomenclatura das cotas, texto sobre os quick-picks e
// idade mínima. Persiste em Tenant via updateSiteAction.

function CompraTab({ initial }: Props) {
  const [loginMode, setLoginMode] = useState<LoginMode>(initial.loginMode);
  const [nomenclature, setNomenclature] = useState<NumbersNomenclature>(
    initial.numbersNomenclature
  );
  const [heading, setHeading] = useState(initial.quantityCardsHeading);
  const [minAge, setMinAge] = useState<16 | 18 | 21>(initial.minPurchaseAge);
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await updateSiteAction({
        loginMode,
        numbersNomenclature: nomenclature,
        quantityCardsHeading: heading.trim() || null,
        minPurchaseAge: minAge,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Configurações salvas");
    });
  }

  return (
    <Card className="p-5 md:p-6 space-y-5">
      <div className="space-y-1.5">
        <Label>Modo de Login</Label>
        <Select
          value={loginMode}
          onValueChange={(v) => v && setLoginMode(v as LoginMode)}
        >
          <SelectTrigger className="w-full">
            <SelectValue
              labels={{ phone: "Telefone", cpf: "CPF" }}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="phone">Telefone</SelectItem>
            <SelectItem value="cpf">CPF</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Nomenclatura dos números</Label>
        <Select
          value={nomenclature}
          onValueChange={(v) => v && setNomenclature(v as NumbersNomenclature)}
        >
          <SelectTrigger className="w-full">
            <SelectValue
              labels={{
                titulos: "Títulos",
                numeros: "Números",
                bilhetes: "Bilhetes",
                numeros_sorte: "Números da Sorte",
              }}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="titulos">Títulos</SelectItem>
            <SelectItem value="numeros">Números</SelectItem>
            <SelectItem value="bilhetes">Bilhetes</SelectItem>
            <SelectItem value="numeros_sorte">Números da Sorte</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="quantityCardsHeading">
          Texto acima dos cards de compra
        </Label>
        <Input
          id="quantityCardsHeading"
          value={heading}
          onChange={(e) => setHeading(e.target.value)}
          placeholder="Ex: Quanto mais títulos, mais chances de ganhar!"
          maxLength={50}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Idade mínima para compra</Label>
        <Select
          value={String(minAge)}
          onValueChange={(v) => {
            const n = Number(v);
            if (n === 16 || n === 18 || n === 21) setMinAge(n);
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue
              labels={{ "16": "16 anos", "18": "18 anos", "21": "21 anos" }}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="16">16 anos</SelectItem>
            <SelectItem value="18">18 anos</SelectItem>
            <SelectItem value="21">21 anos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-end pt-2 border-t">
        <Button type="button" onClick={save} disabled={isPending}>
          {isPending ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </Card>
  );
}

// ---------------- ABA PRÊMIOS INSTANTÂNEOS ----------------
// Ordenação das 4 modalidades (Títulos/Caixas/Roleta/Raspadinha) + título
// custom da seção + 7 toggles que controlam exibição/agrupamento dos
// números premiados. Reordenação por setas ↑/↓ (sem dep de drag-and-drop).

const ALL_PRIZE_MODALITIES: PrizeModality[] = [
  "awarded_numbers",
  "awarded_box",
  "reward_spin",
  "scratch_card",
];

function PremiosTab({ initial }: Props) {
  function sanitizeOrder(raw: string[]): PrizeModality[] {
    const known = raw.filter((s): s is PrizeModality =>
      ALL_PRIZE_MODALITIES.includes(s as PrizeModality)
    );
    const missing = ALL_PRIZE_MODALITIES.filter((m) => !known.includes(m));
    return [...known, ...missing] as PrizeModality[];
  }

  const [order, setOrder] = useState<PrizeModality[]>(
    sanitizeOrder(initial.instantPrizesOrder)
  );
  const [sectionTitle, setSectionTitle] = useState(initial.awardedSectionTitle);
  const [showOnlyWhenDistributed, setShowOnlyWhenDistributed] = useState(
    initial.showAwardedOnlyWhenDistributed
  );
  const [showInNumbers, setShowInNumbers] = useState(
    initial.showAwardedNumbers
  );
  const [showInBoxes, setShowInBoxes] = useState(
    initial.showAwardedNumbersBoxes
  );
  const [showInRoulette, setShowInRoulette] = useState(
    initial.showAwardedNumbersRoulette
  );
  const [showInScratch, setShowInScratch] = useState(
    initial.showAwardedNumbersScratchCard
  );
  const [aggregate, setAggregate] = useState(initial.aggregateInstantAwards);
  const [disableRepeat, setDisableRepeat] = useState(
    initial.disableInstantAwardsRepeatWinners
  );
  const [isPending, startTransition] = useTransition();

  function apply(update: Record<string, unknown>, msg: string) {
    startTransition(async () => {
      const result = await updateSiteAction(update);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(msg);
    });
  }

  function applyToggle(
    key: string,
    setter: (v: boolean) => void
  ): (v: boolean) => void {
    return (v: boolean) => {
      setter(v);
      apply({ [key]: v }, "Configuração atualizada");
    };
  }

  function move(idx: number, delta: -1 | 1) {
    const target = idx + delta;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[idx], next[target]] = [next[target], next[idx]];
    setOrder(next);
    apply({ instantPrizesOrder: next }, "Ordem atualizada");
  }

  function saveTitle() {
    apply(
      { awardedSectionTitle: sectionTitle.trim() || "Títulos Premiados" },
      "Título atualizado"
    );
  }

  return (
    <Card className="p-5 md:p-6 space-y-5">
      <div>
        <h3 className="text-sm font-semibold mb-1">
          Ordenação dos prêmios instantâneos
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Use as setas para alterar a ordem das modalidades de prêmios
          instantâneos na página de compra.
        </p>
        <ul className="space-y-1.5">
          {order.map((slug, idx) => (
            <li
              key={slug}
              className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="flex-1 text-sm font-medium">
                {PRIZE_MODALITY_LABELS[slug]}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => move(idx, -1)}
                disabled={idx === 0 || isPending}
                aria-label="Mover pra cima"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => move(idx, 1)}
                disabled={idx === order.length - 1 || isPending}
                aria-label="Mover pra baixo"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-1.5 border-t pt-5">
        <Label htmlFor="awardedSectionTitle">
          Título da seção de Títulos Premiados *
        </Label>
        <Input
          id="awardedSectionTitle"
          value={sectionTitle}
          onChange={(e) => setSectionTitle(e.target.value)}
          onBlur={() => {
            if (sectionTitle.trim() !== initial.awardedSectionTitle) {
              saveTitle();
            }
          }}
          placeholder="Títulos Premiados"
          maxLength={120}
        />
      </div>

      <div className="space-y-3 border-t pt-5">
        <UxToggle
          label="Mostrar os números de Títulos Premiados apenas quando distribuídos"
          description="Ative para mostrar os números premiados no site de vendas apenas quando premiado."
          checked={showOnlyWhenDistributed}
          onChange={applyToggle(
            "showAwardedOnlyWhenDistributed",
            setShowOnlyWhenDistributed
          )}
          disabled={isPending}
        />
        <UxToggle
          label="Mostrar o número em Títulos Premiados"
          description="Ative para mostrar os números premiados."
          checked={showInNumbers}
          onChange={applyToggle("showAwardedNumbers", setShowInNumbers)}
          disabled={isPending}
        />
        <UxToggle
          label="Mostrar o número em Títulos Premiados para Caixas"
          description="Ative para mostrar os números premiados."
          checked={showInBoxes}
          onChange={applyToggle("showAwardedNumbersBoxes", setShowInBoxes)}
          disabled={isPending}
        />
        <UxToggle
          label="Mostrar o número em Títulos Premiados para Roletas"
          description="Ative para mostrar os números premiados."
          checked={showInRoulette}
          onChange={applyToggle(
            "showAwardedNumbersRoulette",
            setShowInRoulette
          )}
          disabled={isPending}
        />
        <UxToggle
          label="Mostrar o número em Títulos Premiados para Raspadinhas"
          description="Ative para mostrar os números premiados."
          checked={showInScratch}
          onChange={applyToggle(
            "showAwardedNumbersScratchCard",
            setShowInScratch
          )}
          disabled={isPending}
        />
        <UxToggle
          label="Agrupar títulos premiados"
          description="Ative para agrupar os prêmios de todas as modalidades em uma única lista de prêmios."
          checked={aggregate}
          onChange={applyToggle("aggregateInstantAwards", setAggregate)}
          disabled={isPending}
        />
        <UxToggle
          label="Desabilitar repetição de ganhadores em prêmios instantâneos"
          description="Ative para impedir que o mesmo usuário ganhe mais de uma compra em prêmios instantâneos."
          checked={disableRepeat}
          onChange={applyToggle(
            "disableInstantAwardsRepeatWinners",
            setDisableRepeat
          )}
          disabled={isPending}
        />
      </div>
    </Card>
  );
}

// ---------------- ABA PREÇOS / PROMOÇÕES ----------------
// 3 toggles globais que controlam o que aparece na tela de compra
// pública: % promo, preço dos combos e taxas.

function PromosTab({ initial }: Props) {
  const [showPromotionsPercentage, setShowPromotionsPercentage] = useState(
    initial.showPromotionsPercentage
  );
  const [showCombosPrice, setShowCombosPrice] = useState(
    initial.showCombosPrice
  );
  const [showFees, setShowFees] = useState(initial.showFees);
  const [isPending, startTransition] = useTransition();

  function apply(update: Record<string, unknown>) {
    startTransition(async () => {
      const result = await updateSiteAction(update);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Configuração atualizada");
    });
  }

  function applyToggle(
    key: string,
    setter: (v: boolean) => void
  ): (v: boolean) => void {
    return (v: boolean) => {
      setter(v);
      apply({ [key]: v });
    };
  }

  return (
    <Card className="p-5 md:p-6 space-y-3">
      <UxToggle
        label="Mostrar porcentagem de promoções"
        description="Ative para mostrar a porcentagem de promoções na tela de compra."
        checked={showPromotionsPercentage}
        onChange={applyToggle(
          "showPromotionsPercentage",
          setShowPromotionsPercentage
        )}
        disabled={isPending}
      />
      <UxToggle
        label="Mostrar preços de combos"
        description="Ative para mostrar os preços dos combos na tela de compra."
        checked={showCombosPrice}
        onChange={applyToggle("showCombosPrice", setShowCombosPrice)}
        disabled={isPending}
      />
      <UxToggle
        label="Mostrar taxas"
        description="Ative para mostrar as taxas de compra."
        checked={showFees}
        onChange={applyToggle("showFees", setShowFees)}
        disabled={isPending}
      />
    </Card>
  );
}


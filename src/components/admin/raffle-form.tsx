"use client";

// Form de criação/edição de sorteio. Layout inspirado no Sorteamos:
// tabs horizontais com ícones (variant=line), card branco com seções,
// botão Salvar sticky no rodapé.
//
// Tabs implementadas: Geral, Títulos.
// Tabs marcadas "em breve" (visual apenas): Imagens, Prêmios, Afiliados,
// Títulos Premiados, Pagamento, Promoções, Alertas, Upsell, Anti Spam,
// Suporte, Capitalizadora, Restrições.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Award,
  Camera,
  CreditCard,
  Info,
  Loader2,
  Settings,
  Sparkles,
  TagsIcon,
  Ticket,
  Trophy,
} from "lucide-react";

import { RaffleImagesTab, type RaffleImageItem } from "@/components/admin/raffle-images-tab";
import { RafflePrizesTab } from "@/components/admin/raffle-prizes-tab";
import { RafflePromotionsTab } from "@/components/admin/raffle-promotions-tab";
import { RafflePaymentTab } from "@/components/admin/raffle-payment-tab";
import { RaffleAwardedTicketsTab } from "@/components/admin/raffle-awarded-tickets-tab";

import {
  raffleGeneralSchema,
  type RaffleGeneralInput,
} from "@/lib/validations/raffle";
import {
  createRaffleAction,
  updateRaffleAction,
} from "@/server/actions/raffles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { toSlug } from "@/lib/slug";

type Mode = { kind: "create" } | { kind: "edit"; id: string };

interface PrizeData {
  description: string;
}
interface PromotionData {
  quantity: number;
  price: number;
  label: string | null;
  type?: "QTY" | "MORE_THAN";
}

interface RaffleFormProps {
  mode: Mode;
  defaultValues?: Partial<RaffleGeneralInput>;
  // Dados de conteúdo das abas — só preenchidos no modo edit.
  initialImages?: RaffleImageItem[];
  initialPrizes?: PrizeData[];
  initialPromotions?: PromotionData[];
  // Dados da aba "Pagamento" — só populados no modo edit.
  initialPaymentProvider?: "SYNCPAY" | "CODEPAY" | null;
  tenantPaymentDefault?: "SYNCPAY" | "CODEPAY" | "MERCADO_PAGO";
  configuredProviders?: { syncpay: boolean; codepay: boolean };
  initialAwardedTickets?: {
    number: number;
    prizeDescription: string;
    participantName?: string | null;
  }[];
  initialAwardedConfig?: {
    enabled: boolean;
    showList: boolean;
    viewMode: "list" | "modal";
    winnerText: string;
    loserShow: boolean;
    loserTitle: string;
    loserText: string;
  };
  initialPromotionsConfig?: {
    enabled: boolean;
    doubleEnabled: boolean;
    accumulative: boolean;
  };
  initialPrizesConfig?: {
    show: boolean;
    ebook: {
      enabled: boolean;
      title: string;
      text: string;
      url: string;
      buttonText: string;
    };
  };
}

// Nada vem pré-preenchido na criação: texto vazio, switches OFF, datas
// null, categoria vazia. O admin escolhe tudo conscientemente. Os únicos
// campos sempre ON são name/phone/cpf em requiredFields (vêm do cadastro
// obrigatório do usuário; admin não pode desligar na UI). Selects com
// enum (privacy/modality/reservationModel/descriptionMode) ficam no
// primeiro valor pra evitar estado indefinido — admin troca se quiser.
const DEFAULT_VALUES: RaffleGeneralInput = {
  title: "",
  slug: "",
  shortDescription: "",
  description: "",
  descriptionMode: "COLLAPSED",
  category: "",
  privacy: "PUBLIC",
  showOnHome: false,
  drawDate: null,
  salesStart: null,
  autoCloseOnDraw: false,
  showDrawDate: false,
  allowReceiptDownload: false,
  showParticipantName: false,
  statusText: "",
  modality: "OWN_DRAW",
  reservationModel: "MANUAL",
  requiredFields: {
    name: true,
    phone: true,
    cpf: true,
    email: false,
    socialName: false,
    birthDate: false,
  },
  totalNumbers: 100,
  pricePerNumber: 1,
  isFree: false,
  freeLabel: null,
  hasFee: false,
  feeAmount: null,
  reservationTimeoutMinutes: 15,
  minPurchase: 1,
  maxPurchase: 100,
  initialQuantity: null,
  maxPerBuyer: null,
  showProgressBar: false,
  showDailyRanking: false,
  showOverallRanking: false,
  showShareButtons: false,
  selectionCards: [],
  selectionCardsBestseller: -1,
};

const TIMEOUT_OPTIONS = [
  { value: 3, label: "3 minutos" },
  { value: 5, label: "5 minutos" },
  { value: 10, label: "10 minutos" },
  { value: 15, label: "15 minutos" },
  { value: 30, label: "30 minutos" },
  { value: 60, label: "1 hora" },
  { value: 120, label: "2 horas" },
];

const CATEGORIES = [
  "Veículos",
  "Eletrônicos",
  "Imóveis",
  "Dinheiro",
  "Viagens",
  "Skins/Games",
  "Roupas/Acessórios",
  "Outros",
];

export function RaffleForm({
  mode,
  defaultValues,
  initialImages = [],
  initialPrizes = [],
  initialPromotions = [],
  initialPaymentProvider = null,
  tenantPaymentDefault = "SYNCPAY",
  configuredProviders = { syncpay: false, codepay: false },
  initialAwardedTickets = [],
  initialAwardedConfig = {
    enabled: true,
    showList: true,
    viewMode: "list" as const,
    winnerText: "",
    loserShow: true,
    loserTitle: "",
    loserText: "",
  },
  initialPromotionsConfig = {
    enabled: true,
    doubleEnabled: false,
    accumulative: false,
  },
  initialPrizesConfig = {
    show: true,
    ebook: {
      enabled: false,
      title: "",
      text: "",
      url: "",
      buttonText: "",
    },
  },
}: RaffleFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<string>("geral");
  const isEdit = mode.kind === "edit";
  const raffleId = mode.kind === "edit" ? mode.id : "";

  const form = useForm<RaffleGeneralInput>({
    resolver: zodResolver(
      raffleGeneralSchema
    ) as unknown as Resolver<RaffleGeneralInput>,
    defaultValues: { ...DEFAULT_VALUES, ...defaultValues },
  });

  const isFree = form.watch("isFree");
  const hasFee = form.watch("hasFee");

  function onSubmit(values: RaffleGeneralInput) {
    if (values.isFree) values.pricePerNumber = 0;

    startTransition(async () => {
      const result =
        mode.kind === "create"
          ? await createRaffleAction(values)
          : await updateRaffleAction({ id: mode.id, data: values });

      if (!result.ok) {
        toast.error(result.error);
        if (result.fieldErrors?.slug) {
          form.setError("slug", { message: result.fieldErrors.slug[0] });
        }
        return;
      }
      toast.success(
        mode.kind === "create" ? "Sorteio criado" : "Sorteio salvo"
      );
      if (mode.kind === "create") {
        router.push(`/admin/sorteios/${result.data.id}/editar`);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Tabs
          value={activeTab}
          onValueChange={(v) => v && setActiveTab(v)}
          className="gap-5"
        >
          <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
            <TabsList className="inline-flex h-auto w-auto min-w-full md:min-w-0 flex-nowrap items-center gap-1 rounded-2xl bg-muted/60 p-1.5 shadow-sm">
              <TabIcon value="geral" icon={Settings} label="Geral" />
              <TabIcon value="titulos" icon={Ticket} label="Títulos" />
              <TabIcon
                value="imagens"
                icon={Camera}
                label="Imagens"
                disabled={!isEdit}
              />
              <TabIcon
                value="premios"
                icon={Trophy}
                label="Prêmios"
                disabled={!isEdit}
              />
              <TabIcon
                value="premiados"
                icon={Award}
                label="Títulos Premiados"
              />
              <TabIcon value="pagamento" icon={CreditCard} label="Pagamento" />
              <TabIcon
                value="promocoes"
                icon={TagsIcon}
                label="Promoções"
                disabled={!isEdit}
              />
            </TabsList>
          </div>

          {/* =================== GERAL =================== */}
          {/* Layout flat (sem section-headers com ícone) seguindo a ordem
              do SkinsLendarias/Sorteamos: Identidade → Privacidade →
              Mostrar home → 3 selects → Modo descrição → Texto → Status
              → Início vendas → Data sorteio → 3 switches → Campos req. */}
          <TabsContent value="geral">
            <Card className="p-5 md:p-6 space-y-5">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Título *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Ex: Rifa do iPhone 16"
                        onChange={(e) => {
                          field.onChange(e);
                          // No modo CREATE, gera o slug automaticamente
                          // enquanto digita (se o usuário não mexeu ainda).
                          if (mode.kind === "create") {
                            const current = form.getValues("slug");
                            const generatedFromOld = toSlug(
                              form.formState.defaultValues?.title ?? ""
                            );
                            if (!current || current === generatedFromOld) {
                              form.setValue("slug", toSlug(e.target.value));
                            }
                          }
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>URL Amigável *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        placeholder="ex: rifa-iphone-16"
                        autoComplete="off"
                        onChange={(e) => {
                          const v = e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9-]/g, "");
                          field.onChange(v);
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      Essa é a URL que corresponderá ao sorteio.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="shortDescription"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Breve Descrição *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        placeholder="Aparece nos cards"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="privacy"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Privacidade</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(v) => v && field.onChange(v)}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue
                            labels={{
                              PUBLIC: "Público",
                              PRIVATE: "Privado (acessa apenas com link)",
                            }}
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="PUBLIC">Público</SelectItem>
                        <SelectItem value="PRIVATE">
                          Privado (acessa apenas com link)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <SwitchField
                control={form.control}
                name="showOnHome"
                label="Mostrar o sorteio na página inicial"
              />

              <div className="grid gap-4 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Categoria</FormLabel>
                      <Select
                        value={field.value ?? ""}
                        onValueChange={(v) => field.onChange(v ?? "")}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CATEGORIES.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="reservationModel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Modelo de Reserva</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(v) => v && field.onChange(v)}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue
                              labels={{
                                MANUAL: "Escolhe os bilhetes manualmente",
                                RANDOM_NUMBERS: "Números aleatórios",
                                SEQUENTIAL: "Sequencial",
                              }}
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="MANUAL">
                            Escolhe os bilhetes manualmente
                          </SelectItem>
                          <SelectItem value="RANDOM_NUMBERS">
                            Números aleatórios
                          </SelectItem>
                          <SelectItem value="SEQUENTIAL">Sequencial</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="modality"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Modalidade</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(v) => v && field.onChange(v)}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue
                              labels={{
                                OWN_DRAW: "Sorteio próprio",
                                LOTERIA_FEDERAL: "Loteria Federal",
                              }}
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="OWN_DRAW">
                            Sorteio próprio
                          </SelectItem>
                          <SelectItem value="LOTERIA_FEDERAL">
                            Loteria Federal
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="descriptionMode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Modo de Descrição</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(v) => v && field.onChange(v)}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue
                            labels={{
                              COLLAPSED: "Colapsado/Retraído",
                              EXPANDED: "Expandido",
                            }}
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="COLLAPSED">
                          Colapsado/Retraído
                        </SelectItem>
                        <SelectItem value="EXPANDED">Expandido</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Texto</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        value={field.value ?? ""}
                        rows={8}
                        placeholder="Detalhes da rifa, regulamento, etc..."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="statusText"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Texto do status *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        placeholder="Adquira já!"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Início das vendas — select Imediatamente/Agendado, revela
                  o datetime-local só quando Agendado. */}
              <FormField
                control={form.control}
                name="salesStart"
                render={({ field }) => {
                  const mode =
                    field.value != null ? "scheduled" : "immediate";
                  return (
                    <FormItem>
                      <FormLabel>Início das vendas</FormLabel>
                      <Select
                        value={mode}
                        onValueChange={(v) => {
                          if (!v) return;
                          if (v === "immediate") {
                            field.onChange(null);
                          } else if (!field.value) {
                            // Default: amanhã 00:00 — admin ajusta no
                            // datetime picker que aparece abaixo.
                            const tomorrow = new Date();
                            tomorrow.setDate(tomorrow.getDate() + 1);
                            tomorrow.setHours(0, 0, 0, 0);
                            field.onChange(tomorrow);
                          }
                        }}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue
                              labels={{
                                immediate: "Imediatamente",
                                scheduled: "Agendado",
                              }}
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="immediate">
                            Imediatamente
                          </SelectItem>
                          <SelectItem value="scheduled">Agendado</SelectItem>
                        </SelectContent>
                      </Select>
                      {mode === "scheduled" && (
                        <FormControl>
                          <Input
                            type="datetime-local"
                            className="mt-2"
                            value={
                              field.value
                                ? new Date(field.value)
                                    .toISOString()
                                    .slice(0, 16)
                                : ""
                            }
                            onChange={(e) =>
                              field.onChange(
                                e.target.value
                                  ? new Date(e.target.value)
                                  : null
                              )
                            }
                          />
                        </FormControl>
                      )}
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              <FormField
                control={form.control}
                name="drawDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data do Sorteio</FormLabel>
                    <FormControl>
                      <Input
                        type="datetime-local"
                        value={
                          field.value
                            ? new Date(field.value)
                                .toISOString()
                                .slice(0, 16)
                            : ""
                        }
                        onChange={(e) =>
                          field.onChange(
                            e.target.value ? new Date(e.target.value) : null
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <SwitchField
                  control={form.control}
                  name="autoCloseOnDraw"
                  label="Encerrar automático na data do sorteio"
                />
                <SwitchField
                  control={form.control}
                  name="showDrawDate"
                  label="Mostrar a data do sorteio para os participantes"
                />
                <SwitchField
                  control={form.control}
                  name="allowReceiptDownload"
                  label="Permite download do comprovante"
                />
              </div>

              {/* Campos requeridos pra realizar a reserva. Nome/Telefone/
                  CPF são sempre exigidos (vêm do cadastro). */}
              <div className="space-y-3 border-t pt-5">
                <p className="text-sm font-medium">
                  Campos requeridos para realizar a reserva
                </p>
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {(
                    [
                      { key: "name", label: "Nome", disabled: true },
                      { key: "phone", label: "Telefone", disabled: true },
                      { key: "cpf", label: "CPF", disabled: true },
                      { key: "email", label: "E-mail", disabled: false },
                      {
                        key: "socialName",
                        label: "Nome Social",
                        disabled: false,
                      },
                      {
                        key: "birthDate",
                        label: "Data de Nascimento",
                        disabled: false,
                      },
                    ] as const
                  ).map((f) => (
                    <FormField
                      key={f.key}
                      control={form.control}
                      name={`requiredFields.${f.key}` as const}
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-xl border bg-muted/30 px-3.5 py-2.5 hover:border-primary/30 hover:bg-muted/60 transition-colors">
                          <FormLabel className="m-0 text-sm font-medium">
                            {f.label}
                          </FormLabel>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              disabled={f.disabled}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* =================== TÍTULOS =================== */}
          {/* Layout flat (sem section-headers) seguindo o exemplo do
              SkinsLendarias/Sorteamos: Preço | Quantidade | Timeout → 2
              switches (gratuita/taxa) → maxPerBuyer → min/max/inicial →
              Cards de Seleção (até 6) + bestseller → switches finais. */}
          <TabsContent value="titulos">
            <Card className="p-5 md:p-6 space-y-5">
              <div className="grid gap-4 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="pricePerNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Preço da cota (R$)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          placeholder="0,00"
                          disabled={isFree}
                          {...field}
                          value={isFree ? 0 : (field.value ?? "")}
                        />
                      </FormControl>
                      {isFree && (
                        <FormDescription>
                          Campanha gratuita. Preço forçado em R$ 0,00.
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="totalNumbers"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantidade de cotas</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={10}
                          max={10_000_000}
                          placeholder="100"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="reservationTimeoutMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Tempo para uma reserva pendente expirar
                      </FormLabel>
                      <Select
                        value={String(field.value)}
                        onValueChange={(v) => v && field.onChange(Number(v))}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue
                              labels={Object.fromEntries(
                                TIMEOUT_OPTIONS.map((o) => [
                                  String(o.value),
                                  o.label,
                                ])
                              )}
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {TIMEOUT_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={String(o.value)}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <SwitchField
                  control={form.control}
                  name="isFree"
                  label="Campanha gratuita"
                />
                <SwitchField
                  control={form.control}
                  name="hasFee"
                  label="Adicionar taxa"
                />
              </div>

              {isFree && (
                <FormField
                  control={form.control}
                  name="freeLabel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Texto exibido no card de preço</FormLabel>
                      <FormControl>
                        <Input
                          maxLength={60}
                          placeholder="SORTEIO GRATUITO"
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(e.target.value || null)
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {hasFee && (
                <FormField
                  control={form.control}
                  name="feeAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valor da taxa (R$)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value
                                ? Number(e.target.value)
                                : null
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="maxPerBuyer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantidade de cotas por comprador</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        placeholder="0"
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                      />
                    </FormControl>
                    <FormDescription>
                      Coloque 0 para não ter limites de cotas por comprador.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="minPurchase"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantidade mínima por reserva *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="maxPurchase"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantidade máxima por reserva *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          placeholder="100"
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value
                                ? Number(e.target.value)
                                : null
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="initialQuantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantidade inicial por reserva</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          placeholder=""
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value
                                ? Number(e.target.value)
                                : null
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Cards de seleção rápida (quick-picks). Até 6 valores que
                  viram botões "+N" no form de reserva público. Inputs
                  vazios são ignorados (não vira card). bestseller marca
                  qual card recebe destaque "MAIS POPULAR". */}
              <div className="space-y-3 border-t pt-5">
                <p className="text-sm font-medium">
                  Configurações dos Cards de Seleção
                </p>
                <SelectionCardsField control={form.control} />
              </div>

              {/* Switches finais — barra de progresso, rankings e extras. */}
              <div className="space-y-2 border-t pt-5">
                <SwitchField
                  control={form.control}
                  name="showProgressBar"
                  label="Mostrar barra de progresso das vendas"
                />
                <SwitchField
                  control={form.control}
                  name="showDailyRanking"
                  label="Mostrar Ranking Diário de Maiores Compradores"
                />
                <SwitchField
                  control={form.control}
                  name="showOverallRanking"
                  label="Mostrar Ranking Geral de Maiores Compradores"
                />
                <SwitchField
                  control={form.control}
                  name="showParticipantName"
                  label="Mostrar o nome do participante em números pagos"
                />
                <SwitchField
                  control={form.control}
                  name="showShareButtons"
                  label="Mostrar botões de compartilhar"
                />
              </div>
            </Card>
          </TabsContent>

          {/* =================== IMAGENS =================== */}
          <TabsContent value="imagens">
            {isEdit ? (
              <RaffleImagesTab
                raffleId={raffleId}
                initialImages={initialImages}
              />
            ) : (
              <SaveFirstHint label="Salve o sorteio primeiro para enviar imagens." />
            )}
          </TabsContent>

          {/* =================== PRÊMIOS =================== */}
          <TabsContent value="premios">
            {isEdit ? (
              <RafflePrizesTab
                raffleId={raffleId}
                initialPrizes={initialPrizes}
                initialConfig={initialPrizesConfig}
              />
            ) : (
              <SaveFirstHint label="Salve o sorteio primeiro para cadastrar prêmios." />
            )}
          </TabsContent>

          {/* =================== TÍTULOS PREMIADOS =================== */}
          <TabsContent value="premiados">
            {isEdit ? (
              <RaffleAwardedTicketsTab
                raffleId={raffleId}
                totalNumbers={
                  form.watch("totalNumbers") ||
                  initialAwardedTickets[0]?.number ||
                  100
                }
                initialItems={initialAwardedTickets}
                initialConfig={initialAwardedConfig}
              />
            ) : (
              <SaveFirstHint label="Salve o sorteio primeiro para cadastrar títulos premiados." />
            )}
          </TabsContent>

          {/* =================== PAGAMENTO =================== */}
          <TabsContent value="pagamento">
            {isEdit ? (
              <RafflePaymentTab
                raffleId={raffleId}
                initialProvider={initialPaymentProvider}
                tenantDefault={tenantPaymentDefault}
                configuredProviders={configuredProviders}
              />
            ) : (
              <SaveFirstHint label="Salve o sorteio primeiro para escolher o gateway de pagamento." />
            )}
          </TabsContent>

          {/* =================== PROMOÇÕES =================== */}
          <TabsContent value="promocoes">
            {isEdit ? (
              <RafflePromotionsTab
                raffleId={raffleId}
                maxPurchase={form.watch("maxPurchase") ?? null}
                initialPromotions={initialPromotions}
                initialConfig={initialPromotionsConfig}
              />
            ) : (
              <SaveFirstHint label="Salve o sorteio primeiro para criar promoções." />
            )}
          </TabsContent>
        </Tabs>

        {/* Save sticky no rodapé — visível só nos tabs que pertencem ao
            form principal (Geral / Títulos). Os outros tabs têm save próprio. */}
        {(activeTab === "geral" || activeTab === "titulos") && (
          <div className="sticky bottom-0 -mx-4 md:-mx-6 border-t bg-background/85 px-4 md:px-6 py-3.5 backdrop-blur-md shadow-[0_-12px_24px_-12px_rgba(0,0,0,0.12)]">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-xs text-muted-foreground">
                {form.formState.isDirty
                  ? "Você tem alterações não salvas"
                  : isEdit
                  ? "Tudo salvo"
                  : "Preencha os campos obrigatórios pra criar"}
              </div>
              <Button
                type="submit"
                disabled={isPending}
                size="lg"
                className="min-w-[160px]"
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : mode.kind === "create" ? (
                  "Criar Sorteio"
                ) : (
                  "Salvar alterações"
                )}
              </Button>
            </div>
          </div>
        )}
      </form>
    </Form>
  );
}

// Card "em breve" — disponível pra reuso em tabs futuras (atualmente
// todas as principais já estão implementadas, mas mantido como helper
// pronto pra Alertas/Upsell/Anti Spam/etc).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function PlaceholderCard({
  title,
  description,
  icon: Icon = Sparkles,
}: {
  title: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon?: any;
}) {
  return (
    <Card className="p-8 md:p-12 flex flex-col items-center text-center gap-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
        <Icon className="h-6 w-6" />
      </div>
      <div className="space-y-1.5">
        <h3 className="font-semibold text-base">{title}</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
          {description}
        </p>
      </div>
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary mt-1">
        Em breve
      </span>
    </Card>
  );
}

// Aviso pras tabs que dependem de o sorteio já existir no banco
// (Imagens, Prêmios, Promoções no modo CREATE).
function SaveFirstHint({ label }: { label: string }) {
  return (
    <Card className="p-8 md:p-10 flex flex-col items-center text-center gap-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400">
        <Info className="h-5 w-5" />
      </div>
      <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
        {label}
      </p>
    </Card>
  );
}

// Tab com ícone e label, em formato pílula. Quando ativa, ganha
// background do card e ring sutil — sensação de chip selecionado.
function TabIcon({
  value,
  icon: Icon,
  label,
  disabled,
}: {
  value: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any;
  label: string;
  disabled?: boolean;
}) {
  return (
    <TabsTrigger
      value={value}
      disabled={disabled}
      className="flex-none gap-2 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-medium data-active:shadow-sm data-active:ring-1 data-active:ring-border/60"
      title={disabled ? "Em breve" : undefined}
    >
      <Icon className="h-4 w-4" />
      {label}
    </TabsTrigger>
  );
}

// 6 inputs numéricos pra quick-picks + dropdown "Card mais popular".
// O array `selectionCards` é a fonte da verdade; cada slot da UI lê/escreve
// na posição correspondente do array. Slots vazios mantêm "" no estado
// local e são filtrados na submissão (entram no array só os preenchidos).
function SelectionCardsField({
  control,
}: {
  control: ReturnType<typeof useForm<RaffleGeneralInput>>["control"];
}) {
  return (
    <FormField
      control={control}
      name="selectionCards"
      render={({ field: cardsField }) => {
        const cards: number[] = Array.isArray(cardsField.value)
          ? (cardsField.value as number[])
          : [];
        // UI sempre mostra 6 slots, mesmo que o array tenha menos itens.
        const slots: (number | "")[] = Array.from(
          { length: 6 },
          (_, i) => cards[i] ?? ""
        );

        function setSlot(idx: number, raw: string) {
          const next = [...slots];
          next[idx] = raw ? Math.max(1, Number(raw) || 0) : "";
          // Persiste só os preenchidos (mantém ordem dos slots).
          const cleaned = next.filter(
            (v): v is number => typeof v === "number" && v >= 1
          );
          cardsField.onChange(cleaned);
        }

        return (
          <FormItem>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {slots.map((value, idx) => (
                <FormItem key={idx}>
                  <FormLabel>{`Card - 0${idx + 1}`}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      placeholder=""
                      value={value}
                      onChange={(e) => setSlot(idx, e.target.value)}
                    />
                  </FormControl>
                </FormItem>
              ))}
            </div>

            <div className="pt-2">
              <FormField
                control={control}
                name="selectionCardsBestseller"
                render={({ field: bsField }) => {
                  const value = String(bsField.value ?? -1);
                  return (
                    <FormItem>
                      <FormLabel>Card mais popular</FormLabel>
                      <Select
                        value={value}
                        onValueChange={(v) => v && bsField.onChange(Number(v))}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue
                              labels={{
                                "-1": "Nenhum",
                                "0": "Card 1",
                                "1": "Card 2",
                                "2": "Card 3",
                                "3": "Card 4",
                                "4": "Card 5",
                                "5": "Card 6",
                              }}
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="-1">Nenhum</SelectItem>
                          <SelectItem value="0">Card 1</SelectItem>
                          <SelectItem value="1">Card 2</SelectItem>
                          <SelectItem value="2">Card 3</SelectItem>
                          <SelectItem value="3">Card 4</SelectItem>
                          <SelectItem value="4">Card 5</SelectItem>
                          <SelectItem value="5">Card 6</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            </div>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

function SwitchField({
  control,
  name,
  label,
  description,
}: {
  control: ReturnType<typeof useForm<RaffleGeneralInput>>["control"];
  name: keyof RaffleGeneralInput;
  label: string;
  description?: string;
}) {
  return (
    <FormField
      control={control}
      name={name as never}
      render={({ field }) => (
        <FormItem className="group/switch flex items-start justify-between gap-3 rounded-xl border bg-muted/30 px-3.5 py-3 hover:border-primary/30 hover:bg-muted/60 transition-colors data-[state=checked]:border-primary/40">
          <div className="flex-1 space-y-0.5">
            <FormLabel className="m-0 text-sm font-medium leading-snug cursor-pointer">
              {label}
            </FormLabel>
            {description && (
              <p className="text-[11px] text-muted-foreground leading-snug">
                {description}
              </p>
            )}
          </div>
          <FormControl>
            <Switch
              checked={Boolean(field.value)}
              onCheckedChange={field.onChange}
              className="mt-0.5"
            />
          </FormControl>
        </FormItem>
      )}
    />
  );
}

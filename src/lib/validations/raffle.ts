import { z } from "zod";

import { MAX_MIN_LEVEL } from "@/lib/rank";

export const raffleStatusSchema = z.enum([
  "DRAFT",
  // Preparada e na fila do cronograma. Invisível para o público, como
  // rascunho, e diferente dele no painel: rascunho é trabalho pela metade,
  // fila é trabalho pronto esperando a vez.
  "QUEUED",
  "ACTIVE",
  "FINISHED",
  "CANCELLED",
]);
export const rafflePrivacySchema = z.enum(["PUBLIC", "PRIVATE"]);
export const reservationModelSchema = z.enum([
  "RANDOM_NUMBERS",
  "SEQUENTIAL",
  "MANUAL",
]);
export const raffleModalitySchema = z.enum(["LOTERIA_FEDERAL", "OWN_DRAW"]);
export const descriptionModeSchema = z.enum(["EXPANDED", "COLLAPSED"]);

export const requiredFieldsSchema = z.object({
  name: z.boolean(),
  phone: z.boolean(),
  cpf: z.boolean(),
  email: z.boolean(),
  socialName: z.boolean().default(false),
  birthDate: z.boolean().default(false),
});

export type CamposObrigatorios = z.infer<typeof requiredFieldsSchema>;

/**
 * NOME, TELEFONE E CPF SÃO SEMPRE PEDIDOS, e agora os três lugares concordam.
 *
 * O painel mostra os três interruptores ligados e travados ("vêm do cadastro,
 * admin não desliga"), e era só isso que era verdade. A tela de edição lia o
 * JSON com `?? false`, então campanha antiga abria com os três desligados
 * embaixo de um interruptor travado em ligado; salvar gravava false; e a
 * página pública lia esse false e deixava de mostrar "Comprando como" e de
 * pedir o telefone que falta numa conta antiga. Três camadas, três respostas.
 *
 * Esta função é a resposta única. Roda na leitura e na gravação: campanha
 * antiga passa a ser interpretada do jeito certo sem migração de dados, e o
 * que o navegador mandar para esses três é ignorado.
 */
export function camposObrigatoriosCoerentes(
  bruto: Partial<CamposObrigatorios> | null | undefined,
): CamposObrigatorios {
  const rf = bruto ?? {};
  return {
    // A identidade vem da conta logada, sempre. Não existe compra anônima.
    name: true,
    phone: true,
    cpf: true,
    // Estes o admin escolhe de verdade.
    email: rf.email ?? false,
    socialName: rf.socialName ?? false,
    birthDate: rf.birthDate ?? false,
  };
}

// Schema da rifa, combina os campos das abas Geral E Títulos do form admin.
// O server action recebe tudo junto e particiona em raffle.create/update.
export const raffleGeneralSchema = z.object({
  // Geral
  title: z.string().min(3, "Título muito curto").max(200).trim(),
  // URL amigável (slug). Opcional: se vazia no create, é gerada do título.
  // Se preenchida, valida formato e checa unicidade no server action.
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use apenas letras minúsculas, números e hífens"
    )
    .min(3, "Mínimo 3 caracteres")
    .max(200)
    .optional()
    .or(z.literal("")),
  shortDescription: z.string().max(280).optional().nullable(),
  description: z.string().max(50_000).optional().nullable(),
  descriptionMode: descriptionModeSchema.default("COLLAPSED"),
  category: z.string().max(60).optional().nullable(),
  privacy: rafflePrivacySchema,
  showOnHome: z.coerce.boolean().default(false),
  drawDate: z.coerce.date().optional().nullable(),
  salesStart: z.coerce.date().optional().nullable(),
  autoCloseOnDraw: z.coerce.boolean().default(true),
  showDrawDate: z.coerce.boolean().default(true),
  allowReceiptDownload: z.coerce.boolean().default(true),
  /**
   * A campanha aceita Cupom de Entrada do programa de afiliados.
   *
   * Ligada por padrão. O cupom abate até o valor de face dele em uma cota, e a
   * pessoa paga a diferença quando a cota custa mais: não existe teto de preço.
   */
  aceitaCupomDeAfiliado: z.coerce.boolean().default(true),
  showParticipantName: z.coerce.boolean().default(false),
  // Continua aceito para não quebrar payload antigo, mas não alimenta mais
  // o selo: a faixa inicial virou automática e o texto dela mora em
  // Configurações > Mensagens. A coluna fica no banco, os dados não se
  // perdem, e nada na interface escreve aqui.
  statusText: z.string().max(200).optional().nullable(),
  modality: raffleModalitySchema,
  reservationModel: reservationModelSchema,
  requiredFields: requiredFieldsSchema,

  // Títulos
  totalNumbers: z.coerce
    .number()
    .int("Deve ser um número inteiro")
    .min(10, "Mínimo 10 números")
    .max(10_000_000, "Máximo 10.000.000 números"),
  pricePerNumber: z.coerce
    .number()
    .min(0, "Preço não pode ser negativo")
    .max(99_999_999.99),
  isFree: z.coerce.boolean().default(false),
  // Texto custom no card de preço quando isFree=true. Vazio/null = usa default.
  freeLabel: z
    .string()
    .max(60, "Máximo 60 caracteres")
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() ? v.trim() : null)),
  hasFee: z.coerce.boolean().default(false),
  feeAmount: z.coerce.number().min(0).max(99_999_999.99).optional().nullable(),
  reservationTimeoutMinutes: z.coerce
    .number()
    .int()
    .min(3, "Mínimo 3 minutos")
    .max(120, "Máximo 120 minutos")
    .default(15),
  minPurchase: z.coerce.number().int().min(1).max(10_000).default(1),
  maxPurchase: z.coerce
    .number()
    .int()
    .min(1)
    .max(10_000_000)
    .optional()
    .nullable(),
  initialQuantity: z.coerce
    .number()
    .int()
    .min(1)
    .max(10_000)
    .optional()
    .nullable(),
  maxPerBuyer: z.coerce
    .number()
    .int()
    .min(0)
    .max(10_000_000)
    .optional()
    .nullable(),
  // Campanha exclusiva: degrau mínimo do rank para reservar. Null/0 = aberta.
  // O teto é o GOAT, e não o nível 21: a escada segue nas patentes.
  minLevel: z.coerce
    .number()
    .int()
    .min(1, "Escolha um degrau entre o nível 1 e o GOAT")
    .max(MAX_MIN_LEVEL, "Escolha um degrau entre o nível 1 e o GOAT")
    .optional()
    .nullable(),
  showProgressBar: z.coerce.boolean().default(true),
  showDailyRanking: z.coerce.boolean().default(false),
  showOverallRanking: z.coerce.boolean().default(false),
  showShareButtons: z.coerce.boolean().default(true),
  // Quick-picks da página pública (até 6 valores >= 1). bestseller é
  // índice no array (-1 = nenhum destacado).
  selectionCards: z
    .array(z.coerce.number().int().min(1).max(10_000_000))
    .max(6, "Máximo 6 cards")
    .default([]),
  selectionCardsBestseller: z.coerce
    .number()
    .int()
    .min(-1)
    .max(5)
    .default(-1),
});
export type RaffleGeneralInput = z.infer<typeof raffleGeneralSchema>;

// Reserva pública, apenas nome é obrigatório no schema base.
// O ADMIN decide quais campos cobrar via raffle.requiredFields.
// A UI deve render só os campos pedidos; este schema aceita os demais como opcionais.
export const createReservationSchema = z.object({
  raffleId: z.string().cuid(),
  numbers: z
    .array(z.coerce.number().int().min(1))
    .min(1, "Selecione ao menos 1 número")
    .max(10_000, "Limite por reserva: 10.000 números"),
  participantName: z.string().min(2).max(120).trim(),
  participantPhone: z.string().min(10).max(20).optional().nullable(),
  participantCpf: z.string().min(11).max(14).optional().nullable(),
  participantEmail: z.string().email().optional().nullable(),
  participantSocialName: z.string().max(120).optional().nullable(),
  participantBirthDate: z.coerce.date().optional().nullable(),
  affiliateCode: z.string().max(64).optional().nullable(),
  utmSource: z.string().max(120).optional().nullable(),
  utmMedium: z.string().max(120).optional().nullable(),
  utmCampaign: z.string().max(120).optional().nullable(),
  utmContent: z.string().max(120).optional().nullable(),
});
export type CreateReservationInput = z.infer<typeof createReservationSchema>;

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Minus, Plus, X } from "lucide-react";

import { createReservationAction } from "@/server/actions/reservations";
import { AccountGateDialog } from "@/components/public/account-gate-dialog";
import { formatBRL } from "@/lib/format";
import { onlyDigits, formatCpf, formatPhone, isValidCpf } from "@/lib/cpf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { NumberGrid } from "./number-grid";

// Shape esperada de raffle.requiredFields (JSON com 6 toggles).
// `name` e `cpf` continuam aqui só por compat, na prática são ignorados,
// pois identidade vem SEMPRE da conta logada.
export interface RequiredFields {
  name: boolean;
  phone: boolean;
  cpf: boolean;
  email: boolean;
  socialName: boolean;
  birthDate: boolean;
}

// Schema dinâmico: nome/telefone/CPF vêm da sessão (todos garantidos pelo
// cadastro). CPF e telefone só aparecem aqui como fallback pra contas
// legadas criadas antes desses campos virarem obrigatórios, depois da
// primeira reserva, o action salva no usuário pra não pedir de novo. Os
// outros campos secundários (e-mail/nome social/data) seguem o toggle do
// admin.
function buildSchema(
  req: RequiredFields,
  needsCpfInput: boolean,
  needsPhoneInput: boolean
) {
  return z.object({
    participantCpf: needsCpfInput
      ? z
          .string()
          .transform(onlyDigits)
          .refine(isValidCpf, "CPF inválido")
      : z.string().optional(),
    participantPhone: needsPhoneInput
      ? z
          .string()
          .transform(onlyDigits)
          .refine(
            (v) => v.length >= 10 && v.length <= 11,
            "Telefone inválido"
          )
      : z.string().optional(),
    participantEmail: req.email
      ? z.string().email("E-mail inválido")
      : z.string().optional(),
    participantSocialName: req.socialName
      ? z.string().min(2, "Mínimo 2 caracteres")
      : z.string().optional(),
    participantBirthDate: req.birthDate
      ? z.string().min(10, "Data inválida")
      : z.string().optional(),
  });
}

export interface CurrentUser {
  id: string;
  name: string;
  cpf: string | null;
  phone: string | null;
  email: string | null;
}

interface ReservationFormProps {
  raffleId: string;
  totalNumbers: number;
  takenNumbers: number[];
  minPurchase: number;
  maxPurchase?: number;
  initialQuantity?: number;
  reservationModel: "RANDOM_NUMBERS" | "SEQUENTIAL" | "MANUAL";
  requiredFields: RequiredFields;
  /** null = visitante sem conta. O seletor aparece igual; a conta é pedida
   *  só na hora de confirmar. */
  currentUser: CurrentUser | null;
  pricePerNumber: number;
  // Quick-picks configurados pelo admin. Array vazio = sem cards (mostra
  // só o stepper -/+). bestsellerIndex >= 0 destaca o card no índice
  // correspondente com badge "MAIS POPULAR".
  selectionCards: number[];
  selectionCardsBestseller: number;
}

export function ReservationForm({
  raffleId,
  totalNumbers,
  takenNumbers,
  minPurchase,
  maxPurchase,
  initialQuantity,
  reservationModel,
  requiredFields,
  currentUser,
  pricePerNumber,
  selectionCards,
  selectionCardsBestseller,
}: ReservationFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Guarda o que a pessoa escolheu enquanto ela cria a conta, para a reserva
  // continuar de onde parou em vez de recomeçar do zero.
  const [pedindoConta, setPedindoConta] = useState(false);
  // Estado, não ref: o React Compiler barra ler ref durante o render, e
  // onSubmit é entregue a form.handleSubmit() ali mesmo. Guardar em estado
  // também basta, porque a leitura só acontece depois que a pessoa conclui o
  // cadastro, vários renders adiante.
  const [valoresPendentes, setValoresPendentes] = useState<Values | null>(null);
  const isLoggedIn = currentUser !== null;

  const isManualMode = reservationModel === "MANUAL" && totalNumbers <= 500;

  const [quantity, setQuantity] = useState<number>(
    initialQuantity ?? minPurchase
  );
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);

  // Visitante informa CPF e celular ao criar a conta, então esses campos não
  // se repetem aqui; para quem já tem conta, só aparecem se faltarem nela.
  const needsCpfInput = isLoggedIn && requiredFields.cpf && !currentUser.cpf;
  const needsPhoneInput = isLoggedIn && requiredFields.phone && !currentUser.phone;
  const schema = buildSchema(requiredFields, needsCpfInput, needsPhoneInput);
  type Values = z.infer<typeof schema>;

  const form = useForm<Values>({
    resolver: zodResolver(schema) as unknown as Resolver<Values>,
    defaultValues: {
      participantCpf: "",
      participantPhone: "",
      participantEmail: currentUser?.email ?? "",
      participantSocialName: "",
      participantBirthDate: "",
    },
  });

  const effectiveQty = isManualMode ? selectedNumbers.length : quantity;

  function clampQty(v: number) {
    const min = Math.max(1, minPurchase);
    const max = maxPurchase ?? 10_000;
    return Math.max(min, Math.min(max, v));
  }

  function onSubmit(values: Values) {
    if (isManualMode) {
      if (selectedNumbers.length === 0) {
        toast.error("Selecione ao menos um número");
        return;
      }
      if (selectedNumbers.length < minPurchase) {
        toast.error(`Mínimo ${minPurchase} número(s)`);
        return;
      }
      if (maxPurchase && selectedNumbers.length > maxPurchase) {
        toast.error(`Máximo ${maxPurchase} número(s)`);
        return;
      }
    } else {
      if (quantity < minPurchase) {
        toast.error(`Mínimo ${minPurchase} número(s)`);
        return;
      }
      if (maxPurchase && quantity > maxPurchase) {
        toast.error(`Máximo ${maxPurchase} número(s)`);
        return;
      }
    }

    // Sem conta, a escolha fica guardada e o cadastro aparece por cima. A
    // reserva continua sozinha assim que a sessão existir, a pessoa não
    // volta para uma tela vazia nem refaz a seleção.
    if (!isLoggedIn) {
      setValoresPendentes(values);
      setPedindoConta(true);
      return;
    }

    criarReserva(values);
  }

  function criarReserva(values: Values) {
    startTransition(async () => {
      const base = isManualMode
        ? { numbers: selectedNumbers }
        : { quantity };

      const payload = {
        raffleId,
        ...base,
        participantCpf: values.participantCpf || "",
        participantPhone: values.participantPhone || "",
        participantEmail: values.participantEmail || "",
        participantSocialName: values.participantSocialName || "",
        participantBirthDate: values.participantBirthDate || undefined,
      };

      const result = await createReservationAction(payload);
      if (!result.ok) {
        toast.error(result.error);
        // Se a conta acabou de ser criada, a página ainda está desenhada como
        // visitante; recarrega para ela refletir a sessão nova.
        if (!isLoggedIn) router.refresh();
        return;
      }
      toast.success("Reserva criada!");
      router.push(`/comprovante/${result.data.reservationId}`);
    });
  }

  function aoEntrarNaConta() {
    setPedindoConta(false);
    const pendentes = valoresPendentes;
    setValoresPendentes(null);
    if (pendentes) {
      // loginAction já gravou o cookie de sessão, então a próxima server
      // action vai autenticada. Não recarrega aqui: a reserva navega para o
      // comprovante logo em seguida.
      criarReserva(pendentes);
      return;
    }
    router.refresh();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3.5">
        {isManualMode ? (
          <ManualPicker
            totalNumbers={totalNumbers}
            takenNumbers={takenNumbers}
            selectedNumbers={selectedNumbers}
            setSelectedNumbers={setSelectedNumbers}
            maxPurchase={maxPurchase}
          />
        ) : (
          <QuantityPicker
            quantity={quantity}
            onChange={(v) => setQuantity(clampQty(v))}
            minPurchase={minPurchase}
            maxPurchase={maxPurchase}
            pricePerNumber={pricePerNumber}
            selectionCards={selectionCards}
            selectionCardsBestseller={selectionCardsBestseller}
          />
        )}

        {currentUser && (
          <AccountSummary
            currentUser={currentUser}
            requiredFields={requiredFields}
          />
        )}

        <ParticipantExtras
          control={form.control}
          requiredFields={requiredFields}
          needsCpfInput={needsCpfInput}
          needsPhoneInput={needsPhoneInput}
        />

        {/* Confirmação enxuta: o stepper logo acima já mostra o número, então
            aqui basta uma linha, no celular cada bloco alto empurra o botão
            para fora da tela. */}
        <p className="text-center text-xs text-muted-foreground">
          <strong className="tabular-nums text-foreground">{effectiveQty}</strong>{" "}
          {effectiveQty === 1 ? "número selecionado" : "números selecionados"}
        </p>

        {/* O total vai no botão, como nas três referências do mercado: o
            número decidido some de vista assim que a pessoa rola, e repetir
            o valor no ponto do clique evita a dúvida de "quanto mesmo vou
            pagar?" bem na hora de confirmar. */}
        <Button
          type="submit"
          // O pulso para quando não há o que enviar: anel chamando atenção
          // para um botão desabilitado convida ao clique que não funciona.
          className={cn(
            "h-13 w-full flex-col gap-0 text-base font-semibold leading-tight",
            !isPending && effectiveQty > 0 && "cta-pulsa"
          )}
          disabled={isPending || effectiveQty === 0}
        >
          {isPending ? (
            "Reservando..."
          ) : (
            <>
              <span>Quero participar</span>
              {effectiveQty > 0 && (
                <span className="text-xs font-bold tabular-nums opacity-90">
                  {formatBRL(effectiveQty * pricePerNumber)}
                </span>
              )}
            </>
          )}
        </Button>

        {/* Só entra em cena quando a reserva exige uma conta que ainda não
            existe. Fechar o diálogo mantém a seleção intacta. */}
        <AccountGateDialog
          open={pedindoConta}
          onOpenChange={setPedindoConta}
          quantidade={effectiveQty}
          total={formatBRL(effectiveQty * pricePerNumber)}
          onAuthenticated={aoEntrarNaConta}
        />
      </form>
    </Form>
  );
}

function QuantityPicker({
  quantity,
  onChange,
  minPurchase,
  maxPurchase,
  pricePerNumber,
  selectionCards,
  selectionCardsBestseller,
}: {
  quantity: number;
  onChange: (v: number) => void;
  minPurchase: number;
  maxPurchase?: number;
  pricePerNumber: number;
  selectionCards: number[];
  selectionCardsBestseller: number;
}) {
  // Descarta card que não soma nada e card maior que o teto de compra, que
  // seria sempre aparado. O piso mínimo não filtra mais: com o clique
  // somando, um card de +2 continua útil numa campanha de mínimo 10, são
  // cinco cliques, não um card inválido.
  const cards = selectionCards.filter(
    (q) => q > 0 && (!maxPurchase || q <= maxPurchase)
  );
  return (
    <div className="space-y-2.5">
      <p className="text-center text-[13px] text-muted-foreground">
        Quanto mais títulos, mais chances de ganhar
      </p>

      {cards.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {cards.map((q, idx) => {
            const popular = idx === selectionCardsBestseller;
            // Preço do acréscimo, não do total: o card soma q cotas ao que
            // já está escolhido.
            const precoDoAcrescimo = pricePerNumber * q;
            return (
              <button
                key={`${q}-${idx}`}
                type="button"
                // Soma ao contador em vez de substituí-lo. O rótulo diz
                // "+10", então dois cliques têm de dar 20, trocar o valor
                // fazia o segundo clique não mudar nada, contradizendo o
                // próprio rótulo.
                onClick={() => onChange(quantity + q)}
                className={cn(
                  "relative flex flex-col items-center gap-0 rounded-xl border-2 px-2 py-2.5 text-center transition-all",
                  popular
                    ? "border-amber-500 bg-amber-500/10"
                    : "border-border hover:border-primary/40 active:border-primary"
                )}
              >
                {/* A luz sai escalonada por card, meio segundo entre um e o
                    seguinte: os seis brilhando juntos viram um flash da
                    grade inteira, e em sequência lê-se como uma passada. */}
                <span
                  aria-hidden
                  className="brilho-do-card"
                  style={{ ["--atraso-do-brilho" as string]: `${idx * 0.5}s` }}
                />

                {popular && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-amber-500 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white whitespace-nowrap">
                    Mais popular
                  </span>
                )}
                <p className="text-lg font-extrabold">+{q}</p>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  +R${" "}
                  {precoDoAcrescimo.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                  Adicionar
                </p>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2">
        {/* Zerar a escolha. Com os cards somando, quem clicou em +1000 por
            engano teria de apertar "−" mil vezes para voltar. Só aparece
            quando há o que desfazer. */}
        {quantity > minPurchase && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onChange(minPurchase)}
            aria-label="Limpar seleção"
            title="Limpar seleção"
            className="text-destructive hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => onChange(quantity - 1)}
          aria-label="Diminuir"
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Input
          type="number"
          inputMode="numeric"
          value={quantity}
          onChange={(e) => onChange(Number(e.target.value) || minPurchase)}
          className="text-center text-lg font-semibold tabular-nums h-11"
          min={minPurchase}
          max={maxPurchase ?? undefined}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => onChange(quantity + 1)}
          aria-label="Aumentar"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ManualPicker({
  totalNumbers,
  takenNumbers,
  selectedNumbers,
  setSelectedNumbers,
  maxPurchase,
}: {
  totalNumbers: number;
  takenNumbers: number[];
  selectedNumbers: number[];
  setSelectedNumbers: (n: number[]) => void;
  maxPurchase?: number;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Escolha seus números</span>
        {selectedNumbers.length > 0 && (
          <button
            type="button"
            onClick={() => setSelectedNumbers([])}
            className="text-xs font-medium text-destructive hover:underline"
          >
            Limpar
          </button>
        )}
      </div>
      <NumberGrid
        totalNumbers={totalNumbers}
        takenNumbers={takenNumbers}
        selected={selectedNumbers}
        onChange={setSelectedNumbers}
        maxSelectable={maxPurchase}
      />
    </div>
  );
}

// Mostra nome/CPF/telefone da conta logada, mas só os campos que o admin
// ligou em requiredFields. Tudo OFF → card inteiro some (a rifa não pediu
// nenhuma confirmação de identidade). Cada linha precisa do toggle E do
// dado existir na conta.
function AccountSummary({
  currentUser,
  requiredFields,
}: {
  currentUser: CurrentUser;
  requiredFields: RequiredFields;
}) {
  const showName = requiredFields.name;
  const showPhone = requiredFields.phone && Boolean(currentUser.phone);

  if (!showName && !showPhone) return null;

  return (
    <div className="rounded-xl border bg-muted/30 px-4 py-3 text-sm space-y-0.5">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Comprando como
      </div>
      {showName && <div className="font-semibold">{currentUser.name}</div>}
      {showPhone && (
        <div className="text-xs text-muted-foreground tabular-nums">
          Tel {formatPhone(currentUser.phone!)}
        </div>
      )}
    </div>
  );
}

// Campos extras, nome/CPF/telefone vêm da sessão. CPF e telefone só
// aparecem aqui pra contas legadas que ainda não têm; e-mail/nome
// social/data seguem os toggles do admin.
function ParticipantExtras({
  control,
  requiredFields,
  needsCpfInput,
  needsPhoneInput,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: any;
  requiredFields: RequiredFields;
  needsCpfInput: boolean;
  needsPhoneInput: boolean;
}) {
  const showAny =
    needsCpfInput ||
    needsPhoneInput ||
    requiredFields.email ||
    requiredFields.socialName ||
    requiredFields.birthDate;

  if (!showAny) return null;

  return (
    <div className="space-y-3 border-t pt-4">
      <p className="text-sm font-semibold tracking-tight">Dados adicionais</p>

      {needsCpfInput && (
        <FormField
          control={control}
          name="participantCpf"
          render={({ field }) => (
            <FormItem>
              <FormLabel>CPF</FormLabel>
              <FormControl>
                <Input
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="000.000.000-00"
                  value={field.value ?? ""}
                  onChange={(e) => {
                    const digits = e.target.value
                      .replace(/\D/g, "")
                      .slice(0, 11);
                    field.onChange(
                      digits.length === 11 ? formatCpf(digits) : digits
                    );
                  }}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {(needsPhoneInput || requiredFields.email) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {needsPhoneInput && (
            <FormField
              control={control}
              name="participantPhone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefone</FormLabel>
                  <FormControl>
                    <Input
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="(11) 99999-9999"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          {requiredFields.email && (
            <FormField
              control={control}
              name="participantEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-mail</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="email"
                      placeholder="voce@exemplo.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>
      )}

      {requiredFields.socialName && (
        <FormField
          control={control}
          name="participantSocialName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome social</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {requiredFields.birthDate && (
        <FormField
          control={control}
          name="participantBirthDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Data de nascimento</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </div>
  );
}

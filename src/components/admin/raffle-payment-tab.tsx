"use client";

// Aba "Pagamento" do editar-sorteio: escolha do gateway de PIX desse
// sorteio específico. Credenciais ficam no tenant (Admin → Configurações
// → Pagamentos); aqui o admin só decide qual gateway esse sorteio usa.
//
// "Padrão do site" = NULL no banco, quando o admin trocar o default do
// tenant, esse sorteio acompanha. Os outros valores fixam o gateway
// independente do default.

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  ExternalLink,
} from "lucide-react";

import { setRafflePaymentProviderAction } from "@/server/actions/raffle-content";
import { Button } from "@/components/ui/button";
import { StickySaveBar } from "@/components/admin/sticky-save-bar";
import { SecaoDoFormulario } from "@/components/admin/secao-de-formulario";
import type { PaymentProvider as PaymentProviderEnum } from "@prisma/client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ProviderChoice =
  | "DEFAULT"
  | "SYNCPAY"
  | "SIGILOPAY"
  | "NEXUSPAG"
  | "HORSEPAY";

// O padrao do tenant e o enum inteiro do banco, e nao a lista que este seletor
// oferece: o tenant pode estar num gateway que ainda nao da para escolher por
// sorteio, e a tela precisa saber dizer o nome dele mesmo assim.
type ProviderDoTenant = PaymentProviderEnum;

interface Props {
  raffleId: string;
  /** Override do sorteio. NULL/undefined → herda o do tenant. */
  initialProvider: "SYNCPAY" | "SIGILOPAY" | "NEXUSPAG" | "HORSEPAY" | null;
  /** Default ativo no tenant. Usado pra mostrar "(SyncPay)" do lado de "Padrão do site". */
  tenantDefault: ProviderDoTenant;
  /** Provedores cujas credenciais já estão configuradas no tenant. */
  configuredProviders: {
    syncpay: boolean;
    sigilopay: boolean;
    nexuspag: boolean;
    horsepay: boolean;
  };
}

function toChoice(
  v: "SYNCPAY" | "SIGILOPAY" | "NEXUSPAG" | "HORSEPAY" | null,
): ProviderChoice {
  return v ?? "DEFAULT";
}

function fromChoice(
  c: ProviderChoice,
): "SYNCPAY" | "SIGILOPAY" | "NEXUSPAG" | "HORSEPAY" | null {
  return c === "DEFAULT" ? null : c;
}

export function RafflePaymentTab({
  raffleId,
  initialProvider,
  tenantDefault,
  configuredProviders,
}: Props) {
  const [choice, setChoice] = useState<ProviderChoice>(
    toChoice(initialProvider),
  );
  const [saved, setSaved] = useState<ProviderChoice>(toChoice(initialProvider));
  const [isPending, startTransition] = useTransition();

  const effective: ProviderDoTenant =
    choice === "DEFAULT" ? tenantDefault : choice;
  const effectiveConfigured =
    effective === "HORSEPAY"
      ? configuredProviders.horsepay
      : effective === "SYNCPAY"
        ? configuredProviders.syncpay
        : effective === "SIGILOPAY"
          ? configuredProviders.sigilopay
          : effective === "NEXUSPAG"
            ? configuredProviders.nexuspag
            : false;

  function onSave() {
    startTransition(async () => {
      const result = await setRafflePaymentProviderAction({
        raffleId,
        paymentProvider: fromChoice(choice),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Gateway do sorteio salvo");
      setSaved(choice);
    });
  }

  const dirty = choice !== saved;

  return (
    <>
      <SecaoDoFormulario
        titulo="Quem gera o PIX desta campanha"
        descricao="Reservas já criadas continuam no gateway antigo até serem pagas ou expirarem, então trocar aqui só vale para as compras novas."
        icone={<CreditCard className="h-4 w-4" />}
      >
        <div className="space-y-1.5">
          <Label>Provider pra esse sorteio</Label>
          <Select
            value={choice}
            onValueChange={(v) => v && setChoice(v as ProviderChoice)}
          >
            <SelectTrigger className="w-full sm:w-80">
              <SelectValue
                labels={{
                  DEFAULT: `Padrão do site (${labelFor(tenantDefault)})`,
                  SYNCPAY: "SyncPay",
                  SIGILOPAY: "SigiloPay",
                  NEXUSPAG: "NexusPag",
                  HORSEPAY: "HorsePay",
                }}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DEFAULT">
                Padrão do site ({labelFor(tenantDefault)})
              </SelectItem>
              <SelectItem value="SYNCPAY">SyncPay</SelectItem>
              <SelectItem value="SIGILOPAY">SigiloPay</SelectItem>
              <SelectItem value="NEXUSPAG">NexusPag</SelectItem>
              <SelectItem value="HORSEPAY">HorsePay</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Padrão do site segue o gateway global; trocar ele afeta todos os
            sorteios que estão como &ldquo;Padrão do site&rdquo;. Escolher um
            provider específico fixa esse sorteio nele.
          </p>
        </div>

        {/* O estado de agora, e não a escolha: é ele que diz se a campanha
            consegue receber. */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3.5 text-sm">
          {effectiveConfigured ? (
            <div className="flex items-start gap-2 text-emerald-400">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium">
                  Esse sorteio vai gerar PIX via {labelFor(effective)}.
                </div>
                <div className="text-xs text-emerald-400/80">
                  As credenciais já estão cadastradas no site.
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 text-amber-400">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="flex-1">
                <div className="font-medium">
                  Credenciais de {labelFor(effective)} não configuradas.
                </div>
                <div className="text-xs text-amber-400/80">
                  Cadastre as credenciais no site primeiro, senão esse sorteio
                  não vai gerar PIX.
                </div>
                <Link
                  href="/admin/configuracoes/pagamentos"
                  className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2"
                >
                  Configurar credenciais
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </SecaoDoFormulario>
      <StickySaveBar
        status={dirty ? "Você tem alterações não salvas" : "Tudo salvo"}
      >
        <Button type="button" onClick={onSave} disabled={isPending || !dirty}>
          {isPending ? "Salvando..." : "Salvar alterações"}
        </Button>
      </StickySaveBar>
    </>
  );
}

function labelFor(p: ProviderDoTenant): string {
  if (p === "HORSEPAY") return "HorsePay";
  if (p === "MERCADO_PAGO") return "Mercado Pago";
  if (p === "SIGILOPAY") return "SigiloPay";
  if (p === "NEXUSPAG") return "NexusPag";
  return "SyncPay";
}

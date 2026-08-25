"use client";

// Aba "Pagamento" do editar-sorteio: escolha do gateway de PIX desse
// sorteio específico. Credenciais ficam no tenant (Admin → Configurações
// → Pagamentos); aqui o admin só decide qual gateway esse sorteio usa.
//
// "Padrão do site" = NULL no banco — quando o admin trocar o default do
// tenant, esse sorteio acompanha. Os outros valores fixam o gateway
// independente do default.

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, AlertCircle } from "lucide-react";

import { setRafflePaymentProviderAction } from "@/server/actions/raffle-content";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ProviderChoice = "DEFAULT" | "SYNCPAY" | "CODEPAY";

interface Props {
  raffleId: string;
  /** Override do sorteio. NULL/undefined → herda o do tenant. */
  initialProvider: "SYNCPAY" | "CODEPAY" | null;
  /** Default ativo no tenant. Usado pra mostrar "(SyncPay)" do lado de "Padrão do site". */
  tenantDefault: "SYNCPAY" | "CODEPAY" | "MERCADO_PAGO";
  /** Provedores cujas credenciais já estão configuradas no tenant. */
  configuredProviders: {
    syncpay: boolean;
    codepay: boolean;
  };
}

function toChoice(v: "SYNCPAY" | "CODEPAY" | null): ProviderChoice {
  return v ?? "DEFAULT";
}

function fromChoice(c: ProviderChoice): "SYNCPAY" | "CODEPAY" | null {
  return c === "DEFAULT" ? null : c;
}

export function RafflePaymentTab({
  raffleId,
  initialProvider,
  tenantDefault,
  configuredProviders,
}: Props) {
  const [choice, setChoice] = useState<ProviderChoice>(toChoice(initialProvider));
  const [saved, setSaved] = useState<ProviderChoice>(toChoice(initialProvider));
  const [isPending, startTransition] = useTransition();

  const effective: "SYNCPAY" | "CODEPAY" | "MERCADO_PAGO" =
    choice === "DEFAULT" ? tenantDefault : choice;
  const effectiveConfigured =
    effective === "CODEPAY"
      ? configuredProviders.codepay
      : effective === "SYNCPAY"
      ? configuredProviders.syncpay
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
    <Card className="p-5 space-y-5">
      <div>
        <h2 className="text-base font-semibold">Gateway de pagamento</h2>
        <p className="text-sm text-muted-foreground">
          Escolha qual provider gera o PIX desse sorteio. Reservas já criadas
          continuam no gateway antigo até serem pagas ou expirarem.
        </p>
      </div>

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
                CODEPAY: "CodePay",
              }}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="DEFAULT">
              Padrão do site ({labelFor(tenantDefault)})
            </SelectItem>
            <SelectItem value="SYNCPAY">SyncPay</SelectItem>
            <SelectItem value="CODEPAY">CodePay</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Padrão do site segue o gateway global; trocar ele afeta todos os
          sorteios que estão como &ldquo;Padrão do site&rdquo;. Escolher um
          provider específico fixa esse sorteio nele.
        </p>
      </div>

      <div className="rounded-lg border bg-muted/30 p-3 text-sm">
        {effectiveConfigured ? (
          <div className="flex items-start gap-2 text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">
                Esse sorteio vai gerar PIX via {labelFor(effective)}.
              </div>
              <div className="text-xs text-emerald-700/80 dark:text-emerald-300/80">
                Credenciais configuradas no tenant.
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2 text-amber-700 dark:text-amber-300">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="font-medium">
                Credenciais de {labelFor(effective)} não configuradas.
              </div>
              <div className="text-xs text-amber-700/80 dark:text-amber-300/80">
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

      <div className="flex justify-end">
        <Button type="button" onClick={onSave} disabled={isPending || !dirty}>
          {isPending ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </Card>
  );
}

function labelFor(p: "SYNCPAY" | "CODEPAY" | "MERCADO_PAGO"): string {
  if (p === "CODEPAY") return "CodePay";
  if (p === "MERCADO_PAGO") return "Mercado Pago";
  return "SyncPay";
}

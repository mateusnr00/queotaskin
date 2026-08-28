"use client";

// Form de configuração do gateway de PIX por tenant.
//
// - Toggle provider (SyncPay/CodePay) muda quais campos aparecem.
// - Secrets nunca voltam do servidor, quando já tem um salvo, mostramos
//   placeholder "•••• já configurado" e enviar vazio = manter o atual.
// - Mostra a URL exata do webhook que o admin precisa cadastrar no painel
//   do gateway (CodePay é global no painel deles; SyncPay vem no postback
//   da request, mas a URL é a mesma).

import { useState, useTransition } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ExternalLink, Copy, Check } from "lucide-react";

import { updatePaymentSettingsAction } from "@/server/actions/payment-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Mantém em sync com paymentSettingsSchema do server action.
const schema = z.object({
  provider: z.enum(["SYNCPAY", "CODEPAY", "SIGILOPAY"]),
  syncpayClientId: z.string().max(200).optional().default(""),
  syncpayClientSecret: z.string().max(500).optional().default(""),
  syncpayBaseUrl: z.string().max(300).optional().default(""),
  codepayClientId: z.string().max(200).optional().default(""),
  codepayPassword: z.string().max(500).optional().default(""),
  sigilopayClientId: z.string().max(200).optional().default(""),
  sigilopayClientSecret: z.string().max(500).optional().default(""),
});
type FormValues = z.infer<typeof schema>;

interface InitialValues {
  provider: "SYNCPAY" | "CODEPAY" | "SIGILOPAY";
  syncpayClientId: string;
  syncpayClientSecretConfigured: boolean;
  syncpayBaseUrl: string;
  codepayClientId: string;
  codepayPasswordConfigured: boolean;
  sigilopayClientId: string;
  sigilopayClientSecretConfigured: boolean;
}

interface Props {
  initial: InitialValues;
  webhookUrls: {
    syncpay: string | null;
    codepay: string | null;
    sigilopay: string | null;
  };
}

export function PaymentSettingsForm({ initial, webhookUrls }: Props) {
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<FormValues>,
    defaultValues: {
      provider: initial.provider,
      syncpayClientId: initial.syncpayClientId,
      syncpayClientSecret: "",
      syncpayBaseUrl: initial.syncpayBaseUrl,
      codepayClientId: initial.codepayClientId,
      codepayPassword: "",
      sigilopayClientId: initial.sigilopayClientId,
      sigilopayClientSecret: "",
    },
  });

  const provider = form.watch("provider");

  function onSubmit(values: FormValues) {
    setServerError(null);
    startTransition(async () => {
      const result = await updatePaymentSettingsAction(values);
      if (!result.ok) {
        setServerError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Configuração de pagamento salva");
      // Reseta os campos de secret (o servidor não devolve eles).
      form.reset({
        ...values,
        syncpayClientSecret: "",
        codepayPassword: "",
        sigilopayClientSecret: "",
      });
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <FormField
          control={form.control}
          name="provider"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Gateway padrão</FormLabel>
              <FormControl>
                <Select
                  value={field.value}
                  onValueChange={(v) => v && field.onChange(v)}
                >
                  <SelectTrigger className="w-full sm:w-60">
                    <SelectValue
                      labels={{
                        SYNCPAY: "SyncPay",
                        CODEPAY: "CodePay",
                        SIGILOPAY: "SigiloPay",
                      }}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SYNCPAY">SyncPay</SelectItem>
                    <SelectItem value="CODEPAY">CodePay</SelectItem>
                    <SelectItem value="SIGILOPAY">SigiloPay</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormDescription>
                Provider usado por padrão. Cada sorteio pode escolher um
                gateway diferente na aba &ldquo;Pagamento&rdquo; do editar
                sorteio.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {provider === "SYNCPAY" && (
          <ProviderCard title="Credenciais SyncPay" webhookUrl={webhookUrls.syncpay} webhookEnv="SYNCPAY_WEBHOOK_TOKEN">
            <FormField
              control={form.control}
              name="syncpayClientId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Client ID</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" {...field} />
                  </FormControl>
                  <FormDescription>
                    Painel SyncPay → Developer API. Deixe vazio pra usar a
                    env var SYNCPAY_CLIENT_ID (legado).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="syncpayClientSecret"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Client Secret</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      placeholder={
                        initial.syncpayClientSecretConfigured
                          ? "•••• já configurado (deixe vazio pra manter)"
                          : ""
                      }
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="syncpayBaseUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Base URL (opcional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://api.syncpayments.com.br"
                      autoComplete="off"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Só preencha se a sua conta usa um host diferente do
                    padrão (api.syncpay.pro, etc).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </ProviderCard>
        )}

        {provider === "CODEPAY" && (
          <ProviderCard title="Credenciais CodePay" webhookUrl={webhookUrls.codepay} webhookEnv="CODEPAY_WEBHOOK_TOKEN">
            <FormField
              control={form.control}
              name="codepayClientId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Integration ID</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" {...field} />
                  </FormControl>
                  <FormDescription>
                    Painel CodePay → Integração → ID.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="codepayPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Secret Key</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      placeholder={
                        initial.codepayPasswordConfigured
                          ? "•••• já configurado (deixe vazio pra manter)"
                          : ""
                      }
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </ProviderCard>
        )}

        {provider === "SIGILOPAY" && (
          <ProviderCard
            title="Credenciais SigiloPay"
            webhookUrl={webhookUrls.sigilopay}
            webhookEnv="SIGILOPAY_WEBHOOK_TOKEN"
          >
            <FormField
              control={form.control}
              name="sigilopayClientId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Chave Pública (Client ID)</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" {...field} />
                  </FormControl>
                  <FormDescription>
                    Painel SigiloPay, em Configurações, Credenciais de API.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="sigilopayClientSecret"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Chave Privada (Client Secret)</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      placeholder={
                        initial.sigilopayClientSecretConfigured
                          ? "•••• já configurado (deixe vazio pra manter)"
                          : ""
                      }
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    A SigiloPay só mostra a chave privada uma vez, na criação
                    da credencial. Se você não a tem mais, gere outra no painel
                    deles.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </ProviderCard>
        )}

        {serverError && (
          <p className="text-sm font-medium text-destructive">{serverError}</p>
        )}

        <Button type="submit" disabled={isPending}>
          {isPending ? "Salvando..." : "Salvar"}
        </Button>
      </form>
    </Form>
  );
}

function ProviderCard({
  title,
  webhookUrl,
  webhookEnv,
  children,
}: {
  title: string;
  webhookUrl: string | null;
  webhookEnv: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5 space-y-4">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}

      <div className="border-t pt-4 space-y-2">
        <p className="text-sm font-semibold">Webhook</p>
        {webhookUrl ? (
          <WebhookUrlBox url={webhookUrl} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Defina <code className="font-mono text-xs">NEXT_PUBLIC_APP_URL</code> e{" "}
            <code className="font-mono text-xs">{webhookEnv}</code> no Vercel
            pra gerar a URL.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Cole essa URL no painel do gateway pra receber confirmações de
          pagamento em tempo real.
        </p>
      </div>
    </Card>
  );
}

function WebhookUrlBox({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
      <code className="flex-1 font-mono text-xs break-all">{url}</code>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard pode falhar em http; ignora */
          }
        }}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="text-muted-foreground hover:text-foreground"
      >
        <ExternalLink className="h-4 w-4" />
      </a>
    </div>
  );
}

"use client";

// Form de customização das mensagens finais (pagamento confirmado /
// reserva expirada). Dois cards lado a lado conceitualmente, cada um com
// os 4 campos: título, descrição, label do botão, URL da imagem.

import { useState, useTransition } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { CheckCircle2, Frown, Link2 } from "lucide-react";

import { updateMessagesSettingsAction } from "@/server/actions/messages-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

const schema = z.object({
  paidTitle: z.string().max(120).optional().default(""),
  paidDescription: z.string().max(500).optional().default(""),
  paidButtonLabel: z.string().max(60).optional().default(""),
  paidImageUrl: z.string().max(2048).optional().default(""),
  expiredTitle: z.string().max(120).optional().default(""),
  expiredDescription: z.string().max(500).optional().default(""),
  expiredButtonLabel: z.string().max(60).optional().default(""),
  expiredImageUrl: z.string().max(2048).optional().default(""),
});
type FormValues = z.infer<typeof schema>;

interface Props {
  initial: FormValues;
}

export function MessagesSettingsForm({ initial }: Props) {
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<FormValues>,
    defaultValues: initial,
  });

  function onSubmit(values: FormValues) {
    setServerError(null);
    startTransition(async () => {
      const result = await updateMessagesSettingsAction(values);
      if (!result.ok) {
        setServerError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Mensagens salvas");
    });
  }

  const paidImage = form.watch("paidImageUrl");
  const expiredImage = form.watch("expiredImageUrl");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <h2 className="text-base font-semibold">
              Página de pagamento confirmado
            </h2>
          </div>

          <FormField
            control={form.control}
            name="paidTitle"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Título</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Pagamento confirmado!"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Vazio = usa o texto padrão (&ldquo;Pagamento confirmado!&rdquo;).
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="paidDescription"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Descrição</FormLabel>
                <FormControl>
                  <Textarea
                    rows={3}
                    placeholder="Obrigado pela sua participação. Seus números estão garantidos. Boa sorte no sorteio!"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="paidButtonLabel"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Texto do botão principal</FormLabel>
                <FormControl>
                  <Input placeholder="Ver mais campanhas" {...field} />
                </FormControl>
                <FormDescription>
                  O botão sempre leva pra home (lista de sorteios). Só o
                  texto muda.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="paidImageUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>URL da imagem (opcional)</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Link2 className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-8"
                      inputMode="url"
                      placeholder="https://exemplo.com/obrigado.png"
                      {...field}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {paidImage?.trim() && (
            <div className="rounded-xl overflow-hidden border bg-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={paidImage.trim()}
                alt="Pré-visualização"
                className="w-full max-h-64 object-cover"
              />
            </div>
          )}
        </Card>

        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">
              <Frown className="h-5 w-5" />
            </span>
            <h2 className="text-base font-semibold">
              Página de reserva expirada
            </h2>
          </div>

          <FormField
            control={form.control}
            name="expiredTitle"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Título</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Que pena, sua reserva expirou"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="expiredDescription"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Descrição</FormLabel>
                <FormControl>
                  <Textarea
                    rows={3}
                    placeholder="O tempo para pagamento acabou e seus números voltaram para venda. Se ainda estiverem disponíveis, você pode escolhê-los de novo."
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="expiredButtonLabel"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Texto do botão</FormLabel>
                <FormControl>
                  <Input placeholder="Escolher números de novo" {...field} />
                </FormControl>
                <FormDescription>
                  O botão sempre leva de volta pra página do sorteio. Só o
                  texto muda.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="expiredImageUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>URL da imagem (opcional)</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Link2 className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-8"
                      inputMode="url"
                      placeholder="https://exemplo.com/expirado.png"
                      {...field}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {expiredImage?.trim() && (
            <div className="rounded-xl overflow-hidden border bg-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={expiredImage.trim()}
                alt="Pré-visualização"
                className="w-full max-h-64 object-cover"
              />
            </div>
          )}
        </Card>

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

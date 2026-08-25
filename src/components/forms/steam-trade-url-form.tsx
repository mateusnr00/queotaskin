"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink } from "lucide-react";

import { updateSteamTradeUrlAction } from "@/server/actions/steam";
import {
  steamTradeUrlSchema,
  type SteamTradeUrlInput,
} from "@/lib/validations/steam";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

export function SteamTradeUrlForm({
  current,
  notice,
}: {
  current: string | null;
  notice: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(Boolean(current));

  const form = useForm<SteamTradeUrlInput>({
    resolver: zodResolver(steamTradeUrlSchema),
    defaultValues: { steamTradeUrl: current ?? "" },
  });

  function onSubmit(values: SteamTradeUrlInput) {
    startTransition(async () => {
      const result = await updateSteamTradeUrlAction(values);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSaved(Boolean(result.data.steamTradeUrl));
      toast.success(
        result.data.steamTradeUrl
          ? "Link de troca salvo! Você já pode receber skins."
          : "Link de troca removido.",
      );
      router.refresh();
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="steamTradeUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Link de troca da Steam</FormLabel>
              <FormControl>
                <Input
                  placeholder="https://steamcommunity.com/tradeoffer/new/?partner=...&token=..."
                  autoComplete="off"
                  spellCheck={false}
                  {...field}
                />
              </FormControl>
              <FormDescription>{notice}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Salvando..." : "Salvar link"}
          </Button>
          <a
            href="https://steamcommunity.com/my/tradeoffers/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            Onde encontro meu link?
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        {saved && !form.formState.isDirty && (
          <p className="inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Sua conta está pronta para receber skins.
          </p>
        )}
      </form>
    </Form>
  );
}

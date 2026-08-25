"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { updateUserAction } from "@/server/actions/users";
import { userEditSchema, type UserEditInput } from "@/lib/validations/auth";
import { formatCpf, formatPhone } from "@/lib/cpf";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROLE_OPTIONS = [
  { value: "PARTICIPANT", label: "Participante" },
  { value: "AFFILIATE", label: "Afiliado" },
  { value: "ADMIN", label: "Admin" },
] as const;

interface UserEditFormProps {
  defaultValues: UserEditInput;
  // isSelf desabilita o select de papel pra evitar auto-lockout.
  // O server action também checa essa regra como segunda camada.
  isSelf: boolean;
}

export function UserEditForm({ defaultValues, isSelf }: UserEditFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<UserEditInput>({
    resolver: zodResolver(userEditSchema),
    defaultValues,
  });

  function onSubmit(values: UserEditInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await updateUserAction(values);
      if (!result.ok) {
        setServerError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Usuário atualizado");
      router.refresh();
      router.push("/admin/usuarios");
    });
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-5 max-w-xl"
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome completo</FormLabel>
              <FormControl>
                <Input autoComplete="off" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="cpf"
          render={({ field }) => (
            <FormItem>
              <FormLabel>CPF</FormLabel>
              <FormControl>
                <Input
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  value={field.value}
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

        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Telefone</FormLabel>
              <FormControl>
                <Input
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="(11) 99999-9999"
                  value={field.value ?? ""}
                  onChange={(e) => {
                    const digits = e.target.value
                      .replace(/\D/g, "")
                      .slice(0, 11);
                    field.onChange(
                      digits.length >= 10 ? formatPhone(digits) : digits
                    );
                  }}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                />
              </FormControl>
              <FormDescription>Opcional. DDD + número.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Papel</FormLabel>
              <FormControl>
                <Select
                  value={field.value}
                  onValueChange={(v) => v && field.onChange(v)}
                  disabled={isSelf}
                >
                  <SelectTrigger className="w-full sm:w-60">
                    <SelectValue
                      labels={Object.fromEntries(
                        ROLE_OPTIONS.map((r) => [r.value, r.label])
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              {isSelf ? (
                <FormDescription>
                  Você não pode mudar o próprio papel (anti-lockout). Peça
                  pra outro admin.
                </FormDescription>
              ) : (
                <FormDescription>
                  Admins têm acesso completo ao painel.
                </FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        {serverError && (
          <p className="text-sm font-medium text-destructive">{serverError}</p>
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Salvando..." : "Salvar alterações"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/admin/usuarios")}
            disabled={isPending}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </Form>
  );
}

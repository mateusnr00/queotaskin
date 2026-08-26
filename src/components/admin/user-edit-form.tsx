"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { KeyRound, ShieldCheck } from "lucide-react";

import {
  gerarSenhaDePainelAction,
  updateUserAction,
} from "@/server/actions/users";
import { SenhaGerada } from "@/components/admin/senha-gerada";
import { userEditSchema, type UserEditInput } from "@/lib/validations/auth";
import { formatCpf, formatPhone } from "@/lib/cpf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
  { value: "PARTICIPANT", label: "Cliente" },
  { value: "AFFILIATE", label: "Afiliado" },
  { value: "ADMIN", label: "Admin" },
  { value: "SUPER_ADMIN", label: "Dono da plataforma" },
] as const;

interface UserEditFormProps {
  defaultValues: UserEditInput;
  // isSelf desabilita o select de papel pra evitar auto-lockout.
  // O server action também checa essa regra como segunda camada.
  isSelf: boolean;
  /** SUPER_ADMIN é o único que pode conceder e revogar SUPER_ADMIN. */
  souDono: boolean;
  /** Se a conta já tem senha de painel, muda o texto do botão. */
  temSenha: boolean;
}

export function UserEditForm({
  defaultValues,
  isSelf,
  souDono,
  temSenha,
}: UserEditFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [senhaGerada, setSenhaGerada] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);

  // Sem ser dono, "Dono da plataforma" só aparece se a conta já for, para não
  // sumir do select e parecer que o papel dela mudou.
  const papeis = ROLE_OPTIONS.filter(
    (r) =>
      r.value !== "SUPER_ADMIN" ||
      souDono ||
      defaultValues.role === "SUPER_ADMIN"
  );

  const form = useForm<UserEditInput>({
    resolver: zodResolver(userEditSchema),
    defaultValues,
  });

  const papelAtual = form.watch("role");
  const ehDePainel = papelAtual === "ADMIN" || papelAtual === "SUPER_ADMIN";

  function gerarSenha() {
    setGerando(true);
    startTransition(async () => {
      try {
        const r = await gerarSenhaDePainelAction(defaultValues.id);
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        setSenhaGerada(r.data.senhaTemporaria);
        router.refresh();
      } finally {
        setGerando(false);
      }
    });
  }

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
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>E-mail</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  placeholder="pessoa@exemplo.com"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Login do painel. Obrigatório para quem é Admin.
              </FormDescription>
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
                        papeis.map((r) => [r.value, r.label])
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {papeis.map((r) => (
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

        <FormField
          control={form.control}
          name="showModBadge"
          render={({ field }) => (
            <FormItem className="flex items-start justify-between gap-4 rounded-xl border bg-muted/20 p-4">
              <div className="space-y-1">
                <FormLabel className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                  Mostrar selo de MOD
                </FormLabel>
                <FormDescription className="leading-relaxed">
                  Marca a pessoa como moderadora onde o selo dela aparece.
                  Independe do papel: dá para ser admin sem o selo, que é como
                  a conta passa por cliente comum, e dá para ter o selo sem
                  ser admin.
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />

        {/* Acesso ao painel. Fica fora do submit porque gerar senha é uma
            ação com efeito imediato e irreversível: a senha antiga para de
            valer na hora, então não pode viajar junto com "salvar
            alterações", onde a pessoa pode nem ter percebido que apertou. */}
        {ehDePainel && (
          <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold">Acesso ao painel</p>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {temSenha
                ? "Esta conta já tem senha. Gerar outra derruba a atual na hora, use quando a pessoa perder o acesso."
                : "Esta conta ainda não tem senha e por isso não consegue entrar. Gere uma e repasse."}
            </p>
            {senhaGerada ? (
              <SenhaGerada
                senha={senhaGerada}
                email={form.getValues("email") || null}
                aoFechar={() => setSenhaGerada(null)}
              />
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending || gerando}
                onClick={gerarSenha}
              >
                {gerando
                  ? "Gerando..."
                  : temSenha
                    ? "Gerar nova senha"
                    : "Gerar senha de acesso"}
              </Button>
            )}
          </div>
        )}

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

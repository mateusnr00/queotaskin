// Schemas Zod para autenticação, usados em Server Actions E em formulários
// no cliente (via @hookform/resolvers/zod). Validação dupla: o cliente roda
// pra UX (mostra erro antes de submeter), e o servidor roda pra SEGURANÇA
// (nunca confiar no que veio do cliente).
//
// Decisão de produto:
// - Cadastro pede nome completo + CPF + celular. O CPF é digitado pelo
//   próprio usuário (real, validado por dígito verificador) e nunca mais
//   é exibido na UI depois do cadastro, fica só no banco pra alimentar
//   o PIX. A SyncPay rejeitava CPFs sintéticos do pool antigo, por isso
//   voltamos a coletar do usuário.
// - Login é PASSWORDLESS por nome + CPF. O CPF é o identificador único e o
//   nome é verificado por cima (case-insensitive), funciona como "login e
//   senha" pro usuário. É o padrão do mercado de rifa no Brasil: a pessoa
//   sabe o próprio CPF de cor, e ele já foi digitado no cadastro.
//
// Quem opera o painel NÃO entra por aqui: admin usa e-mail + senha, em host
// separado (ver auth.ts).

import { z } from "zod";
import { isValidCpf, onlyDigits } from "@/lib/cpf";

// Nome completo: pelo menos 2 palavras, 2–120 chars no total.
const nameField = z
  .string()
  .min(2, "Nome muito curto")
  .max(120, "Nome muito longo")
  .trim()
  .refine(
    (v) => v.trim().split(/\s+/).length >= 2,
    "Informe nome e sobrenome"
  );

// Celular brasileiro: DDD (2) + 8 ou 9 dígitos. Aceita máscara, só os
// dígitos vão pro banco.
const phoneField = z
  .string()
  .transform(onlyDigits)
  .refine(
    (v) => v.length >= 10 && v.length <= 11,
    "Celular inválido (DDD + número)"
  );

// CPF validado por dígito verificador. Aceita máscara, só os dígitos vão
// para o banco, que é como estão gravados.
const cpfField = z
  .string()
  .transform(onlyDigits)
  .refine(isValidCpf, "CPF inválido");

export const loginSchema = z.object({
  name: nameField,
  cpf: cpfField,
});
export type LoginInput = z.infer<typeof loginSchema>;

// Cadastro pede nome + CPF + celular. CPF é validado por dígito verificador;
// nunca é exibido na UI depois do cadastro.
// Entrada do painel: e-mail + senha. O mínimo de 8 caracteres vale também
// no cadastro da senha (ver changePasswordSchema), aqui só evita gastar um
// bcrypt.compare com string vazia.
export const adminLoginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha"),
});
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

// Troca de senha do painel. 10 caracteres é mais que o mínimo usual porque
// esta conta comanda pagamento e dados de terceiros.
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual"),
    newPassword: z
      .string()
      .min(10, "A senha precisa de pelo menos 10 caracteres")
      .max(200),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "As senhas não conferem",
    path: ["confirmPassword"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// Cadastro pede os três: nome, CPF e celular. O celular é obrigatório,
// é por ele que a operação fala com o cliente quando um pagamento trava ou
// um prêmio precisa ser entregue.
export const registerSchema = z.object({
  name: nameField,
  cpf: cpfField,
  phone: phoneField,
});
export type RegisterInput = z.infer<typeof registerSchema>;

// Edição admin: continua aceitando CPF (campo legado), telefone e papel.
// CPF aqui é opcional, contas criadas após a migração pra login por
// nome+celular não terão CPF; o admin pode preencher se quiser.
export const userEditSchema = z.object({
  id: z.string().cuid(),
  // Editável porque é o login do painel: promover alguém a admin sem poder
  // dar o e-mail deixaria a conta com o papel certo e sem como entrar.
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => v === "" || z.string().email().safeParse(v).success, {
      message: "E-mail inválido",
    }),
  name: z
    .string()
    .min(2, "Nome muito curto")
    .max(120, "Nome muito longo")
    .trim(),
  cpf: z
    .string()
    .transform(onlyDigits)
    .refine(
      (v) => v === "" || isValidCpf(v),
      "CPF inválido"
    ),
  phone: z
    .string()
    .transform(onlyDigits)
    .refine(
      (v) => v === "" || (v.length >= 10 && v.length <= 11),
      "Telefone inválido (DDD + número)"
    ),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "AFFILIATE", "PARTICIPANT"]),
  showModBadge: z.boolean(),
});
export type UserEditInput = z.infer<typeof userEditSchema>;

// Criação de conta pelo painel.
//
// O e-mail só é exigido quando o papel dá acesso ao painel, porque é ele que
// serve de login lá. Cliente entra por nome + CPF e não precisa de e-mail
// nenhum; exigir de todo mundo criaria campo obrigatório inventado para a
// maior parte dos cadastros.
export const userCreateSchema = z
  .object({
    name: z
      .string()
      .min(2, "Nome muito curto")
      .max(120, "Nome muito longo")
      .trim(),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .refine((v) => v === "" || z.string().email().safeParse(v).success, {
        message: "E-mail inválido",
      }),
    cpf: z
      .string()
      .transform(onlyDigits)
      .refine((v) => v === "" || isValidCpf(v), "CPF inválido"),
    phone: z
      .string()
      .transform(onlyDigits)
      .refine(
        (v) => v === "" || (v.length >= 10 && v.length <= 11),
        "Telefone inválido (DDD + número)"
      ),
    role: z.enum(["SUPER_ADMIN", "ADMIN", "AFFILIATE", "PARTICIPANT"]),
  })
  .superRefine((dados, ctx) => {
    const daPainel = dados.role === "ADMIN" || dados.role === "SUPER_ADMIN";
    if (daPainel && !dados.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["email"],
        message: "Admin entra no painel por e-mail e senha, então ele é obrigatório",
      });
    }
    // Cliente que não tem CPF não consegue entrar: o login público é nome +
    // CPF. Criar a conta assim mesmo produziria um cadastro que parece certo
    // e nunca deixa a pessoa entrar.
    if (dados.role === "PARTICIPANT" && !dados.cpf) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cpf"],
        message: "Cliente entra por nome e CPF, então o CPF é obrigatório",
      });
    }
  });
export type UserCreateInput = z.infer<typeof userCreateSchema>;

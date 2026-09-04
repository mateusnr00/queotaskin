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
import { PAISES, telefoneValido } from "@/lib/telefone";

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

// País do telefone, em ISO. Só o que está na lista entra: o valor vem de um
// seletor, e aceitar texto livre aqui deixaria o banco com país inventado.
// Sem .default() de propósito: com default o tipo de ENTRADA do schema fica
// opcional e o de SAÍDA obrigatório, e o formulário, que usa os dois lados,
// deixa de compilar. O seletor sempre manda um valor, então o campo é
// exigido aqui e o padrão mora no formulário.
const phoneCountryField = z
  .string()
  .trim()
  .toUpperCase()
  .refine((v) => PAISES.some((p) => p.iso === v), "País inválido");

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

// Login do participante: CPF (identificador) + NOME COMPLETO (verificado por
// cima). SEM senha - o site público prioriza conversão, e a conta só guarda os
// próprios títulos. O CPF localiza a conta; o nome completo é conferido de
// forma determinística (trim + espaços + caixa; ver normalizeName em auth.ts).
// É o padrão do mercado de rifa no Brasil.
export const participantLoginSchema = z.object({
  cpf: cpfField,
  nome: nameField,
});
export type ParticipantLoginInput = z.infer<typeof participantLoginSchema>;

// Cadastro pede nome + CPF + celular. CPF é validado por dígito verificador;
// nunca é exibido na UI depois do cadastro.
// Entrada do painel: e-mail + senha. O mínimo de 8 caracteres vale também
// no cadastro da senha (ver changePasswordSchema), aqui só evita gastar um
// bcrypt.compare com string vazia.
export const adminLoginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha"),
  // 2o fator: TOTP (6 dígitos) OU recovery code (>=8). Opcional no schema; o
  // provider decide se é obrigatório (quando a conta tem MFA ativa).
  totp: z.string().trim().optional(),
});
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

// Troca de senha do painel. 10 caracteres é mais que o mínimo usual porque
// esta conta comanda pagamento e dados de terceiros.
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual"),
    totp: z.string().trim().optional(),
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

// Cadastro pede nome, CPF e telefone. O telefone é obrigatório: é por ele
// que a operação fala com o cliente quando um pagamento trava ou um prêmio
// precisa ser entregue.
//
// A regra de tamanho do número depende do país, e por isso é validada no
// objeto e não no campo: nove dígitos é telefone válido em Portugal e número
// curto no Brasil. Com a regra brasileira valendo para todo mundo, cliente
// de fora não conseguia terminar o cadastro.
// Cadastro simplificado (decisão de produto): nome + CPF + telefone + código
// de afiliado (opcional). SEM senha, SEM confirmar senha, SEM OTP/SMS, SEM
// e-mail. A conta nasce sem passwordHash e o login normal é por CPF + nome
// completo (ver participantLoginSchema).
export const registerSchema = z
  .object({
    name: nameField,
    cpf: cpfField,
    phone: z.string().transform(onlyDigits),
    phoneCountry: phoneCountryField,
    /**
     * Código de quem indicou, digitado ou vindo do link.
     *
     * Opcional e sem validação de existência aqui de propósito: código errado
     * não pode impedir alguém de criar conta. Quem confere é o serviço, depois
     * da conta criada, e o cadastro segue de qualquer jeito.
     */
    codigoDeIndicacao: z.string().trim().max(32).optional().or(z.literal("")),
  })
  .superRefine((dados, ctx) => {
    if (!telefoneValido(dados.phone, dados.phoneCountry)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["phone"], message: "Telefone inválido para o país escolhido" });
    }
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
  // Faixa larga porque aqui edita-se cliente de qualquer país: com a regra
  // brasileira, salvar a ficha de um cliente de fora falhava sem que nada na
  // tela explicasse por quê.
  phone: z
    .string()
    .transform(onlyDigits)
    .refine(
      (v) => v === "" || (v.length >= 6 && v.length <= 15),
      "Telefone inválido"
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
        (v) => v === "" || (v.length >= 6 && v.length <= 15),
        "Telefone inválido"
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


// Passo 1 do login: só o CPF (identificador). Nome não é credencial.
export const cpfLoginSchema = z.object({ cpf: cpfField });
export type CpfLoginInput = z.infer<typeof cpfLoginSchema>;

// Passo do código OTP (login ou cadastro).
export const otpCodigoSchema = z.object({
  codigo: z.string().regex(/^[0-9]{6}$/, "Código de 6 dígitos"),
});
export type OtpCodigoInput = z.infer<typeof otpCodigoSchema>;


// Troca de senha do participante (§18).
export const participantChangePasswordSchema = z
  .object({
    senhaAtual: z.string().min(1, "Informe a senha atual"),
    novaSenha: z.string().min(8, "A nova senha precisa de pelo menos 8 caracteres").max(200),
    confirmarSenha: z.string(),
  })
  .refine((d) => d.novaSenha === d.confirmarSenha, { message: "As senhas não conferem", path: ["confirmarSenha"] });
export type ParticipantChangePasswordInput = z.infer<typeof participantChangePasswordSchema>;

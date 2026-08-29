// Config completa do Auth.js v5, usa Prisma (Node runtime only).
// Re-exporta `auth`, `signIn`, `signOut` e `handlers` que o app usa em todo lugar.
//
// São DOIS caminhos de entrada, para dois públicos:
//
// 1. "credentials", participante, sem senha, por nome completo + CPF.
//    É o fluxo do site público: pedir senha na hora de comprar derrubaria
//    conversão, e a conta só guarda os próprios títulos.
//
// 2. "admin-password", quem opera o painel, por e-mail + senha com bcrypt.
//    A conta de admin vê CPF, telefone e pagamento de todos os clientes, e
//    nome + celular do dono são informação pública demais para proteger
//    isso. Só existe no host do painel.
//
// Quem opera o painel também compra: o dono entra no próprio site como
// cliente qualquer. Por isso o caminho 1 aceita conta de painel, mas SÓ no
// host público. No host do painel ele é recusado, senão a senha seria
// decorativa: bastaria postar neste endpoint com nome + CPF e sair com uma
// sessão de administrador.
//
// A checagem lê o Host da requisição de verdade, não um campo enviado junto
// das credenciais: o corpo do pedido é controlado por quem chama, o cabeçalho
// da conexão não.
//
// As duas sessões não se misturam. O cookie do Auth.js é gravado para o host
// exato, então entrar como cliente em queotaskin.com não dá acesso nenhum em
// admin.queotaskin.com, lá continua valendo e-mail e senha.

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/db";
import { authConfig } from "@/auth.config";
import { loginSchema, adminLoginSchema } from "@/lib/validations/auth";
import { isAdminHost } from "@/lib/host";
import {
  chaveDeConta,
  chavesDoLogin,
  estaBloqueado,
  ipDaRequisicao,
  limparFalhas,
  registrarFalha,
} from "@/server/services/login-throttle";
import { registrarLog } from "@/server/services/activity-log";

// "  João  da  Silva " → "joão da silva", usado pra comparar nomes
// digitados pelo usuário sem se importar com maiúsculas ou espaços
// extras. Acentos são preservados (joão ≠ joao) pra não dar falso-positivo.
function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

const PAPEIS_DE_PAINEL = new Set(["ADMIN", "SUPER_ADMIN"]);

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      credentials: {
        name: { label: "Nome completo", type: "text" },
        cpf: { label: "CPF", type: "text" },
      },
      async authorize(credentials, request) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        // Freio antes de qualquer consulta de conta: sem senha no caminho, o
        // que separa uma tentativa de um acerto é só a combinação nome + CPF,
        // e sem limite dá para varrer uma lista inteira.
        const chaves = chavesDoLogin(
          ipDaRequisicao(request?.headers ?? new Headers()),
          parsed.data.cpf
        );
        if ((await estaBloqueado(chaves)).bloqueado) return null;

        const user = await prisma.user.findUnique({
          where: { cpf: parsed.data.cpf },
        });
        if (!user) {
          await registrarFalha(chaves);
          return null;
        }

        // CPF bate, agora confere o nome (case-insensitive).
        if (normalizeName(user.name) !== normalizeName(parsed.data.name)) {
          await registrarFalha(chaves);
          return null;
        }

        // No host do painel, conta de painel entra só com senha.
        if (PAPEIS_DE_PAINEL.has(user.role)) {
          const host = request?.headers?.get("host") ?? "";
          if (isAdminHost(host)) return null;
        }

        // Só a chave da conta: apagar a chave `ip:` compartilhada num acerto
        // zeraria o freio de varredura por IP de todos os outros.
        await limparFalhas([chaveDeConta(parsed.data.cpf)]);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenantId,
          image: user.image,
        };
      },
    }),

    Credentials({
      id: "admin-password",
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials, request) {
        const parsed = adminLoginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        // O painel tem senha, mas é a conta que mais interessa a quem ataca:
        // ela enxerga os dados de todos os clientes.
        const chaves = chavesDoLogin(
          ipDaRequisicao(request?.headers ?? new Headers()),
          parsed.data.email.toLowerCase()
        );
        if ((await estaBloqueado(chaves)).bloqueado) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
        });

        // Compara sempre, mesmo sem usuário ou sem hash: um retorno rápido
        // aqui revelaria quais e-mails existem pelo tempo de resposta.
        const hash =
          user?.passwordHash ??
          "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu";
        const senhaConfere = await bcrypt.compare(parsed.data.password, hash);

        if (!user || !user.passwordHash || !senhaConfere) {
          await registrarFalha(chaves);
          // Ator informado à mão: não existe sessão numa entrada recusada, e
          // o nome fica sendo o e-mail digitado, que é o que se sabe de quem
          // tentou. Id e papel só existem quando a conta existe: numa
          // tentativa contra conta inexistente não há o que amarrar.
          await registrarLog({
            acao: "painel.login_recusado",
            tenantId: user?.tenantId ?? null,
            origem: "PAINEL",
            ator: {
              nome: parsed.data.email.toLowerCase(),
              id: user?.id,
              papel: user?.role,
              email: parsed.data.email.toLowerCase(),
            },
            detalhes: { motivo: user ? "senha incorreta" : "conta inexistente" },
          });
          return null;
        }
        if (!PAPEIS_DE_PAINEL.has(user.role)) {
          await registrarFalha(chaves);
          // Mesma recusa do bloco acima, e aqui a conta existe: o id vai
          // junto para que o histórico dela mostre a tentativa.
          await registrarLog({
            acao: "painel.login_recusado",
            tenantId: user?.tenantId ?? null,
            origem: "PAINEL",
            ator: {
              nome: parsed.data.email.toLowerCase(),
              id: user?.id,
              papel: user?.role,
              email: parsed.data.email.toLowerCase(),
            },
            detalhes: { motivo: "papel sem acesso ao painel" },
          });
          return null;
        }

        // Só a chave da conta (ver comentário no provider acima).
        await limparFalhas([chaveDeConta(parsed.data.email.toLowerCase())]);

        // Ator informado à mão pelo mesmo motivo das recusas acima: dentro
        // do authorize a sessão ainda não existe, é ele quem está criando.
        // Id, papel e e-mail vão junto porque aqui se sabe exatamente quem
        // entrou: sem o id, a entrada no painel não apareceria no histórico
        // filtrado por essa pessoa, que é onde se procura o alcance de uma
        // conta tomada.
        await registrarLog({
          acao: "painel.login",
          tenantId: user.tenantId,
          origem: "PAINEL",
          ator: {
            nome: user.name,
            id: user.id,
            papel: user.role,
            email: user.email,
          },
          detalhes: { papel: user.role },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenantId,
          image: user.image,
        };
      },
    }),
  ],
});

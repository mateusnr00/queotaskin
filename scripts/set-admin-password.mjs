// Define (ou reseta) a senha de uma conta de painel.
//
// Uso:
//   node scripts/set-admin-password.mjs <email> [--senha <valor>] [--definitiva]
//
// Sem --senha, gera uma temporária forte e a imprime uma única vez. Sem
// --definitiva, a conta entra marcada com mustChangePassword: o painel fica
// bloqueado até a pessoa escolher a própria senha. É o comportamento certo
// para uma senha que trafegou por fora do sistema.
//
// A senha nunca é gravada em log nem no banco em texto puro, só o hash
// bcrypt. Rode com DATABASE_URL apontando para o ambiente desejado.

import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const args = process.argv.slice(2);
const email = args[0]?.toLowerCase();
const senhaArg = args.includes("--senha")
  ? args[args.indexOf("--senha") + 1]
  : null;
const definitiva = args.includes("--definitiva");

if (!email || email.startsWith("--")) {
  console.error(
    "uso: node scripts/set-admin-password.mjs <email> [--senha <valor>] [--definitiva]"
  );
  process.exit(1);
}

// Alfabeto sem caracteres que se confundem ao ditar ou copiar (O/0, l/1/I).
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
function senhaForte(tamanho = 20) {
  const bytes = randomBytes(tamanho);
  let out = "";
  for (let i = 0; i < tamanho; i++) out += ALFABETO[bytes[i] % ALFABETO.length];
  return out;
}

const prisma = new PrismaClient();

try {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, role: true },
  });

  if (!user) {
    console.error(`Nenhuma conta com o e-mail ${email}.`);
    process.exit(1);
  }
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    console.error(
      `A conta ${email} tem papel ${user.role}. Senha só vale para ADMIN ou SUPER_ADMIN.`
    );
    process.exit(1);
  }

  const senha = senhaArg ?? senhaForte();
  if (senha.length < 10) {
    console.error("Senha curta demais: use pelo menos 10 caracteres.");
    process.exit(1);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(senha, 12),
      mustChangePassword: !definitiva,
    },
  });

  console.log(`Senha definida para ${user.name} <${email}> (${user.role}).`);
  if (!senhaArg) {
    console.log(`\n  senha temporária: ${senha}\n`);
    console.log("Ela aparece só desta vez. Guarde agora.");
  }
  if (!definitiva) {
    console.log("O painel vai exigir a troca no primeiro acesso.");
  }
} finally {
  await prisma.$disconnect();
}

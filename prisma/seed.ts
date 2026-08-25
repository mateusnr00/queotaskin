// Seed script — popula o banco com dados iniciais.
// Rodar com: npm run db:seed
//
// É idempotente: re-rodar não duplica dados (upsert por celular/slug).
//
// Login do sistema é PASSWORDLESS por nome + celular. O admin do seed
// também usa esse fluxo — defina SEED_ADMIN_PHONE no .env (DDD + número,
// 10 ou 11 dígitos) e SEED_ADMIN_NAME.
//
// Multi-tenant: o seed cria o tenant default "mateus" apontando pros
// hosts conhecidos (sorteios.vip / www.sorteios.vip / admin.sorteios.vip)
// e linka o admin do seed como SUPER_ADMIN dono desse tenant. Em outros
// deploys (ambiente paralelo, white-label) cada admin tem seu próprio
// tenant — esse seed apenas inicializa o primeiro.

import { PrismaClient } from "@prisma/client";

import { onlyDigits } from "../src/lib/cpf";

const prisma = new PrismaClient();

const DEFAULT_TENANT_ID = "tenant_default_mateus";
const DEFAULT_TENANT_SLUG = "mateus";
const DEFAULT_TENANT_NAME = "Sorteios VIP";
const DEFAULT_PUBLIC_HOSTS = ["sorteios.vip", "www.sorteios.vip"];
const DEFAULT_ADMIN_HOST = "admin.sorteios.vip";

async function main() {
  const adminPhoneRaw = process.env.SEED_ADMIN_PHONE ?? "11999999999";
  const adminPhone = onlyDigits(adminPhoneRaw);
  if (adminPhone.length < 10 || adminPhone.length > 11) {
    throw new Error(
      `SEED_ADMIN_PHONE inválido: "${adminPhoneRaw}". Use DDD + número (10 ou 11 dígitos).`
    );
  }
  const adminName = process.env.SEED_ADMIN_NAME ?? "Administrador";
  const adminEmail = process.env.SEED_ADMIN_EMAIL || null;

  console.log("→ Criando usuário admin (SUPER_ADMIN)...");
  const admin = await prisma.user.upsert({
    where: { phone: adminPhone },
    update: { name: adminName, role: "SUPER_ADMIN" },
    create: {
      phone: adminPhone,
      email: adminEmail,
      name: adminName,
      role: "SUPER_ADMIN",
    },
  });
  console.log(`  ✓ Celular ${adminPhone} (${admin.name})`);

  console.log("→ Criando tenant default...");
  const tenant = await prisma.tenant.upsert({
    where: { id: DEFAULT_TENANT_ID },
    update: { name: DEFAULT_TENANT_NAME, ownerId: admin.id },
    create: {
      id: DEFAULT_TENANT_ID,
      slug: DEFAULT_TENANT_SLUG,
      name: DEFAULT_TENANT_NAME,
      ownerId: admin.id,
    },
  });
  console.log(`  ✓ tenant "${tenant.slug}" (${tenant.name})`);

  // Linka o admin como membro do tenant que ele é dono.
  await prisma.user.update({
    where: { id: admin.id },
    data: { tenantId: tenant.id },
  });

  console.log("→ Cadastrando hosts do tenant default...");
  for (const host of DEFAULT_PUBLIC_HOSTS) {
    await prisma.tenantHost.upsert({
      where: { host },
      update: { tenantId: tenant.id, kind: "PUBLIC" },
      create: { tenantId: tenant.id, host, kind: "PUBLIC" },
    });
    console.log(`  ✓ ${host} (público)`);
  }
  await prisma.tenantHost.upsert({
    where: { host: DEFAULT_ADMIN_HOST },
    update: { tenantId: tenant.id, kind: "ADMIN" },
    create: { tenantId: tenant.id, host: DEFAULT_ADMIN_HOST, kind: "ADMIN" },
  });
  console.log(`  ✓ ${DEFAULT_ADMIN_HOST} (admin)`);

  console.log("→ Criando configurações do site...");
  await prisma.siteSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      companyName: DEFAULT_TENANT_NAME,
      supportEmail: adminEmail,
    },
  });
  console.log("  ✓ ok");

  console.log("→ Criando rifa de exemplo...");
  await prisma.raffle.upsert({
    where: {
      tenantId_slug: { tenantId: tenant.id, slug: "rifa-exemplo" },
    },
    update: {},
    create: {
      slug: "rifa-exemplo",
      title: "Rifa de Exemplo",
      shortDescription:
        "Sorteio de demonstração — sem prêmio real, apenas para testar o fluxo.",
      description:
        "Esta é uma rifa criada automaticamente pelo seed. Use para testar o fluxo de reserva.",
      status: "ACTIVE",
      privacy: "PUBLIC",
      category: "Demonstração",
      totalNumbers: 100,
      pricePerNumber: 5,
      reservationModel: "RANDOM_NUMBERS",
      modality: "OWN_DRAW",
      minPurchase: 1,
      maxPurchase: 50,
      reservationTimeoutMinutes: 15,
      createdById: admin.id,
      tenantId: tenant.id,
    },
  });
  console.log("  ✓ /s/rifa-exemplo");

  console.log("\nPronto. Credencial admin:");
  console.log(`  Nome:    ${admin.name}`);
  console.log(`  Celular: ${adminPhone}`);
  console.log(`  Tenant:  ${tenant.slug} (${tenant.name})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

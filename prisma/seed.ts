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

const DEFAULT_TENANT_ID = "tenant_queotaskin";
const DEFAULT_TENANT_SLUG = "queotaskin";
const DEFAULT_TENANT_NAME = "QuéOta Skin";
const DEFAULT_PUBLIC_HOSTS = ["queotaskin.com", "www.queotaskin.com"];
const DEFAULT_ADMIN_HOST = "admin.queotaskin.com";


// Catálogo de campanhas do seed. Skins reais do CS2 com raridade, desgaste
// e float coerentes — serve tanto de demonstração quanto de referência de
// como cadastrar uma campanha de verdade no painel.
//
// Os prêmios saem sem imagem de propósito: a arte de cada skin é enviada
// pelo admin em Sorteios → Editar → Prêmios (ou Imagens, para a capa da
// campanha). Apontar para um CDN externo aqui só geraria link quebrado.

const CAMPAIGNS = [
  {
    slug: "karambit-doppler-phase-2",
    title: "★ Karambit | Doppler (Nova de Fábrica) — Phase 2",
    shortDescription: "A faca mais desejada do CS2 pode ser sua por R$ 4,99.",
    description:
      "Karambit Doppler Phase 2 Nova de Fábrica, float baixíssimo e padrão limpo.\\n\\n" +
      "O sorteio acontece assim que 100% dos números forem vendidos, com apuração " +
      "ao vivo no nosso Discord. O resultado fica publicado nesta página.\\n\\n" +
      "A entrega é feita por oferta de troca na Steam em até 24h após a confirmação.",
    totalNumbers: 1000,
    pricePerNumber: 4.99,
    minPurchase: 1,
    maxPurchase: 500,
    initialQuantity: 10,
    showOnHome: true,
    statusText: "Corre que está acabando!",
    selectionCards: [5, 10, 25, 50, 100, 250],
    prizes: [
      {
        description: "★ Karambit | Doppler (Nova de Fábrica) — Phase 2",
        skinName: "★ Karambit | Doppler",
        skinRarity: "COVERT" as const,
        skinWear: "FACTORY_NEW" as const,
        skinFloat: 0.0083421,
        skinStatTrak: false,
        skinSouvenir: false,
        skinValueBrl: 4890,
        skinCollection: "Coleção Gamma 2",
      },
    ],
  },
  {
    slug: "butterfly-knife-fade",
    title: "★ Butterfly Knife | Fade (Nova de Fábrica)",
    shortDescription: "Fade 95%+ com degradê completo. A borboleta dos sonhos.",
    description:
      "Butterfly Knife Fade Nova de Fábrica — um dos padrões mais valorizados do jogo.\\n\\n" +
      "Sorteio pela Loteria Federal na data indicada. O número vencedor é " +
      "formado pelos primeiros prêmios do concurso, conforme o regulamento.",
    totalNumbers: 5000,
    pricePerNumber: 2.5,
    minPurchase: 1,
    maxPurchase: 1000,
    initialQuantity: 20,
    showOnHome: false,
    selectionCards: [10, 25, 50, 100, 250, 500],
    prizes: [
      {
        description: "★ Butterfly Knife | Fade (Nova de Fábrica)",
        skinName: "★ Butterfly Knife | Fade",
        skinRarity: "COVERT" as const,
        skinWear: "FACTORY_NEW" as const,
        skinFloat: 0.0147123,
        skinStatTrak: false,
        skinSouvenir: false,
        skinValueBrl: 8750,
        skinCollection: "Coleção Chroma",
      },
    ],
  },
  {
    slug: "kit-dos-sonhos-faca-e-luvas",
    title: "Kit dos Sonhos — Faca + Luvas + AK",
    shortDescription: "Três prêmios numa campanha só. Um número, três chances de setup.",
    description:
      "O kit completo: uma Talon Knife Marble Fade, um par de Specialist Gloves " +
      "Crimson Kimono e uma AK-47 Fire Serpent.\\n\\n" +
      "O mesmo número vencedor leva os três itens. Sorteio ao vivo assim que " +
      "a campanha fechar.",
    totalNumbers: 2000,
    pricePerNumber: 7.5,
    minPurchase: 1,
    maxPurchase: 400,
    initialQuantity: 5,
    showOnHome: false,
    statusText: "Kit completo!",
    selectionCards: [5, 10, 20, 50, 100, 200],
    prizes: [
      {
        description: "★ Talon Knife | Marble Fade (Nova de Fábrica)",
        skinName: "★ Talon Knife | Marble Fade",
        skinRarity: "COVERT" as const,
        skinWear: "FACTORY_NEW" as const,
        skinFloat: 0.0201884,
        skinStatTrak: false,
        skinSouvenir: false,
        skinValueBrl: 9200,
        skinCollection: "Coleção Chroma 2",
      },
      {
        description: "★ Specialist Gloves | Crimson Kimono (Pouco Usada)",
        skinName: "★ Specialist Gloves | Crimson Kimono",
        skinRarity: "EXTRAORDINARY" as const,
        skinWear: "MINIMAL_WEAR" as const,
        skinFloat: 0.1123842,
        skinStatTrak: false,
        skinSouvenir: false,
        skinValueBrl: 6400,
        skinCollection: "Coleção Glove",
      },
      {
        description: "AK-47 | Fire Serpent (Testada em Campo)",
        skinName: "AK-47 | Fire Serpent",
        skinRarity: "COVERT" as const,
        skinWear: "FIELD_TESTED" as const,
        skinFloat: 0.2418337,
        skinStatTrak: false,
        skinSouvenir: false,
        skinValueBrl: 3800,
        skinCollection: "Coleção Operação Bravo",
      },
    ],
  },
  {
    slug: "ak-47-redline-ft",
    title: "AK-47 | Redline (Testada em Campo)",
    shortDescription: "A clássica que nunca sai de moda. Números a R$ 1,50.",
    description:
      "Perfeita para quem está começando a coleção. Campanha rápida de 100 números — " +
      "sorteia assim que fechar.",
    totalNumbers: 100,
    pricePerNumber: 1.5,
    minPurchase: 1,
    maxPurchase: 50,
    initialQuantity: 5,
    showOnHome: false,
    selectionCards: [3, 5, 10, 20, 30, 50],
    prizes: [
      {
        description: "AK-47 | Redline (Testada em Campo)",
        skinName: "AK-47 | Redline",
        skinRarity: "CLASSIFIED" as const,
        skinWear: "FIELD_TESTED" as const,
        skinFloat: 0.2345178,
        skinStatTrak: false,
        skinSouvenir: false,
        skinValueBrl: 95,
        skinCollection: "Coleção Fênix",
      },
    ],
  },
  {
    slug: "stattrak-m4a1-s-printstream",
    title: "StatTrak™ M4A1-S | Printstream (Nova de Fábrica)",
    shortDescription: "Com contador de abates. A M4 mais bonita do jogo.",
    description:
      "StatTrak™ M4A1-S Printstream Nova de Fábrica, contador zerado.\\n\\n" +
      "Campanha de 500 números. Sorteio próprio transmitido ao vivo.",
    totalNumbers: 500,
    pricePerNumber: 3.9,
    minPurchase: 1,
    maxPurchase: 200,
    initialQuantity: 10,
    showOnHome: false,
    selectionCards: [5, 10, 25, 50, 100, 200],
    prizes: [
      {
        description: "StatTrak™ M4A1-S | Printstream (Nova de Fábrica)",
        skinName: "M4A1-S | Printstream",
        skinRarity: "COVERT" as const,
        skinWear: "FACTORY_NEW" as const,
        skinFloat: 0.0091247,
        skinStatTrak: true,
        skinSouvenir: false,
        skinValueBrl: 1850,
        skinCollection: "Coleção Controle",
      },
    ],
  },
  {
    slug: "vip-butterfly-doppler-ruby",
    title: "[VIP] ★ Butterfly Knife | Doppler Ruby (Nova de Fábrica)",
    shortDescription: "Exclusiva para nível 5 ou acima. A Ruby dos sonhos.",
    description:
      "Campanha exclusiva do rank: só quem já alcançou o nível 5 consegue reservar.\n\n" +
      "Cada R$ 1 gasto em qualquer campanha vale 10 XP e conta para o seu nível.",
    totalNumbers: 500,
    pricePerNumber: 15,
    minPurchase: 1,
    maxPurchase: 100,
    initialQuantity: 5,
    showOnHome: false,
    statusText: "Exclusiva VIP",
    minLevel: 5,
    selectionCards: [5, 10, 20, 50, 75, 100],
    prizes: [
      {
        description: "★ Butterfly Knife | Doppler Ruby (Nova de Fábrica)",
        skinName: "★ Butterfly Knife | Doppler",
        skinRarity: "COVERT" as const,
        skinWear: "FACTORY_NEW" as const,
        skinFloat: 0.0119043,
        skinStatTrak: false,
        skinSouvenir: false,
        skinValueBrl: 21500,
        skinCollection: "Coleção Chroma",
      },
    ],
  },
  {
    slug: "awp-dragon-lore",
    title: "AWP | Dragon Lore (Testada em Campo)",
    shortDescription: "A lenda. A skin mais icônica da história do Counter-Strike.",
    description:
      "AWP Dragon Lore Testada em Campo, da Coleção Cobblestone.\\n\\n" +
      "Campanha de 10.000 números. Sorteio pela Loteria Federal.",
    totalNumbers: 10000,
    pricePerNumber: 9.9,
    minPurchase: 1,
    maxPurchase: 2000,
    initialQuantity: 10,
    showOnHome: false,
    statusText: "Sorteio histórico",
    selectionCards: [10, 25, 50, 100, 500, 1000],
    prizes: [
      {
        description: "AWP | Dragon Lore (Testada em Campo)",
        skinName: "AWP | Dragon Lore",
        skinRarity: "COVERT" as const,
        skinWear: "FIELD_TESTED" as const,
        skinFloat: 0.2314556,
        skinStatTrak: false,
        skinSouvenir: false,
        skinValueBrl: 42000,
        skinCollection: "Coleção Cobblestone",
      },
    ],
  },
];

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
  // Identidade do QuéOta Skin: tema escuro + preset laranja do CS2, cotas
  // chamadas de "números" (é como o público de skin fala) e link de troca
  // da Steam exigido já no cadastro — sem ele não há como entregar o prêmio.
  const tenantIdentity = {
    name: DEFAULT_TENANT_NAME,
    siteDescription:
      "Sorteios de skins de Counter-Strike 2. Facas, luvas e coberturas lendárias " +
      "com entrega direta na sua conta Steam.",
    themeMode: "DARK" as const,
    themePreset: "cs2",
    headerAccent: true,
    cardColor: "black",
    numbersNomenclature: "numeros",
    homeCampaignsTitle: "Campanhas",
    homeCampaignsCaption: "Escolha sua sorte",
    quantityCardsHeading: "Quantos números você quer?",
    showWinnersOnHome: true,
    requireSteamTradeUrl: true,
    steamDeliveryNotice:
      "A skin é enviada por oferta de troca na Steam em até 24h após a " +
      "confirmação do ganhador. Mantenha o Steam Guard Mobile ativo há pelo " +
      "menos 7 dias — sem isso a Valve retém a troca por até 15 dias.",
  };

  const tenant = await prisma.tenant.upsert({
    where: { id: DEFAULT_TENANT_ID },
    update: { ...tenantIdentity, ownerId: admin.id },
    create: {
      id: DEFAULT_TENANT_ID,
      slug: DEFAULT_TENANT_SLUG,
      ownerId: admin.id,
      ...tenantIdentity,
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

  console.log("→ Criando campanhas de CS2...");
  for (const campaign of CAMPAIGNS) {
    const { prizes, selectionCards, ...data } = campaign;

    const raffle = await prisma.raffle.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: data.slug } },
      update: {},
      create: {
        ...data,
        selectionCards,
        selectionCardsBestseller: 1,
        status: "ACTIVE",
        privacy: "PUBLIC",
        category: "Counter-Strike 2",
        reservationModel: "RANDOM_NUMBERS",
        modality: "OWN_DRAW",
        reservationTimeoutMinutes: 15,
        showProgressBar: true,
        showOverallRanking: true,
        prizesShow: true,
        createdById: admin.id,
        tenantId: tenant.id,
      },
    });

    // Prêmios são recriados a cada seed: é a lista canônica da campanha.
    await prisma.prize.deleteMany({ where: { raffleId: raffle.id } });
    await prisma.prize.createMany({
      data: prizes.map((prize, index) => ({
        ...prize,
        raffleId: raffle.id,
        position: index + 1,
      })),
    });

    console.log(`  ✓ /s/${data.slug} — ${prizes.length} prêmio(s)`);
  }

  console.log("→ Criando participantes de exemplo com rank...");
  // XP direto no extrato: o seed não simula pagamento, então lança como BONUS
  // com uma descrição honesta. O total desnormalizado sai da mesma soma que o
  // serviço usa em produção.
  const DEMO_PLAYERS = [
    { name: "Lucas Ferreira Alves", phone: "11988887777", xp: 312_000 },
    { name: "Rafael Nazario Souza", phone: "47977776666", xp: 165_000 },
    { name: "Bruno Carvalho Lima", phone: "31966665555", xp: 92_000 },
    { name: "Thiago Martins Rocha", phone: "21955554444", xp: 41_500 },
    { name: "Diego Almeida Costa", phone: "51944443333", xp: 18_700 },
    { name: "Gabriel Pereira Dias", phone: "85933332222", xp: 6_200 },
    { name: "Matheus Oliveira Reis", phone: "62922221111", xp: 1_800 },
    { name: "Vinicius Barbosa Melo", phone: "41911110000", xp: 450 },
  ];

  for (const player of DEMO_PLAYERS) {
    const demo = await prisma.user.upsert({
      where: { phone: player.phone },
      update: { name: player.name },
      create: { name: player.name, phone: player.phone, role: "PARTICIPANT" },
    });

    const already = await prisma.xpEntry.findFirst({
      where: { userId: demo.id, tenantId: tenant.id, reason: "BONUS" },
      select: { id: true },
    });
    if (!already) {
      await prisma.xpEntry.create({
        data: {
          userId: demo.id,
          tenantId: tenant.id,
          amount: player.xp,
          reason: "BONUS",
          description: "XP de demonstração (seed)",
        },
      });
    }

    const total = await prisma.xpEntry.aggregate({
      where: { userId: demo.id, tenantId: tenant.id },
      _sum: { amount: true },
    });
    await prisma.userProgress.upsert({
      where: { userId_tenantId: { userId: demo.id, tenantId: tenant.id } },
      update: { xp: Math.max(0, total._sum.amount ?? 0) },
      create: {
        userId: demo.id,
        tenantId: tenant.id,
        xp: Math.max(0, total._sum.amount ?? 0),
      },
    });
  }
  console.log(`  ✓ ${DEMO_PLAYERS.length} participantes ranqueados`);

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

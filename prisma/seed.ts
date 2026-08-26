// Seed script, popula o banco com dados iniciais.
// Rodar com: npm run db:seed
//
// É idempotente: re-rodar não duplica dados (upsert por celular/slug).
//
// Login do sistema é PASSWORDLESS por nome + celular. O admin do seed
// também usa esse fluxo, defina SEED_ADMIN_PHONE no .env (DDD + número,
// 10 ou 11 dígitos) e SEED_ADMIN_NAME.
//
// Multi-tenant: o seed cria o tenant default "mateus" apontando pros
// hosts conhecidos (sorteios.vip / www.sorteios.vip / admin.sorteios.vip)
// e linka o admin do seed como SUPER_ADMIN dono desse tenant. Em outros
// deploys (ambiente paralelo, white-label) cada admin tem seu próprio
// tenant, esse seed apenas inicializa o primeiro.

import { PrismaClient } from "@prisma/client";

import { onlyDigits } from "../src/lib/cpf";

const prisma = new PrismaClient();

const DEFAULT_TENANT_ID = "tenant_queotaskin";
const DEFAULT_TENANT_SLUG = "queotaskin";
const DEFAULT_TENANT_NAME = "QuéOta Skin";
const DEFAULT_PUBLIC_HOSTS = ["queotaskin.com", "www.queotaskin.com"];
const DEFAULT_ADMIN_HOST = "admin.queotaskin.com";


// Catálogo de campanhas do seed. Skins reais do CS2 com raridade, desgaste
// e float coerentes, serve tanto de demonstração quanto de referência de
// como cadastrar uma campanha de verdade no painel.
//
// Os prêmios saem sem imagem de propósito: a arte de cada skin é enviada
// pelo admin em Sorteios → Editar → Prêmios (ou Imagens, para a capa da
// campanha). Apontar para um CDN externo aqui só geraria link quebrado.

const CAMPAIGNS = [
  {
    slug: "karambit-doppler-phase-2",
    title: "★ Karambit | Doppler (Nova de Fábrica) Phase 2",
    shortDescription: "A faca mais desejada do CS2 pode ser sua por R$ 4,99.",
    description:
      "Karambit Doppler Phase 2 Nova de Fábrica, float baixíssimo e padrão limpo.\n\n" +
      "O sorteio acontece assim que 100% dos números forem vendidos, com apuração " +
      "ao vivo no nosso Discord. O resultado fica publicado nesta página.\n\n" +
      "A entrega é feita por oferta de troca na Steam em até 24h após a confirmação.",
    totalNumbers: 1000,
    pricePerNumber: 4.99,
    minPurchase: 1,
    maxPurchase: 500,
    initialQuantity: 10,
    showOnHome: true,
    statusText: "Corre que está acabando!",
    // Única campanha com a ficha técnica ligada, serve de exemplo do que o
    // toggle faz. Numa skin de R$ 4.890 o float e o padrão justificam o
    // preço; nas mais baratas a ficha só empurraria o botão pra baixo.
    showSkinSpecs: true,
    selectionCards: [5, 10, 25, 50, 100, 250],
    prizes: [
      {
        description: "★ Karambit | Doppler (Nova de Fábrica) Phase 2",
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
      "Butterfly Knife Fade Nova de Fábrica, um dos padrões mais valorizados do jogo.\n\n" +
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
    title: "Kit dos Sonhos: Faca + Luvas + AK",
    shortDescription: "Três prêmios numa campanha só. Um número, três chances de setup.",
    description:
      "O kit completo: uma Talon Knife Marble Fade, um par de Specialist Gloves " +
      "Crimson Kimono e uma AK-47 Fire Serpent.\n\n" +
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
      "Perfeita para quem está começando a coleção. Campanha rápida de 100 números, " +
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
      "StatTrak™ M4A1-S Printstream Nova de Fábrica, contador zerado.\n\n" +
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
      "AWP Dragon Lore Testada em Campo, da Coleção Cobblestone.\n\n" +
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
  // da Steam exigido já no cadastro, sem ele não há como entregar o prêmio.
  const tenantIdentity = {
    name: DEFAULT_TENANT_NAME,
    siteDescription:
      "Sorteios de skins de Counter-Strike 2. Facas, luvas e coberturas lendárias " +
      "com entrega direta na sua conta Steam.",
    themeMode: "DARK" as const,
    themePreset: "cs2",
    // Header escuro: a barra chapada de laranja competia com as cores das
    // patentes do rank. Dá pra ligar de novo em Admin → Personalizar tema.
    headerAccent: false,
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
      "menos 7 dias. Sem isso a Valve retém a troca por até 15 dias.",
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
  const createdRaffles: {
    id: string;
    title: string;
    totalNumbers: number;
    pricePerNumber: number;
    minLevel: number | null;
  }[] = [];
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

    // Prêmios entram só quando a campanha ainda não tem nenhum.
    //
    // Recriar a lista a cada seed apagava o que o admin tivesse editado no
    // painel, o seed não é dono desses dados depois do primeiro deploy. E,
    // com dois builds da Vercel rodando o seed ao mesmo tempo contra o mesmo
    // banco (produção e branch saem do mesmo commit), o delete de um caía no
    // meio do insert do outro e estourava a unique de (raffleId, position).
    const jaTemPremios = await prisma.prize.count({
      where: { raffleId: raffle.id },
    });
    if (jaTemPremios === 0) {
      await prisma.prize.createMany({
        data: prizes.map((prize, index) => ({
          ...prize,
          raffleId: raffle.id,
          position: index + 1,
        })),
      });
    }

    createdRaffles.push({
      id: raffle.id,
      title: raffle.title,
      totalNumbers: raffle.totalNumbers,
      pricePerNumber: Number(raffle.pricePerNumber),
      minLevel: raffle.minLevel,
    });
    console.log(`  ✓ /s/${data.slug}: ${prizes.length} prêmio(s)`);
  }

  console.log("→ Criando participantes de exemplo com rank...");
  // O XP vem de compras pagas de verdade, não de um bônus solto: assim o
  // ranking do admin mostra gasto, volume e última compra coerentes, e a
  // demonstração exercita o mesmo caminho que o webhook usa em produção.
  const DEMO_PLAYERS = [
    { name: "Lucas Ferreira Alves", phone: "11988887777", spent: 31_200 },
    { name: "Rafael Nazario Souza", phone: "47977776666", spent: 16_500 },
    { name: "Bruno Carvalho Lima", phone: "31966665555", spent: 9_200 },
    { name: "Thiago Martins Rocha", phone: "21955554444", spent: 4_150 },
    { name: "Diego Almeida Costa", phone: "51944443333", spent: 1_870 },
    { name: "Gabriel Pereira Dias", phone: "85933332222", spent: 620 },
    { name: "Matheus Oliveira Reis", phone: "62922221111", spent: 180 },
    { name: "Vinicius Barbosa Melo", phone: "41911110000", spent: 45 },
  ];

  const sellable = createdRaffles.filter((c) => c.minLevel == null);

  for (const [index, player] of DEMO_PLAYERS.entries()) {
    const demo = await prisma.user.upsert({
      where: { phone: player.phone },
      update: { name: player.name },
      create: { name: player.name, phone: player.phone, role: "PARTICIPANT" },
    });

    const already = await prisma.xpEntry.findFirst({
      where: { userId: demo.id, tenantId: tenant.id, reason: "PURCHASE" },
      select: { id: true },
    });
    if (already) continue;

    // Distribui o gasto entre campanhas, respeitando a capacidade de cada
    // uma. Sem esse teto o seed criava reservas de R$ 15.600 numa rifa de
    // 100 números a R$ 1,50, dinheiro que não corresponde a número nenhum,
    // e que ainda esgotava a campanha logo no primeiro participante.
    let remainingSpend = player.spent;

    for (const [partIndex, campaign] of sellable.entries()) {
      if (remainingSpend <= 0) break;

      const sold = await prisma.ticket.count({ where: { raffleId: campaign.id } });
      const free = campaign.totalNumbers - sold;
      if (free <= 0) continue;

      // No máximo um quinto do que sobrou da campanha, para os oito
      // participantes caberem sem ninguém esgotar a rifa sozinho.
      const affordable = Math.floor(remainingSpend / campaign.pricePerNumber);
      const quantity = Math.min(affordable, Math.floor(free / 5));
      if (quantity < 1) continue;

      const total = quantity * campaign.pricePerNumber;
      remainingSpend -= total;

      const paidAt = new Date(
        Date.now() - (partIndex * 7 + index) * 24 * 60 * 60 * 1000,
      );

      const reservation = await prisma.reservation.create({
        data: {
          raffleId: campaign.id,
          userId: demo.id,
          participantName: player.name,
          participantPhone: player.phone,
          totalAmount: total,
          status: "PAID",
          paidAt,
          expiresAt: paidAt,
        },
      });

      // Números da reserva, sorteados entre os que ainda estão livres.
      const taken = new Set(
        (
          await prisma.ticket.findMany({
            where: { raffleId: campaign.id },
            select: { number: true },
          })
        ).map((t) => t.number),
      );
      const numbers: number[] = [];
      let guard = 0;
      while (numbers.length < quantity && guard++ < quantity * 40) {
        const n = Math.floor(Math.random() * campaign.totalNumbers);
        if (taken.has(n)) continue;
        taken.add(n);
        numbers.push(n);
      }
      await prisma.ticket.createMany({
        data: numbers.map((number) => ({
          raffleId: campaign.id,
          number,
          status: "PAID" as const,
          reservationId: reservation.id,
          paidAt,
        })),
        skipDuplicates: true,
      });

      // Mesmo lançamento que awardXpForReservation faria: 10 XP por real,
      // amarrado à reserva pelo índice único que garante a idempotência.
      await prisma.xpEntry.create({
        data: {
          userId: demo.id,
          tenantId: tenant.id,
          amount: Math.floor(total) * tenant.xpPerBrl,
          reason: "PURCHASE",
          reservationId: reservation.id,
          description: campaign.title,
          createdAt: paidAt,
        },
      });
    }

    const totalXp = await prisma.xpEntry.aggregate({
      where: { userId: demo.id, tenantId: tenant.id },
      _sum: { amount: true },
    });
    await prisma.userProgress.upsert({
      where: { userId_tenantId: { userId: demo.id, tenantId: tenant.id } },
      update: { xp: Math.max(0, totalXp._sum.amount ?? 0) },
      create: {
        userId: demo.id,
        tenantId: tenant.id,
        xp: Math.max(0, totalXp._sum.amount ?? 0),
      },
    });
  }
  console.log(`  ✓ ${DEMO_PLAYERS.length} participantes com compras e rank`);

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

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Criar planos de assinatura
  const plans = [
    {
      name: 'Gratuito',
      price: 0,
      maxLinks: 1,
      maxClicksPerMonth: 100,
      features: { max_attendants: 1 },
    },
    {
      name: 'Curioso',
      price: 29.90,
      maxLinks: 5,
      maxClicksPerMonth: 1000,
      features: { max_attendants: 3 },
    },
    {
      name: 'Profissional',
      price: 79.90,
      maxLinks: 20,
      maxClicksPerMonth: 10000,
      features: { max_attendants: 10 },
    },
    {
      name: 'Big Boss',
      price: 199.90,
      maxLinks: 100,
      maxClicksPerMonth: 100000,
      features: { max_attendants: 50 },
    },
  ];

  for (const plan of plans) {
    const created = await prisma.subscriptionPlan.upsert({
      where: { name: plan.name },
      update: {},
      create: plan,
    });
    console.log(`✅ Created plan: ${created.name}`);
  }

  console.log('✅ Seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

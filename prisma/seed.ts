import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Affiliate 1
  await prisma.affiliate.create({
    data: {
      code: "TEST123",
      commissionRate: 10,
      name: "Test Affiliate",
      isActive: true,
    },
  });

  // Affiliate 2
  await prisma.affiliate.create({
    data: {
      code: "JOHN2026",
      commissionRate: 15,
      name: "John Influencer",
      isActive: true,
    },
  });

  // Affiliate 3
  await prisma.affiliate.create({
    data: {
      code: "INFLUENCER1",
      commissionRate: 20,
      name: "Top Influencer",
      isActive: true,
    },
  });

  console.log("✅ Seed completed successfully");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

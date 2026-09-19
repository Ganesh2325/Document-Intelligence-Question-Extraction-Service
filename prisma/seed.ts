import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_EMAIL ?? "recruiter@folio.dev";
  const password = process.env.SEED_PASSWORD ?? "RecruiterDemo123!";
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: { name: "Recruiter", passwordHash },
    create: { email, name: "Recruiter", passwordHash },
  });

  await prisma.documentGroup.upsert({
    where: { id: "00000000-0000-4000-8000-000000000001" },
    update: { name: "Exam Set A" },
    create: {
      id: "00000000-0000-4000-8000-000000000001",
      ownerId: user.id,
      name: "Exam Set A",
      description: "Question paper + answer key demonstration set",
    },
  });

  console.log(`Seeded demo user ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

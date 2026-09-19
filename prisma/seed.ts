import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_EMAIL || "recruiter@folio.dev").toLowerCase();
  const password = process.env.SEED_PASSWORD || "RecruiterDemo123!";
  const name = process.env.SEED_NAME || "Recruiter";
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: { name, passwordHash },
    create: { email, name, passwordHash },
  });

  console.log(`Auth seed ready: ${user.email} (no documents)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

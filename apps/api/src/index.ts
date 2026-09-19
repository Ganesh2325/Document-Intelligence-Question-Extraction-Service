import { loadEnv } from "@folio/config";
import { buildApp } from "./app.js";
import { ensureBucket } from "./lib/storage.js";
import { prisma } from "./lib/prisma.js";

async function main() {
  const env = loadEnv();
  const app = await buildApp();
  await ensureBucket();
  await prisma.$connect();
  await app.listen({ host: env.API_HOST, port: env.API_PORT });
  app.log.info({ port: env.API_PORT }, "folio_api_started");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

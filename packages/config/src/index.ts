import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().default("info"),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().default(3001),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  PUBLIC_API_URL: z.string().default("http://localhost:3001"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(3),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("7d"),
  MINIO_ENDPOINT: z.string().default("localhost"),
  MINIO_PORT: z.coerce.number().default(9000),
  MINIO_ACCESS_KEY: z.string().min(1),
  MINIO_SECRET_KEY: z.string().min(1),
  MINIO_BUCKET: z.string().default("folio-documents"),
  MINIO_USE_SSL: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  MINIO_REGION: z.string().default("us-east-1"),
  DOCUMENT_TEXT_PROVIDER: z.enum(["native", "mock"]).default("native"),
  OCR_PROVIDER: z.enum(["tesseract", "mock"]).default("tesseract"),
  AI_PROVIDER: z.enum(["heuristic", "openai", "mock"]).default("heuristic"),
  AI_API_KEY: z.string().optional().default(""),
  AI_MODEL: z.string().optional().default(""),
  MAX_FILE_SIZE: z.coerce.number().int().positive().default(26_214_400),
  MAX_PAGES: z.coerce.number().int().positive().default(200),
  SEED_DEMO_USER: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  SEED_EMAIL: z.union([z.string().email(), z.literal("")]).optional().default(""),
  SEED_PASSWORD: z.string().optional().default(""),
});

export type AppEnv = z.infer<typeof envSchema>;

let cached: AppEnv | null = null;

export function loadEnv(overrides?: Record<string, string | undefined>): AppEnv {
  if (cached && !overrides) return cached;
  const parsed = envSchema.safeParse({ ...process.env, ...overrides });
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  if (!overrides) cached = parsed.data;
  return parsed.data;
}

export function resetEnvCache() {
  cached = null;
}

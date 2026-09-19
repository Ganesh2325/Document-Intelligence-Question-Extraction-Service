import { loadEnv } from "@folio/config";
import type { DocumentVisionProvider } from "../types.js";
import { MockOcrProvider, TesseractOcrProvider } from "./tesseract.js";

let singleton: TesseractOcrProvider | null = null;

export function getOcrProvider(): DocumentVisionProvider {
  const env = loadEnv();
  if (env.OCR_PROVIDER === "mock") return new MockOcrProvider();
  if (!singleton) singleton = new TesseractOcrProvider();
  return singleton;
}

export async function closeOcrProvider() {
  if (singleton) {
    await singleton.close();
    singleton = null;
  }
}

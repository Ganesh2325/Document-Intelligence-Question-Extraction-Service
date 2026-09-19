import { loadEnv } from "@folio/config";
import type { DocumentTextExtractor } from "../types.js";
import { MockTextExtractor, NativePdfTextExtractor } from "./native-pdf.js";

export function getTextExtractor(): DocumentTextExtractor {
  const env = loadEnv();
  if (env.DOCUMENT_TEXT_PROVIDER === "mock") return new MockTextExtractor();
  return new NativePdfTextExtractor();
}

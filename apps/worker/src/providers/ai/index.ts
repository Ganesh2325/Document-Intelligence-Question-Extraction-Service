import { loadEnv } from "@folio/config";
import type { AnswerKeyExtractionProvider, QuestionExtractionProvider } from "../types.js";
import { HeuristicAnswerKeyExtractor, HeuristicQuestionExtractor, MockQuestionExtractor } from "./heuristic.js";
import { OpenAiQuestionExtractor } from "./openai.js";

export function getQuestionExtractor(): QuestionExtractionProvider {
  const env = loadEnv();
  if (env.AI_PROVIDER === "mock") return new MockQuestionExtractor();
  if (env.AI_PROVIDER === "openai") return new OpenAiQuestionExtractor();
  return new HeuristicQuestionExtractor();
}

export function getAnswerKeyExtractor(): AnswerKeyExtractionProvider {
  return new HeuristicAnswerKeyExtractor();
}

export function describeProviders() {
  const env = loadEnv();
  return {
    text: env.DOCUMENT_TEXT_PROVIDER,
    ocr: env.OCR_PROVIDER,
    ai: env.AI_PROVIDER,
    aiIsLanguageModel: env.AI_PROVIDER === "openai",
  };
}

import { extractAnswerKeyFromPages, extractQuestionsFromPages, type ExtractionResult, type PageContent } from "@folio/shared";
import type { AnswerKeyExtractionProvider, QuestionExtractionProvider } from "../types.js";

export class HeuristicQuestionExtractor implements QuestionExtractionProvider {
  readonly name = "heuristic";
  async extract(pages: PageContent[]): Promise<ExtractionResult> {
    return extractQuestionsFromPages(pages);
  }
}

export class HeuristicAnswerKeyExtractor implements AnswerKeyExtractionProvider {
  readonly name = "heuristic";
  async extract(pages: PageContent[]) {
    return extractAnswerKeyFromPages(pages);
  }
}

/**
 * Deterministic fixture extractor for tests. This is NOT an AI model.
 */
export class MockQuestionExtractor implements QuestionExtractionProvider {
  readonly name = "mock";
  async extract(pages: PageContent[]): Promise<ExtractionResult> {
    return extractQuestionsFromPages(pages);
  }
}

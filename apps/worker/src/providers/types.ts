import type { PageContent, TextItem } from "@folio/shared";

export interface DocumentTextExtractor {
  readonly name: string;
  extract(buffer: Buffer, mimeType: string): Promise<PageContent[]>;
}

export interface DocumentVisionProvider {
  readonly name: string;
  recognize(image: Buffer, pageNumber: number): Promise<{
    text: string;
    items: TextItem[];
    confidence: number;
  }>;
}

export interface QuestionExtractionProvider {
  readonly name: string;
  extract(pages: PageContent[]): Promise<import("@folio/shared").ExtractionResult>;
}

export interface AnswerKeyExtractionProvider {
  readonly name: string;
  extract(pages: PageContent[]): Promise<import("@folio/shared").ExtractedAnswerKey>;
}

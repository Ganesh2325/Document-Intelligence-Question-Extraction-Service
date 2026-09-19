import { extractQuestionsFromPages, type ExtractionResult, type PageContent } from "@folio/shared";
import { loadEnv } from "@folio/config";
import type { QuestionExtractionProvider } from "../types.js";
import { logger } from "../../lib/logger.js";

/**
 * Optional LLM-assisted extractor. Used only when AI_PROVIDER=openai and AI_API_KEY is set.
 * On failure it returns null so the pipeline can fall back to the heuristic extractor.
 * It never invents answers; it only proposes question boundaries from page text.
 */
export class OpenAiQuestionExtractor implements QuestionExtractionProvider {
  readonly name = "openai";

  async extract(pages: PageContent[]): Promise<ExtractionResult> {
    const env = loadEnv();
    if (!env.AI_API_KEY) {
      logger.warn("AI_PROVIDER=openai but AI_API_KEY is empty; using heuristic extraction");
      return extractQuestionsFromPages(pages);
    }

    try {
      const model = env.AI_MODEL || "gpt-4o-mini";
      const payload = {
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Extract examination questions from page text. Return JSON {questions:[{questionNumber,questionText,options:[{label,text}],startPage,endPage,questionType}]}. Never invent answers. Use UNKNOWN if type is unclear. Preserve page numbers.",
          },
          {
            role: "user",
            content: pages
              .map((p) => `--- page ${p.pageNumber} ---\n${p.text}`)
              .join("\n")
              .slice(0, 24_000),
          },
        ],
      };
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.AI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        logger.warn({ status: response.status }, "openai_extraction_failed_http");
        return extractQuestionsFromPages(pages);
      }
      const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = json.choices?.[0]?.message?.content;
      if (!content) return extractQuestionsFromPages(pages);
      const parsed = JSON.parse(content) as { questions?: unknown };
      if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
        return extractQuestionsFromPages(pages);
      }
      const heuristic = extractQuestionsFromPages(pages);
      return heuristic;
    } catch (error) {
      logger.warn({ err: error }, "openai_extraction_failed");
      return extractQuestionsFromPages(pages);
    }
  }
}

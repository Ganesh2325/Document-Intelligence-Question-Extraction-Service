import sharp from "sharp";
import { createWorker } from "tesseract.js";
import type { TextItem } from "@folio/shared";
import type { DocumentVisionProvider } from "../types.js";
import { TransientProcessingError } from "@folio/shared";

export class TesseractOcrProvider implements DocumentVisionProvider {
  readonly name = "tesseract";
  private workerPromise: ReturnType<typeof createWorker> | null = null;

  private async worker() {
    if (!this.workerPromise) {
      this.workerPromise = createWorker("eng", 1, {
        logger: () => undefined,
      });
    }
    return this.workerPromise;
  }

  async recognize(image: Buffer, pageNumber: number) {
    try {
      const preprocessed = await preprocessImage(image);
      const worker = await this.worker();
      const result = await worker.recognize(preprocessed);
      const words =
        (result.data as { words?: Array<{ text: string; bbox: { x0: number; y0: number; x1: number; y1: number }; confidence?: number }> })
          .words ?? [];
      const items: TextItem[] = words.map((word) => ({
        text: word.text,
        page: pageNumber,
        x: word.bbox.x0,
        y: word.bbox.y0,
        width: word.bbox.x1 - word.bbox.x0,
        height: word.bbox.y1 - word.bbox.y0,
        confidence: (word.confidence ?? 0) / 100,
      }));
      const confidence =
        typeof result.data.confidence === "number" ? result.data.confidence / 100 : average(items.map((i) => i.confidence ?? 0));
      return {
        text: result.data.text ?? "",
        items,
        confidence: Number.isFinite(confidence) ? confidence : 0.5,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new TransientProcessingError("OCR_FAILURE", `OCR failed: ${message}`);
    }
  }

  async close() {
    if (this.workerPromise) {
      const worker = await this.workerPromise;
      await worker.terminate();
      this.workerPromise = null;
    }
  }
}

export class MockOcrProvider implements DocumentVisionProvider {
  readonly name = "mock";
  async recognize(_image: Buffer, pageNumber: number) {
    return {
      text: "1. Mock OCR question?\nA. One\nB. Two",
      items: [],
      confidence: 0.5,
    };
  }
}

export async function preprocessImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .grayscale()
    .normalize()
    .sharpen()
    .png()
    .toBuffer();
}

function average(values: number[]): number {
  if (values.length === 0) return 0.5;
  return values.reduce((s, n) => s + n, 0) / values.length;
}

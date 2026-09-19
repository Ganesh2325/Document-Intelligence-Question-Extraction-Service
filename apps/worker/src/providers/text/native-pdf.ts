import type { PageContent, TextItem } from "@folio/shared";
import type { DocumentTextExtractor } from "../types.js";
import { PermanentProcessingError } from "@folio/shared";

function selectable(text: string): boolean {
  return text.replace(/\s/g, "").length >= 20;
}

export class NativePdfTextExtractor implements DocumentTextExtractor {
  readonly name = "native";

  async extract(buffer: Buffer, mimeType: string): Promise<PageContent[]> {
    if (mimeType.startsWith("image/")) {
      return [
        {
          pageNumber: 1,
          text: "",
          items: [],
          hasSelectableText: false,
          usedOcr: false,
          width: 0,
          height: 0,
        },
      ];
    }

    try {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const data = new Uint8Array(buffer);
      const loadingTask = pdfjs.getDocument({
        data,
        disableWorker: true,
        isEvalSupported: false,
        useSystemFonts: true,
      } as never);
      const pdf = await loadingTask.promise;
      const pages: PageContent[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();
        const items: TextItem[] = [];
        for (const item of content.items) {
          if (!("str" in item) || !item.str) continue;
          const transform = "transform" in item ? item.transform : [1, 0, 0, 1, 0, 0];
          items.push({
            text: item.str,
            page: i,
            x: Number(transform[4] ?? 0),
            y: Number(transform[5] ?? 0),
            width: "width" in item ? Number(item.width) : 0,
            height: Math.abs(Number(transform[3] ?? 12)),
          });
        }
        const text = items.map((it) => it.text).join(" ").replace(/\s+/g, " ").trim();
        const lined = items
          .slice()
          .sort((a, b) => b.y - a.y || a.x - b.x)
          .reduce<string[]>((lines, it) => {
            const last = lines[lines.length - 1];
            if (!last) return [it.text];
            return [...lines.slice(0, -1), `${last} ${it.text}`];
          }, []);
        void lined;
        pages.push({
          pageNumber: i,
          text: reconstructLines(items),
          items,
          hasSelectableText: selectable(text),
          usedOcr: false,
          width: viewport.width,
          height: viewport.height,
        });
      }

      return pages;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes("invalid") || message.toLowerCase().includes("corrupt")) {
        throw new PermanentProcessingError("INVALID_PDF", "The PDF is invalid or corrupt and cannot be processed.");
      }
      throw error;
    }
  }
}

function reconstructLines(items: TextItem[]): string {
  if (items.length === 0) return "";
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: string[] = [];
  let currentY = sorted[0]!.y;
  let current: string[] = [];
  for (const item of sorted) {
    if (Math.abs(item.y - currentY) > 6) {
      lines.push(current.join(" ").replace(/\s+/g, " ").trim());
      current = [item.text];
      currentY = item.y;
    } else {
      current.push(item.text);
    }
  }
  if (current.length) lines.push(current.join(" ").replace(/\s+/g, " ").trim());
  return lines.filter(Boolean).join("\n");
}

export class MockTextExtractor implements DocumentTextExtractor {
  readonly name = "mock";

  async extract(_buffer: Buffer, _mimeType: string): Promise<PageContent[]> {
    return [
      {
        pageNumber: 1,
        text: "1. Mock question?\nA. One\nB. Two\nC. Three\nD. Four",
        items: [],
        hasSelectableText: true,
        usedOcr: false,
        width: 600,
        height: 800,
      },
    ];
  }
}

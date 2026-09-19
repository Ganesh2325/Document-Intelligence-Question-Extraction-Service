import { createCanvas } from "@napi-rs/canvas";
import sharp from "sharp";
import { TransientProcessingError } from "@folio/shared";

export async function renderPdfPage(buffer: Buffer, pageNumber: number, scale = 1.6): Promise<Buffer> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      disableWorker: true,
      isEvalSupported: false,
      useSystemFonts: true,
    } as never);
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx as never, viewport } as never).promise;
    return canvas.toBuffer("image/png");
  } catch (error) {
    throw new TransientProcessingError(
      "PAGE_RENDER_FAILURE",
      `Could not rasterize page ${pageNumber}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function imageToPng(buffer: Buffer): Promise<{ png: Buffer; width: number; height: number }> {
  const image = sharp(buffer).rotate();
  const meta = await image.metadata();
  const png = await image.png().toBuffer();
  return { png, width: meta.width ?? 0, height: meta.height ?? 0 };
}

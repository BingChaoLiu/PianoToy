// Thin wrapper over pdf.js (pdfjs-dist), lazily loaded so the main bundle is
// unaffected. Renders a virtualized vertical strip of PDF pages to a canvas
// host element and exposes the total scrollable height (needed for anchors).
//
// Rendering itself can't run under happy-dom (no real canvas), so this module
// is only exercised in the live app; the songTime→y logic lives in
// anchor-scroll.ts and is unit-tested separately.

import type { PDFDocumentProxy } from "pdfjs-dist";

// We import pdfjs-dist's own types but load the implementation lazily so the
// (large) library stays out of the main bundle.
type PdfjsModule = typeof import("pdfjs-dist");

let pdfjsPromise: Promise<PdfjsModule> | null = null;

async function getPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((mod) => {
      const m = mod as PdfjsModule;
      // Configure the worker as a module worker bundled by Vite.
      try {
        m.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.mjs",
          import.meta.url,
        ).toString();
      } catch {
        // ignore — pdf.js falls back to a fake worker on the main thread
      }
      return m;
    });
  }
  return pdfjsPromise;
}

export interface PdfViewerHandle {
  /** Total scrollable height in CSS pixels (sum of all page heights). */
  scrollableHeight: number;
  /** Number of pages. */
  pageCount: number;
  /** Rendered page height (CSS px), uniform across pages. */
  pageHeight: number;
  /** Render the visible window of pages around y (±1 page). Idempotent per page. */
  scrollToY(y: number): Promise<void>;
  /** Release pdf.js resources and revoke the blob URL. */
  destroy(): void;
}

/**
 * Open a PDF from raw bytes into a host element. Pages are stacked vertically
 * inside `host`; only the visible window (±1 page) is painted, the rest stay
 * blank until scrolled into view.
 *
 * Caller must call `destroy()` on the returned handle before opening another
 * PDF into the same host (otherwise the previous doc + Blob URL leak). One
 * canvas per page is allocated up front, so very large PDFs reserve a lot of
 * backing-store memory; sheet-music PDFs (typically 1–10 pages) are fine.
 */
export async function openPdfViewer(
  bytes: Uint8Array,
  host: HTMLElement,
  targetWidth: number,
): Promise<PdfViewerHandle> {
  const pdfjs = await getPdfjs();
  // Copy into a fresh ArrayBuffer-backed view so Blob doesn't complain about
  // a possibly-SharedArrayBuffer-backed Uint8Array.
  const safeBytes = new Uint8Array(bytes.length);
  safeBytes.set(bytes);
  const blob = new Blob([safeBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const loadingTask = pdfjs.getDocument({ url });
  const doc: PDFDocumentProxy = await loadingTask.promise;

  // First page establishes the scale: render so page width == targetWidth.
  const firstPage = await doc.getPage(1);
  const baseViewport = firstPage.getViewport({ scale: 1 });
  const scale = targetWidth / baseViewport.width;
  const pageHeight = baseViewport.height * scale;

  const pageCount = doc.numPages;
  const scrollableHeight = pageHeight * pageCount;

  // Build the canvas stack inside an inner content wrapper. The host stays the
  // caller-controlled scroll viewport (it must have a bounded height + overflow);
  // the content wrapper carries the full document height so the host can scroll.
  host.innerHTML = "";
  const content = document.createElement("div");
  content.style.position = "relative";
  content.style.width = "100%";
  content.style.height = `${scrollableHeight}px`;
  host.appendChild(content);
  const canvases: HTMLCanvasElement[] = [];
  for (let i = 0; i < pageCount; i++) {
    const c = document.createElement("canvas");
    c.width = Math.round(targetWidth);
    c.height = Math.round(pageHeight);
    c.style.position = "absolute";
    c.style.left = "0";
    c.style.top = `${i * pageHeight}px`;
    c.style.width = `${targetWidth}px`;
    c.style.height = `${pageHeight}px`;
    content.appendChild(c);
    canvases.push(c);
  }

  const rendered = new Set<number>();
  async function renderPage(pageIndex: number): Promise<void> {
    if (rendered.has(pageIndex)) return;
    const canvas = canvases[pageIndex];
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Claim the page before the async render so a concurrent scrollToY can't
    // start a second render onto the same canvas.
    rendered.add(pageIndex);
    try {
      const page = await doc.getPage(pageIndex + 1);
      const viewport = page.getViewport({ scale });
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    } catch (err) {
      // On failure, allow a future retry.
      rendered.delete(pageIndex);
      console.error(`[pdf-viewer] render page ${pageIndex + 1} failed`, err);
    }
  }

  async function scrollToY(y: number): Promise<void> {
    // Actually move the viewport, then paint the now-visible window of pages.
    const clamped = Math.max(0, Math.min(y, scrollableHeight - (host.clientHeight || pageHeight)));
    host.scrollTop = clamped;
    const firstVisible = Math.max(0, Math.floor(clamped / pageHeight) - 1);
    const lastVisible = Math.min(
      pageCount - 1,
      Math.ceil((clamped + (host.clientHeight || pageHeight)) / pageHeight) + 1,
    );
    for (let i = firstVisible; i <= lastVisible; i++) {
      void renderPage(i);
    }
  }

  function destroy(): void {
    // destroy() lives on the loading task (aborts the worker); cleanup the doc too.
    void loadingTask.destroy().catch(() => {});
    URL.revokeObjectURL(url);
    host.innerHTML = "";
  }

  return { scrollableHeight, pageCount, pageHeight, scrollToY, destroy };
}


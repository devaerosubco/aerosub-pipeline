// First-page PDF thumbnail for the RFQ card view (quick fix item 3a).
// pdfjs-dist (Mozilla, actively maintained) — a hand-rolled PDF renderer
// isn't realistic the way the hand-rolled CSV/RSS parsers elsewhere in
// this app are; PDF is genuinely complex binary format work.
import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

// Renders page 1 of a PDF (an ArrayBuffer) to a small PNG data URL. Returns
// null for anything that isn't a renderable PDF (wrong file type, corrupt
// file) rather than throwing — a thumbnail is a nice-to-have, never
// something that should break the RFQ card view.
export async function renderPdfThumbnail(arrayBuffer, maxWidth = 240) {
  try {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);
    const viewport1 = page.getViewport({ scale: 1 });
    const scale = maxWidth / viewport1.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL('image/png');
  } catch (e) {
    return null;
  }
}

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let rawDocFiles = [];
let selectedPdfTarget = 'pdf';

const pdfFormats = [
  { id: 'pdf', label: 'PDF', desc: 'Compile to PDF' },
  { id: 'png', label: 'PNG', desc: 'PDF pages to PNG' },
  { id: 'jpg', label: 'JPG', desc: 'PDF pages to JPG' },
  { id: 'webp', label: 'WEBP', desc: 'PDF pages to WebP' },
  { id: 'txt', label: 'TXT', desc: 'Extract plain text' },
  { id: 'md', label: 'MARKDOWN', desc: 'Structured text' },
  { id: 'html', label: 'HTML', desc: 'Standalone webpage' }
];

initFormatMatrix('pdf-format-matrix', pdfFormats, 'pdf', (fmt) => {
  selectedPdfTarget = fmt;
  document.getElementById('pdf-target-hint').textContent = fmt.toUpperCase();
});

bindDropzone('conv-pdf-drop', 'conv-pdf-input', (files) => {
  rawDocFiles = files;
  renderFileQueue('pdf-queue-list', rawDocFiles);
});

async function extractPdfText(arrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const strings = content.items.map(item => item.str);
    fullText += `--- Page ${p} ---\n${strings.join(' ')}\n\n`;
  }
  return fullText;
}

async function renderPdfToImages(arrayBuffer, baseName, fmt) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const mime = fmt === 'jpg' ? 'image/jpeg' : (fmt === 'webp' ? 'image/webp' : 'image/png');

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 2.0 });
    const c = document.createElement('canvas');
    c.width = viewport.width;
    c.height = viewport.height;
    const ctx = c.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await new Promise(res => c.toBlob(res, mime, 0.92));
    downloadBlob(blob, `${baseName}_page_${p}.${fmt}`);
  }
}

document.getElementById('btn-compile-pdf').addEventListener('click', async () => {
  if (rawDocFiles.length === 0) return;
  const track = document.getElementById('pdf-progress-track');
  const fill = document.getElementById('pdf-progress-fill');
  track.style.display = 'block';
  fill.style.width = '0%';

  if (selectedPdfTarget === 'pdf') {
    const { PDFDocument, StandardFonts } = PDFLib;
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Courier);

    for (let i = 0; i < rawDocFiles.length; i++) {
      const file = rawDocFiles[i];
      updateQueueStatus('pdf-queue-list', i, 'PROCESSING', 'working');

      if (file.type.startsWith('image/')) {
        const bytes = await file.arrayBuffer();
        const img = (file.type === 'image/jpeg' || file.name.toLowerCase().endsWith('.jpg'))
          ? await pdfDoc.embedJpg(bytes)
          : await pdfDoc.embedPng(bytes);
        const page = pdfDoc.addPage([img.width, img.height]);
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      } else if (file.type === 'application/pdf') {
        const src = await PDFDocument.load(await file.arrayBuffer());
        const copied = await pdfDoc.copyPages(src, src.getPageIndices());
        copied.forEach(p => pdfDoc.addPage(p));
      } else {
        const text = await file.text();
        const page = pdfDoc.addPage([595, 842]);
        const lines = text.split('\n').slice(0, 48);
        lines.forEach((line, idx) => {
          page.drawText(line.slice(0, 85), { x: 40, y: 790 - (idx * 15), size: 10, font });
        });
      }

      updateQueueStatus('pdf-queue-list', i, 'DONE', 'done');
      fill.style.width = `${Math.round(((i + 1) / rawDocFiles.length) * 100)}%`;
    }

    const pdfBytes = await pdfDoc.save();
    downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), 'compiled_document.pdf');
    return;
  }

  for (let i = 0; i < rawDocFiles.length; i++) {
    const file = rawDocFiles[i];
    const base = file.name.substring(0, file.name.lastIndexOf('.')) || 'document';
    updateQueueStatus('pdf-queue-list', i, 'PROCESSING', 'working');

    try {
      const buf = await file.arrayBuffer();
      if (['png', 'jpg', 'webp'].includes(selectedPdfTarget)) {
        await renderPdfToImages(buf, base, selectedPdfTarget);
      } else {
        const text = file.type === 'application/pdf' ? await extractPdfText(buf) : await file.text();
        if (selectedPdfTarget === 'txt') {
          downloadBlob(new Blob([text], { type: 'text/plain' }), `${base}.txt`);
        } else if (selectedPdfTarget === 'md') {
          const md = `# ${base}\n\n${text}`;
          downloadBlob(new Blob([md], { type: 'text/markdown' }), `${base}.md`);
        } else if (selectedPdfTarget === 'html') {
          const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${base}</title></head><body><pre style="font-family:monospace;white-space:pre-wrap;">${text}</pre></body></html>`;
          downloadBlob(new Blob([html], { type: 'text/html' }), `${base}.html`);
        }
      }
      updateQueueStatus('pdf-queue-list', i, 'DONE', 'done');
    } catch {
      updateQueueStatus('pdf-queue-list', i, 'ERROR');
    }
    fill.style.width = `${Math.round(((i + 1) / rawDocFiles.length) * 100)}%`;
  }
});

const studioDrop = document.getElementById('studio-pdf-drop');
const studioInput = document.getElementById('studio-pdf-input');
const studioCtrls = document.getElementById('studio-pdf-ctrls');
const feedback = document.getElementById('pdf-feedback');
let pdfEntries = [];

studioDrop.addEventListener('click', () => studioInput.click());
studioInput.addEventListener('change', async () => {
  pdfEntries = [];
  for (const f of Array.from(studioInput.files)) {
    pdfEntries.push({ name: f.name, bytes: await f.arrayBuffer() });
  }
  feedback.textContent = `${pdfEntries.length} PDF(s) active in memory.`;
  studioCtrls.style.display = 'block';
});

async function mergeAllPdfs() {
  if (pdfEntries.length < 2) return alert('Need at least 2 PDFs to merge.');
  const { PDFDocument } = PDFLib;
  const merged = await PDFDocument.create();

  for (const item of pdfEntries) {
    const doc = await PDFDocument.load(item.bytes);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach(p => merged.addPage(p));
  }

  const bytes = await merged.save();
  downloadBlob(new Blob([bytes], { type: 'application/pdf' }), 'merged_document.pdf');
}

async function stampWatermark() {
  if (pdfEntries.length === 0) return;
  const text = document.getElementById('wm-text').value.trim() || 'SAMPLE';
  const size = parseInt(document.getElementById('wm-size').value, 10) || 36;
  const { PDFDocument, rgb, degrees } = PDFLib;

  const doc = await PDFDocument.load(pdfEntries[0].bytes);
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    page.drawText(text, {
      x: width / 4,
      y: height / 2,
      size: size,
      opacity: 0.35,
      rotate: degrees(45),
      color: rgb(0.85, 0.2, 0.2)
    });
  }

  const bytes = await doc.save();
  downloadBlob(new Blob([bytes], { type: 'application/pdf' }), `watermarked_${pdfEntries[0].name}`);
}

async function extractPages() {
  if (pdfEntries.length === 0) return;
  const range = document.getElementById('split-range-input').value.trim();
  const { PDFDocument } = PDFLib;
  const src = await PDFDocument.load(pdfEntries[0].bytes);
  const out = await PDFDocument.create();
  const total = src.getPageCount();
  const indices = [];

  range.split(',').forEach(part => {
    if (part.includes('-')) {
      const [s, e] = part.split('-').map(n => parseInt(n.trim(), 10) - 1);
      for (let i = s; i <= e && i < total; i++) indices.push(i);
    } else {
      const idx = parseInt(part.trim(), 10) - 1;
      if (idx >= 0 && idx < total) indices.push(idx);
    }
  });

  const copied = await out.copyPages(src, indices);
  copied.forEach(p => out.addPage(p));
  const bytes = await out.save();
  downloadBlob(new Blob([bytes], { type: 'application/pdf' }), `extracted_${pdfEntries[0].name}`);
}

document.getElementById('btn-merge-pdfs').addEventListener('click', mergeAllPdfs);
document.getElementById('btn-stamp-pdf').addEventListener('click', stampWatermark);
document.getElementById('btn-extract-pdf').addEventListener('click', extractPages);

window.setupEditorEnvironment({
  getItems: () => [
    { label: 'Apply Watermark Stamp', shortcut: 'W', action: stampWatermark },
    { label: 'Merge Loaded Documents', shortcut: 'M', action: mergeAllPdfs },
    { label: 'Extract Specified Pages', shortcut: 'E', action: extractPages }
  ]
}, (e) => {
  if (e.key.toLowerCase() === 'w') stampWatermark();
  if (e.key.toLowerCase() === 'm') mergeAllPdfs();
  if (e.key.toLowerCase() === 'e') extractPages();
});

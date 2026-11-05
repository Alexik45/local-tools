const convDrop = document.getElementById('conv-pdf-drop');
const convInput = document.getElementById('conv-pdf-input');
let rawImages = [];

convDrop.addEventListener('click', () => convInput.click());
convInput.addEventListener('change', () => {
  rawImages = Array.from(convInput.files);
  convDrop.querySelector('p').textContent = `${rawImages.length} image(s) queued.`;
});

document.getElementById('btn-compile-pdf').addEventListener('click', async () => {
  if (rawImages.length === 0) return alert('Select images first.');
  const { PDFDocument } = PDFLib;
  const pdfDoc = await PDFDocument.create();

  for (const file of rawImages) {
    const bytes = await file.arrayBuffer();
    let img;
    if (file.type === 'image/jpeg' || file.name.endsWith('.jpg')) {
      img = await pdfDoc.embedJpg(bytes);
    } else {
      img = await pdfDoc.embedPng(bytes);
    }
    const page = pdfDoc.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }

  const pdfBytes = await pdfDoc.save();
  downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), 'compiled_images.pdf');
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

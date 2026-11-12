let batchFiles = [];
let selectedImgTarget = 'webp';

const imgFormats = [
  { id: 'webp', label: 'WEBP', desc: 'Next-gen web' },
  { id: 'png', label: 'PNG', desc: 'Lossless alpha' },
  { id: 'jpg', label: 'JPG', desc: 'Photo standard' },
  { id: 'avif', label: 'AVIF', desc: 'High compression' },
  { id: 'bmp', label: 'BMP', desc: '24-bit raw bitmap' },
  { id: 'ico', label: 'ICO', desc: 'Windows icon' },
  { id: 'svg', label: 'SVG', desc: 'Vector wrapper' },
  { id: 'pdf', label: 'PDF', desc: 'Document page' }
];

initFormatMatrix('img-format-matrix', imgFormats, 'webp', (fmt) => {
  selectedImgTarget = fmt;
  document.getElementById('img-target-hint').textContent = fmt.toUpperCase();
  document.getElementById('opt-img-quality').style.display = ['webp', 'jpg', 'avif'].includes(fmt) ? 'inline-flex' : 'none';
  document.getElementById('opt-img-ico').style.display = fmt === 'ico' ? 'inline-flex' : 'none';
});

bindDropzone('conv-dropzone', 'conv-file-input', (files) => {
  batchFiles = files;
  renderFileQueue('img-queue-list', batchFiles);
});

async function decodeAnyImageFile(file) {
  const lower = file.name.toLowerCase();
  let sourceBlob = file;
  if (lower.endsWith('.heic') || lower.endsWith('.heif')) {
    sourceBlob = await heic2any({ blob: file, toType: 'image/png' });
    if (Array.isArray(sourceBlob)) sourceBlob = sourceBlob[0];
  }
  const url = URL.createObjectURL(sourceBlob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
}

document.getElementById('btn-run-batch').addEventListener('click', async () => {
  if (batchFiles.length === 0) return;
  const quality = parseInt(document.getElementById('conv-quality-num').value, 10) / 100;
  const scale = parseFloat(document.getElementById('conv-scale-factor').value) || 1;
  const track = document.getElementById('img-progress-track');
  const fill = document.getElementById('img-progress-fill');
  track.style.display = 'block';
  fill.style.width = '0%';

  for (let i = 0; i < batchFiles.length; i++) {
    const file = batchFiles[i];
    updateQueueStatus('img-queue-list', i, 'PROCESSING', 'working');

    try {
      const img = await decodeAnyImageFile(file);
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');

      if (selectedImgTarget === 'jpg' || selectedImgTarget === 'bmp') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(img, 0, 0, w, h);

      const base = file.name.substring(0, file.name.lastIndexOf('.')) || 'image';

      if (selectedImgTarget === 'bmp') {
        downloadBlob(canvasToBmpBlob(c), `${base}.bmp`);
      } else if (selectedImgTarget === 'ico') {
        const icoSize = parseInt(document.getElementById('conv-ico-size').value, 10) || 64;
        const icoBlob = await canvasToIcoBlob(c, icoSize);
        downloadBlob(icoBlob, `${base}.ico`);
      } else if (selectedImgTarget === 'svg') {
        const pngData = c.toDataURL('image/png');
        const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><image href="${pngData}" width="${w}" height="${h}"/></svg>`;
        downloadBlob(new Blob([svgStr], { type: 'image/svg+xml' }), `${base}.svg`);
      } else if (selectedImgTarget === 'pdf') {
        const { PDFDocument } = PDFLib;
        const pdfDoc = await PDFDocument.create();
        const jpgUri = c.toDataURL('image/jpeg', 0.94);
        const bytes = await fetch(jpgUri).then(r => r.arrayBuffer());
        const embedded = await pdfDoc.embedJpg(bytes);
        const page = pdfDoc.addPage([w, h]);
        page.drawImage(embedded, { x: 0, y: 0, width: w, height: h });
        const pdfBytes = await pdfDoc.save();
        downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), `${base}.pdf`);
      } else {
        const mimeMap = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', avif: 'image/avif' };
        const mime = mimeMap[selectedImgTarget] || 'image/png';
        const blob = await new Promise(res => c.toBlob(res, mime, quality));
        downloadBlob(blob, `${base}.${selectedImgTarget}`);
      }

      updateQueueStatus('img-queue-list', i, 'DONE', 'done');
    } catch {
      updateQueueStatus('img-queue-list', i, 'ERROR');
    }

    fill.style.width = `${Math.round(((i + 1) / batchFiles.length) * 100)}%`;
  }
});

const canvas = new fabric.Canvas('fabric-stage', {
  backgroundColor: '#ffffff',
  preserveObjectStacking: true,
  fireRightClick: true,
  stopContextMenu: true
});

let clipboardObj = null;
const undoStack = [];
const redoStack = [];

function recordState() {
  undoStack.push(JSON.stringify(canvas));
  if (undoStack.length > 25) undoStack.shift();
  redoStack.length = 0;
}

canvas.on('object:added', () => recordState());
canvas.on('object:modified', () => recordState());
canvas.on('object:removed', () => recordState());

document.getElementById('btn-undo').addEventListener('click', () => {
  if (undoStack.length <= 1) return;
  redoStack.push(undoStack.pop());
  const prev = undoStack[undoStack.length - 1];
  canvas.loadFromJSON(prev, () => canvas.renderAll());
});

document.getElementById('btn-redo').addEventListener('click', () => {
  if (redoStack.length === 0) return;
  const next = redoStack.pop();
  undoStack.push(next);
  canvas.loadFromJSON(next, () => canvas.renderAll());
});

document.getElementById('btn-clear-canvas').addEventListener('click', () => {
  if (confirm('Clear entire artboard?')) {
    canvas.clear();
    canvas.backgroundColor = '#ffffff';
    canvas.renderAll();
  }
});

const studioUploadBtn = document.getElementById('btn-studio-upload');
const studioFileInput = document.getElementById('studio-file-input');
const studioGallery = document.getElementById('studio-gallery');

studioUploadBtn.addEventListener('click', () => studioFileInput.click());
studioFileInput.addEventListener('change', async () => {
  for (const file of Array.from(studioFileInput.files)) {
    let targetBlob = file;
    if (file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')) {
      targetBlob = await heic2any({ blob: file, toType: 'image/png' });
      if (Array.isArray(targetBlob)) targetBlob = targetBlob[0];
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUri = e.target.result;
      const card = document.createElement('div');
      card.className = 'media-thumb-item';
      const thumb = document.createElement('img');
      thumb.src = dataUri;
      card.appendChild(thumb);
      studioGallery.appendChild(card);

      card.addEventListener('click', () => {
        fabric.Image.fromURL(dataUri, (oImg) => {
          oImg.scaleToWidth(canvas.width * 0.5);
          oImg.set({ left: 80, top: 80 });
          canvas.add(oImg);
          canvas.setActiveObject(oImg);
          canvas.renderAll();
        }, { crossOrigin: 'anonymous' });
      });
    };
    reader.readAsDataURL(targetBlob);
  }
});

document.getElementById('btn-add-title').addEventListener('click', () => {
  const text = new fabric.IText('HEADING TEXT', {
    left: 100,
    top: 100,
    fontFamily: 'monospace',
    fill: '#111111',
    fontSize: 52,
    fontWeight: '700'
  });
  canvas.add(text);
  canvas.setActiveObject(text);
  canvas.renderAll();
});

document.getElementById('btn-add-para').addEventListener('click', () => {
  const text = new fabric.IText('Sample project body description text goes here.', {
    left: 100,
    top: 180,
    fontFamily: 'monospace',
    fill: '#333333',
    fontSize: 20
  });
  canvas.add(text);
  canvas.setActiveObject(text);
  canvas.renderAll();
});

document.getElementById('text-size').addEventListener('input', (e) => {
  const active = canvas.getActiveObject();
  if (active && active.type === 'i-text') {
    active.set('fontSize', parseInt(e.target.value, 10));
    canvas.renderAll();
  }
});

document.getElementById('text-color').addEventListener('input', (e) => {
  const active = canvas.getActiveObject();
  if (active && active.type === 'i-text') {
    active.set('fill', e.target.value);
    canvas.renderAll();
  }
});

document.getElementById('btn-shape-rect').addEventListener('click', () => {
  const rect = new fabric.Rect({
    left: 150,
    top: 150,
    fill: '#23272e',
    width: 200,
    height: 120,
    stroke: '#388bfd',
    strokeWidth: 2
  });
  canvas.add(rect);
  canvas.setActiveObject(rect);
  canvas.renderAll();
});

document.getElementById('btn-shape-circle').addEventListener('click', () => {
  const circle = new fabric.Circle({
    left: 200,
    top: 200,
    radius: 75,
    fill: '#14171c',
    stroke: '#ffffff',
    strokeWidth: 2
  });
  canvas.add(circle);
  canvas.setActiveObject(circle);
  canvas.renderAll();
});

const brushBtn = document.getElementById('btn-brush-mode');
brushBtn.addEventListener('click', () => {
  canvas.isDrawingMode = !canvas.isDrawingMode;
  brushBtn.textContent = canvas.isDrawingMode ? 'Toggle Brush: ON' : 'Toggle Brush: OFF';
  brushBtn.style.background = canvas.isDrawingMode ? 'var(--accent)' : 'var(--text)';
  if (canvas.isDrawingMode) {
    canvas.freeDrawingBrush.width = parseInt(document.getElementById('brush-size').value, 10) || 6;
    canvas.freeDrawingBrush.color = document.getElementById('brush-color').value;
  }
});

document.getElementById('brush-size').addEventListener('input', (e) => {
  if (canvas.freeDrawingBrush) canvas.freeDrawingBrush.width = parseInt(e.target.value, 10);
});
document.getElementById('brush-color').addEventListener('input', (e) => {
  if (canvas.freeDrawingBrush) canvas.freeDrawingBrush.color = e.target.value;
});

document.getElementById('btn-apply-filter').addEventListener('click', () => {
  const active = canvas.getActiveObject();
  if (active && active.type === 'image') {
    active.filters = [];
    const b = parseFloat(document.getElementById('filter-bright').value);
    const c = parseFloat(document.getElementById('filter-contrast').value);
    const p = parseInt(document.getElementById('filter-pixel-size').value, 10);

    if (b !== 0) active.filters.push(new fabric.Image.filters.Brightness({ brightness: b }));
    if (c !== 0) active.filters.push(new fabric.Image.filters.Contrast({ contrast: c }));
    if (p > 0) active.filters.push(new fabric.Image.filters.Pixelate({ blocksize: p }));

    active.applyFilters();
    canvas.renderAll();
  }
});

document.querySelectorAll('.dock-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.dock-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.drawer-view').forEach(v => v.style.display = 'none');
    btn.classList.add('active');
    const tabId = btn.getAttribute('data-tab');
    document.getElementById(`panel-${tabId}`).style.display = 'block';
  });
});

const stageWrapper = document.querySelector('.fabric-stage-wrapper');
const zoomRange = document.getElementById('studio-zoom');
const zoomVal = document.getElementById('zoom-val');

zoomRange.addEventListener('input', () => {
  const scale = parseInt(zoomRange.value, 10) / 100;
  zoomVal.textContent = `${zoomRange.value}%`;
  stageWrapper.style.transform = `scale(${scale})`;
  stageWrapper.style.transformOrigin = 'center center';
});
stageWrapper.style.transform = 'scale(0.65)';
stageWrapper.style.transformOrigin = 'center center';

document.getElementById('btn-resize-canvas').addEventListener('click', () => {
  const w = parseInt(document.getElementById('canvas-width').value, 10);
  const h = parseInt(document.getElementById('canvas-height').value, 10);
  canvas.setWidth(w);
  canvas.setHeight(h);
  canvas.renderAll();
});

const exportModal = document.getElementById('export-modal');
document.getElementById('btn-open-export').addEventListener('click', () => exportModal.classList.add('open'));
document.getElementById('btn-close-export').addEventListener('click', () => exportModal.classList.remove('open'));

document.getElementById('btn-confirm-export').addEventListener('click', async () => {
  const fmt = document.getElementById('export-mime').value;
  const title = document.getElementById('project-title').value.trim() || 'artwork';

  if (fmt === 'json') {
    const payload = JSON.stringify(canvas.toJSON(), null, 2);
    downloadBlob(new Blob([payload], { type: 'application/json' }), `${title}.json`);
    exportModal.classList.remove('open');
    return;
  }

  if (fmt === 'svg') {
    downloadBlob(new Blob([canvas.toSVG()], { type: 'image/svg+xml' }), `${title}.svg`);
    exportModal.classList.remove('open');
    return;
  }

  if (fmt === 'bmp') {
    downloadBlob(canvasToBmpBlob(canvas.lowerCanvasEl), `${title}.bmp`);
    exportModal.classList.remove('open');
    return;
  }

  if (fmt === 'ico') {
    const icoBlob = await canvasToIcoBlob(canvas.lowerCanvasEl, 64);
    downloadBlob(icoBlob, `${title}.ico`);
    exportModal.classList.remove('open');
    return;
  }

  if (fmt === 'pdf') {
    const { PDFDocument } = PDFLib;
    const doc = await PDFDocument.create();
    const dataUri = canvas.toDataURL({ format: 'jpeg', quality: 0.95 });
    const bytes = await fetch(dataUri).then(r => r.arrayBuffer());
    const img = await doc.embedJpg(bytes);
    const page = doc.addPage([canvas.width, canvas.height]);
    page.drawImage(img, { x: 0, y: 0, width: canvas.width, height: canvas.height });
    const pdfBytes = await doc.save();
    downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), `${title}.pdf`);
    exportModal.classList.remove('open');
    return;
  }

  const dataUri = canvas.toDataURL({ format: fmt === 'jpeg' ? 'jpeg' : 'png', quality: 0.92 });
  const blob = await fetch(dataUri).then(r => r.blob());
  const ext = fmt === 'jpeg' ? 'jpg' : fmt;
  downloadBlob(blob, `${title}.${ext}`);
  exportModal.classList.remove('open');
});

function copyObject() {
  const active = canvas.getActiveObject();
  if (active) active.clone((cloned) => { clipboardObj = cloned; });
}

function pasteObject() {
  if (!clipboardObj) return;
  clipboardObj.clone((cloned) => {
    canvas.discardActiveObject();
    cloned.set({ left: cloned.left + 24, top: cloned.top + 24, evented: true });
    if (cloned.type === 'activeSelection') {
      cloned.canvas = canvas;
      cloned.forEachObject(obj => canvas.add(obj));
      cloned.setCoords();
    } else {
      canvas.add(cloned);
    }
    clipboardObj.top += 24;
    clipboardObj.left += 24;
    canvas.setActiveObject(cloned);
    canvas.requestRenderAll();
  });
}

function deleteActiveObjects() {
  const actives = canvas.getActiveObjects();
  if (actives.length > 0) {
    canvas.discardActiveObject();
    actives.forEach(obj => canvas.remove(obj));
    canvas.requestRenderAll();
  }
}

window.setupEditorEnvironment({
  getItems: (e) => {
    const targetObj = canvas.findTarget(e, false);
    if (targetObj) {
      canvas.setActiveObject(targetObj);
      canvas.renderAll();
    }
    return [
      { label: 'Copy', shortcut: 'Ctrl+C', action: copyObject },
      { label: 'Paste', shortcut: 'Ctrl+V', action: pasteObject },
      { label: 'Duplicate', shortcut: 'Ctrl+D', action: () => { copyObject(); pasteObject(); } },
      { divider: true },
      { label: 'Bring Forward', shortcut: ']', action: () => { const a = canvas.getActiveObject(); if (a) { a.bringForward(); canvas.renderAll(); } } },
      { label: 'Send Backward', shortcut: '[', action: () => { const a = canvas.getActiveObject(); if (a) { a.sendBackwards(); canvas.renderAll(); } } },
      { divider: true },
      { label: 'Delete', shortcut: 'Del', danger: true, action: deleteActiveObjects }
    ];
  }
}, (e) => {
  const activeObj = canvas.getActiveObject();
  if (activeObj && activeObj.isEditing) return;

  if (e.ctrlKey || e.metaKey) {
    if (e.key.toLowerCase() === 'c') { e.preventDefault(); copyObject(); }
    if (e.key.toLowerCase() === 'v') { e.preventDefault(); pasteObject(); }
    if (e.key.toLowerCase() === 'd') { e.preventDefault(); copyObject(); pasteObject(); }
    if (e.key.toLowerCase() === 'a') {
      e.preventDefault();
      canvas.discardActiveObject();
      const sel = new fabric.ActiveSelection(canvas.getObjects(), { canvas: canvas });
      canvas.setActiveObject(sel);
      canvas.requestRenderAll();
    }
    return;
  }

  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    deleteActiveObjects();
    return;
  }

  if (e.key === ']') {
    if (activeObj) { activeObj.bringForward(); canvas.renderAll(); }
  } else if (e.key === '[') {
    if (activeObj) { activeObj.sendBackwards(); canvas.renderAll(); }
  }

  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && activeObj) {
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowUp') activeObj.top -= step;
    if (e.key === 'ArrowDown') activeObj.top += step;
    if (e.key === 'ArrowLeft') activeObj.left -= step;
    if (e.key === 'ArrowRight') activeObj.left += step;
    activeObj.setCoords();
    canvas.requestRenderAll();
  }
});

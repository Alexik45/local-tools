const root = document.documentElement;
const savedTheme = localStorage.getItem('theme') || 'dark';
root.setAttribute('data-theme', savedTheme);

let activeContextMenuDef = null;
let activeShortcutHandler = null;

window.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('theme-toggle');
  if (toggleBtn) {
    toggleBtn.textContent = savedTheme === 'dark' ? 'LIGHT' : 'DARK';
    toggleBtn.addEventListener('click', () => {
      const current = root.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
      toggleBtn.textContent = next === 'dark' ? 'LIGHT' : 'DARK';
    });
  }

  const discordBtn = document.getElementById('copy-discord-btn');
  if (discordBtn) {
    discordBtn.addEventListener('click', (e) => {
      e.preventDefault();
      navigator.clipboard.writeText('alex1k45').then(() => {
        const prev = discordBtn.textContent;
        discordBtn.textContent = 'COPIED';
        setTimeout(() => { discordBtn.textContent = prev; }, 1500);
      });
    });
  }

  const emailModal = document.getElementById('email-modal');
  const openEmailBtn = document.getElementById('open-email-modal');
  const closeModalBtn = document.getElementById('close-modal');
  const copyEmailBtn = document.getElementById('copy-email-btn');

  if (openEmailBtn && emailModal) {
    openEmailBtn.addEventListener('click', () => emailModal.classList.add('open'));
    closeModalBtn.addEventListener('click', () => emailModal.classList.remove('open'));
    emailModal.addEventListener('click', (e) => {
      if (e.target === emailModal) emailModal.classList.remove('open');
    });

    copyEmailBtn.addEventListener('click', () => {
      navigator.clipboard.writeText('contact.alexandr@proton.me').then(() => {
        const prev = copyEmailBtn.textContent;
        copyEmailBtn.textContent = 'COPIED';
        setTimeout(() => { copyEmailBtn.textContent = prev; }, 1500);
      });
    });
  }

  const modeBtns = document.querySelectorAll('.mode-btn');
  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      modeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.getAttribute('data-mode');
      const convView = document.getElementById('view-converter');
      const studioView = document.getElementById('view-studio');
      if (convView && studioView) {
        convView.style.display = mode === 'converter' ? 'block' : 'none';
        studioView.style.display = mode === 'studio' ? 'block' : 'none';
      }
      hideStudioContextMenu();
    });
  });

  initVault();
  initUniversalContextMenu();
});

window.initFormatMatrix = function(containerId, formats, defaultId, onSelect) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  formats.forEach(fmt => {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = `format-pill ${fmt.id === defaultId ? 'selected' : ''}`;
    pill.dataset.format = fmt.id;
    pill.innerHTML = `
      <div class="format-pill-ext">
        <span>${fmt.label}</span>
        <span class="format-pill-dot"></span>
      </div>
      <div class="format-pill-desc">${fmt.desc}</div>
    `;
    pill.addEventListener('click', () => {
      container.querySelectorAll('.format-pill').forEach(p => p.classList.remove('selected'));
      pill.classList.add('selected');
      if (onSelect) onSelect(fmt.id);
    });
    container.appendChild(pill);
  });

  if (onSelect) onSelect(defaultId);
};

window.bindDropzone = function(dropzoneId, inputId, onFiles) {
  const zone = document.getElementById(dropzoneId);
  const input = document.getElementById(inputId);
  if (!zone || !input) return;

  zone.addEventListener('click', () => input.click());
  ['dragenter', 'dragover'].forEach(ev => {
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach(ev => {
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
    });
  });
  zone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files.length > 0) onFiles(Array.from(e.dataTransfer.files));
  });
  input.addEventListener('change', () => {
    if (input.files.length > 0) onFiles(Array.from(input.files));
  });
};

window.renderFileQueue = function(listId, files) {
  const list = document.getElementById(listId);
  if (!list) return;
  list.innerHTML = '';
  files.forEach((file, idx) => {
    const ext = file.name.includes('.') ? file.name.split('.').pop().toUpperCase() : 'RAW';
    const sizeStr = file.size > 1048576
      ? `${(file.size / 1048576).toFixed(2)} MB`
      : `${(file.size / 1024).toFixed(1)} KB`;

    const row = document.createElement('div');
    row.className = 'queue-item';
    row.id = `${listId}-item-${idx}`;
    row.innerHTML = `
      <div class="queue-item-left">
        <span class="ext-badge">${ext}</span>
        <span class="queue-filename">${file.name}</span>
      </div>
      <div class="queue-meta">
        <span>${sizeStr}</span>
        <span class="queue-status" id="${listId}-status-${idx}">READY</span>
      </div>
    `;
    list.appendChild(row);
  });
};

window.updateQueueStatus = function(listId, idx, text, stateClass) {
  const el = document.getElementById(`${listId}-status-${idx}`);
  if (!el) return;
  el.textContent = text;
  el.className = `queue-status ${stateClass || ''}`;
};

window.canvasToBmpBlob = function(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, w, h).data;
  const rowSize = Math.floor((24 * w + 31) / 32) * 4;
  const pixelArraySize = rowSize * h;
  const fileSize = 54 + pixelArraySize;
  const buf = new ArrayBuffer(fileSize);
  const view = new DataView(buf);

  view.setUint8(0, 0x42);
  view.setUint8(1, 0x4D);
  view.setUint32(2, fileSize, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, w, true);
  view.setInt32(22, h, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, pixelArraySize, true);

  let pos = 54;
  for (let y = h - 1; y >= 0; y--) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      view.setUint8(pos++, imgData[i + 2]);
      view.setUint8(pos++, imgData[i + 1]);
      view.setUint8(pos++, imgData[i]);
    }
    while ((pos - 54) % rowSize !== 0) {
      view.setUint8(pos++, 0);
    }
  }
  return new Blob([buf], { type: 'image/bmp' });
};

window.canvasToIcoBlob = async function(sourceCanvas, size = 64) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  c.getContext('2d').drawImage(sourceCanvas, 0, 0, size, size);

  const pngBlob = await new Promise(r => c.toBlob(r, 'image/png'));
  const pngBuf = await pngBlob.arrayBuffer();
  const pngBytes = new Uint8Array(pngBuf);

  const icoBuf = new ArrayBuffer(22 + pngBytes.length);
  const view = new DataView(icoBuf);
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, 1, true);
  view.setUint8(6, size === 256 ? 0 : size);
  view.setUint8(7, size === 256 ? 0 : size);
  view.setUint8(8, 0);
  view.setUint8(9, 0);
  view.setUint16(10, 1, true);
  view.setUint16(12, 32, true);
  view.setUint32(14, pngBytes.length, true);
  view.setUint32(18, 22, true);

  new Uint8Array(icoBuf, 22).set(pngBytes);
  return new Blob([icoBuf], { type: 'image/x-icon' });
};

window.encodeAnimatedGif = function(frames, width, height, delayCs = 10) {
  const bytes = [];
  const writeStr = s => { for (let i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i)); };
  const writeU16 = v => { bytes.push(v & 0xff, (v >> 8) & 0xff); };

  writeStr('GIF89a');
  writeU16(width);
  writeU16(height);
  bytes.push(0xF7, 0x00, 0x00);

  for (let r = 0; r < 8; r++) {
    for (let g = 0; g < 8; g++) {
      for (let b = 0; b < 4; b++) {
        bytes.push(Math.round(r * 255 / 7), Math.round(g * 255 / 7), Math.round(b * 255 / 3));
      }
    }
  }

  writeStr('!\xFF\x0BNETSCAPE2.0\x03\x01\x00\x00\x00');

  for (const rgba of frames) {
    bytes.push(0x21, 0xF9, 0x04, 0x00);
    writeU16(delayCs);
    bytes.push(0x00, 0x00);

    bytes.push(0x2C);
    writeU16(0);
    writeU16(0);
    writeU16(width);
    writeU16(height);
    bytes.push(0x00);

    const minCodeSize = 8;
    bytes.push(minCodeSize);
    const clearCode = 256;
    const endCode = 257;

    let bitBuf = 0;
    let bitCount = 0;
    const subBlock = [];

    const flushSubBlock = () => {
      if (subBlock.length > 0) {
        bytes.push(subBlock.length, ...subBlock);
        subBlock.length = 0;
      }
    };

    const pushBits = (code, size) => {
      bitBuf |= code << bitCount;
      bitCount += size;
      while (bitCount >= 8) {
        subBlock.push(bitBuf & 0xff);
        if (subBlock.length === 255) flushSubBlock();
        bitBuf >>= 8;
        bitCount -= 8;
      }
    };

    pushBits(clearCode, 9);
    let codeSize = 9;
    let nextCode = 258;

    for (let i = 0; i < rgba.length; i += 4) {
      const r = rgba[i] >> 5;
      const g = rgba[i + 1] >> 5;
      const b = rgba[i + 2] >> 6;
      const idx = (r << 5) | (g << 2) | b;
      pushBits(idx, codeSize);
      nextCode++;
      if (nextCode === (1 << codeSize) && codeSize < 12) {
        codeSize++;
      } else if (nextCode >= 4090) {
        pushBits(clearCode, codeSize);
        codeSize = 9;
        nextCode = 258;
      }
    }

    pushBits(endCode, codeSize);
    if (bitCount > 0) subBlock.push(bitBuf & 0xff);
    flushSubBlock();
    bytes.push(0x00);
  }

  bytes.push(0x3B);
  return new Blob([new Uint8Array(bytes)], { type: 'image/gif' });
};

function initUniversalContextMenu() {
  let ctxBox = document.getElementById('studio-context-menu');
  if (!ctxBox) {
    ctxBox = document.createElement('div');
    ctxBox.id = 'studio-context-menu';
    ctxBox.className = 'studio-ctx-menu';
    document.body.appendChild(ctxBox);
  }

  window.addEventListener('contextmenu', (e) => {
    const studioView = document.getElementById('view-studio');
    if (!studioView || studioView.style.display === 'none') {
      hideStudioContextMenu();
      return;
    }

    const isInsideWorkspace = e.target.closest(
      '.canvas-viewport-area, #video-workbench, #audio-studio-panel, .data-table-wrap, #matrix-table, #studio-pdf-ctrls, #studio-hex-panel'
    );

    if (!isInsideWorkspace || !activeContextMenuDef) {
      hideStudioContextMenu();
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const menuItems = activeContextMenuDef.getItems(e);
    if (!menuItems || menuItems.length === 0) {
      hideStudioContextMenu();
      return;
    }

    renderStudioContextMenu(ctxBox, menuItems, e.clientX, e.clientY);
  }, true);

  window.addEventListener('click', (e) => {
    if (!ctxBox.contains(e.target)) hideStudioContextMenu();
  });

  window.addEventListener('scroll', () => hideStudioContextMenu(), true);

  window.addEventListener('keydown', (e) => {
    const studioView = document.getElementById('view-studio');
    if (!studioView || studioView.style.display === 'none') return;

    const tag = document.activeElement ? document.activeElement.tagName : '';
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || (document.activeElement && document.activeElement.isContentEditable)) {
      return;
    }

    if (e.key === 'Escape') hideStudioContextMenu();
    if (activeShortcutHandler) activeShortcutHandler(e);
  });
}

function renderStudioContextMenu(ctxBox, items, x, y) {
  ctxBox.innerHTML = '';
  items.forEach(item => {
    if (item.divider) {
      const d = document.createElement('div');
      d.className = 'ctx-divider';
      ctxBox.appendChild(d);
      return;
    }
    const entry = document.createElement('div');
    entry.className = `ctx-entry ${item.danger ? 'ctx-danger' : ''}`;
    entry.innerHTML = `${item.label} ${item.shortcut ? `<span>${item.shortcut}</span>` : ''}`;
    entry.addEventListener('click', (e) => {
      e.stopPropagation();
      hideStudioContextMenu();
      item.action();
    });
    ctxBox.appendChild(entry);
  });

  ctxBox.classList.add('visible');
  const w = ctxBox.offsetWidth || 180;
  const h = ctxBox.offsetHeight || 200;
  const posX = (x + w > window.innerWidth) ? (window.innerWidth - w - 8) : x;
  const posY = (y + h > window.innerHeight) ? (window.innerHeight - h - 8) : y;
  ctxBox.style.left = `${posX}px`;
  ctxBox.style.top = `${posY}px`;
}

function hideStudioContextMenu() {
  const ctxBox = document.getElementById('studio-context-menu');
  if (ctxBox) ctxBox.classList.remove('visible');
}

window.setupEditorEnvironment = function(menuDef, shortcutFn) {
  activeContextMenuDef = menuDef;
  activeShortcutHandler = shortcutFn;
};

function initVault() {
  const vaultToggle = document.getElementById('vault-toggle');
  const vaultHistory = document.getElementById('vault-history');
  const vaultList = document.getElementById('vault-list');
  const clearBtn = document.getElementById('clear-vault');

  if (!vaultToggle) return;

  const isEnabled = localStorage.getItem('vault_enabled') === 'true';

  function updateUi(active) {
    vaultToggle.textContent = active ? 'Disable Storage' : 'Enable Storage';
    vaultHistory.style.display = active ? 'block' : 'none';
    if (active) renderHistory();
  }

  function renderHistory() {
    const raw = localStorage.getItem('vault_history');
    const items = raw ? JSON.parse(raw) : [];
    if (items.length === 0) {
      vaultList.innerHTML = '<div style="color: var(--muted); font-size: 12px;">No export activity recorded yet.</div>';
      return;
    }
    vaultList.innerHTML = items.map(item => `
      <div style="display:flex; justify-content:space-between; padding:6px 10px; background:var(--code-bg); border:1px solid var(--border); font-size:12px; margin-bottom:4px;">
        <span>${item.name}</span>
        <span style="color: var(--muted);">${item.date}</span>
      </div>
    `).join('');
  }

  vaultToggle.addEventListener('click', () => {
    const next = localStorage.getItem('vault_enabled') !== 'true';
    localStorage.setItem('vault_enabled', next ? 'true' : 'false');
    updateUi(next);
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      localStorage.removeItem('vault_history');
      renderHistory();
    });
  }

  updateUi(isEnabled);
}

function logToVault(filename) {
  if (localStorage.getItem('vault_enabled') !== 'true') return;
  const raw = localStorage.getItem('vault_history');
  const items = raw ? JSON.parse(raw) : [];
  const dateStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  items.unshift({ name: filename, date: dateStr });
  if (items.length > 10) items.pop();
  localStorage.setItem('vault_history', JSON.stringify(items));
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  logToVault(filename);
}

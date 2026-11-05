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

    if (e.key === 'Escape') {
      hideStudioContextMenu();
    }

    if (activeShortcutHandler) {
      activeShortcutHandler(e);
    }
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

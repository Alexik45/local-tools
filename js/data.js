const convIn = document.getElementById('conv-input');
const convOut = document.getElementById('conv-output');

document.getElementById('btn-b64-enc').addEventListener('click', () => {
  try { convOut.value = btoa(unescape(encodeURIComponent(convIn.value))); }
  catch { convOut.value = 'Error: Invalid sequence for Base64.'; }
});

document.getElementById('btn-b64-dec').addEventListener('click', () => {
  try { convOut.value = decodeURIComponent(escape(atob(convIn.value.trim()))); }
  catch { convOut.value = 'Error: Malformed Base64 string.'; }
});

document.getElementById('btn-sha256').addEventListener('click', async () => {
  const bytes = new TextEncoder().encode(convIn.value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  convOut.value = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
});

document.getElementById('btn-json-csv').addEventListener('click', () => {
  try {
    const data = JSON.parse(convIn.value);
    const headers = Object.keys(data[0]);
    const rows = data.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','));
    convOut.value = [headers.join(','), ...rows].join('\n');
  } catch (err) { convOut.value = `Conversion Error: ${err.message}`; }
});

document.getElementById('btn-csv-json').addEventListener('click', () => {
  try {
    const lines = convIn.value.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const result = lines.slice(1).map(l => {
      const vals = l.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const obj = {};
      headers.forEach((h, i) => obj[h] = vals[i] ?? '');
      return obj;
    });
    convOut.value = JSON.stringify(result, null, 2);
  } catch (err) { convOut.value = `Parse Error: ${err.message}`; }
});

const table = document.getElementById('matrix-table');
let lastRightClickedCell = null;

table.addEventListener('contextmenu', (e) => {
  lastRightClickedCell = e.target.closest('td, th');
});

function insertRow() {
  const cols = table.querySelectorAll('thead th').length;
  const tr = document.createElement('tr');
  for (let i = 0; i < cols; i++) {
    const td = document.createElement('td');
    td.contentEditable = "true";
    td.style.border = '1px solid var(--border)';
    td.style.padding = '8px';
    td.textContent = '...';
    tr.appendChild(td);
  }
  table.querySelector('tbody').appendChild(tr);
}

function insertCol() {
  const headTr = table.querySelector('thead tr');
  const th = document.createElement('th');
  th.style.border = '1px solid var(--border)';
  th.style.padding = '8px';
  th.style.background = 'var(--surface-alt)';
  th.textContent = `col_${headTr.children.length + 1}`;
  headTr.appendChild(th);

  table.querySelectorAll('tbody tr').forEach(row => {
    const td = document.createElement('td');
    td.contentEditable = "true";
    td.style.border = '1px solid var(--border)';
    td.style.padding = '8px';
    td.textContent = '...';
    row.appendChild(td);
  });
}

document.getElementById('btn-add-row').addEventListener('click', insertRow);
document.getElementById('btn-add-col').addEventListener('click', insertCol);

function serialize() {
  const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
  const rows = [];
  table.querySelectorAll('tbody tr').forEach(tr => {
    const row = {};
    Array.from(tr.querySelectorAll('td')).forEach((td, i) => {
      row[headers[i]] = td.textContent.trim();
    });
    rows.push(row);
  });
  return { headers, rows };
}

function exportCsv() {
  const { headers, rows } = serialize();
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${r[h]}"`).join(','))].join('\n');
  downloadBlob(new Blob([csv], { type: 'text/csv' }), 'matrix_dump.csv');
}

function exportJson() {
  const { rows } = serialize();
  downloadBlob(new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }), 'matrix_dump.json');
}

document.getElementById('btn-export-csv').addEventListener('click', exportCsv);
document.getElementById('btn-export-json').addEventListener('click', exportJson);

window.setupEditorEnvironment({
  getItems: () => [
    { label: 'Insert Row Below', shortcut: 'Alt+R', action: insertRow },
    { label: 'Insert Column Right', shortcut: 'Alt+C', action: insertCol },
    { divider: true },
    { label: 'Clear Selected Cell', shortcut: 'Del', action: () => { if (lastRightClickedCell) lastRightClickedCell.textContent = ''; } },
    { label: 'Delete Row', danger: true, action: () => { if (lastRightClickedCell && lastRightClickedCell.tagName === 'TD') lastRightClickedCell.parentElement.remove(); } },
    { divider: true },
    { label: 'Export as CSV', action: exportCsv },
    { label: 'Export as JSON', action: exportJson }
  ]
}, (e) => {
  if (e.altKey && e.key.toLowerCase() === 'r') {
    e.preventDefault();
    insertRow();
  } else if (e.altKey && e.key.toLowerCase() === 'c') {
    e.preventDefault();
    insertCol();
  }
});

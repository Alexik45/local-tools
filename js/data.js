const convIn = document.getElementById('conv-input');
const convOut = document.getElementById('conv-output');
let selectedDataTarget = 'json';

const dataFormats = [
  { id: 'json', label: 'JSON', desc: 'Pretty object tree' },
  { id: 'csv', label: 'CSV', desc: 'Comma delimited' },
  { id: 'tsv', label: 'TSV', desc: 'Tab delimited' },
  { id: 'xml', label: 'XML', desc: 'Tag markup tree' },
  { id: 'yaml', label: 'YAML', desc: 'Config syntax' },
  { id: 'ini', label: 'INI / ENV', desc: 'Key=Value pairs' },
  { id: 'sql', label: 'SQL', desc: 'INSERT statements' },
  { id: 'html', label: 'HTML', desc: 'Data table markup' },
  { id: 'base64', label: 'BASE64', desc: 'UTF-8 encoded' },
  { id: 'hex', label: 'HEX', desc: 'Byte hex stream' }
];

initFormatMatrix('data-format-matrix', dataFormats, 'json', (fmt) => {
  selectedDataTarget = fmt;
  document.getElementById('data-target-hint').textContent = fmt.toUpperCase();
});

bindDropzone('data-dropzone', 'data-file-input', (files) => {
  const reader = new FileReader();
  reader.onload = (e) => { convIn.value = e.target.result; };
  reader.readAsText(files[0]);
});

function parseUniversalInput(raw) {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('Empty input buffer');

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed);
  }

  if (trimmed.startsWith('<')) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(trimmed, 'text/xml');
    const items = Array.from(doc.documentElement.children);
    return items.map(node => {
      const obj = {};
      Array.from(node.children).forEach(child => { obj[child.tagName] = child.textContent; });
      return Object.keys(obj).length ? obj : { value: node.textContent };
    });
  }

  if (trimmed.includes('\t') && trimmed.includes('\n')) {
    const lines = trimmed.split('\n').filter(Boolean);
    const headers = lines[0].split('\t').map(h => h.trim());
    return lines.slice(1).map(line => {
      const vals = line.split('\t');
      const obj = {};
      headers.forEach((h, i) => obj[h] = (vals[i] ?? '').trim());
      return obj;
    });
  }

  if (trimmed.includes(',') && trimmed.includes('\n')) {
    const lines = trimmed.split('\n').filter(Boolean);
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    return lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const obj = {};
      headers.forEach((h, i) => obj[h] = vals[i] ?? '');
      return obj;
    });
  }

  if (trimmed.includes('=') && !trimmed.includes(':')) {
    const obj = {};
    trimmed.split('\n').forEach(line => {
      const l = line.trim();
      if (!l || l.startsWith('#') || l.startsWith('[')) return;
      const idx = l.indexOf('=');
      if (idx > 0) obj[l.slice(0, idx).trim()] = l.slice(idx + 1).trim();
    });
    return obj;
  }

  return jsyaml.load(trimmed);
}

function serializeUniversalOutput(data, fmt) {
  const rows = Array.isArray(data) ? data : [data];

  if (fmt === 'json') return JSON.stringify(data, null, 2);
  if (fmt === 'yaml') return jsyaml.dump(data);

  if (fmt === 'csv' || fmt === 'tsv') {
    const sep = fmt === 'csv' ? ',' : '\t';
    const headers = Object.keys(rows[0] || {});
    const body = rows.map(r => headers.map(h => fmt === 'csv' ? JSON.stringify(r[h] ?? '') : (r[h] ?? '')).join(sep));
    return [headers.join(sep), ...body].join('\n');
  }

  if (fmt === 'xml') {
    const items = rows.map(r => {
      const fields = Object.entries(r).map(([k, v]) => `    <${k}>${String(v)}</${k}>`).join('\n');
      return `  <record>\n${fields}\n  </record>`;
    }).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<root>\n${items}\n</root>`;
  }

  if (fmt === 'ini') {
    return rows.map((r, i) => {
      const head = rows.length > 1 ? `[section_${i + 1}]\n` : '';
      return head + Object.entries(r).map(([k, v]) => `${k}=${v}`).join('\n');
    }).join('\n\n');
  }

  if (fmt === 'sql') {
    const headers = Object.keys(rows[0] || {});
    return rows.map(r => {
      const vals = headers.map(h => typeof r[h] === 'number' ? r[h] : `'${String(r[h] ?? '').replace(/'/g, "''")}'`).join(', ');
      return `INSERT INTO dataset (${headers.join(', ')}) VALUES (${vals});`;
    }).join('\n');
  }

  if (fmt === 'html') {
    const headers = Object.keys(rows[0] || {});
    const ths = headers.map(h => `      <th>${h}</th>`).join('\n');
    const trs = rows.map(r => `    <tr>\n${headers.map(h => `      <td>${r[h] ?? ''}</td>`).join('\n')}\n    </tr>`).join('\n');
    return `<table>\n  <thead>\n    <tr>\n${ths}\n    </tr>\n  </thead>\n  <tbody>\n${trs}\n  </tbody>\n</table>`;
  }

  return String(data);
}

document.getElementById('btn-run-data-conv').addEventListener('click', () => {
  try {
    if (selectedDataTarget === 'base64') {
      convOut.value = btoa(unescape(encodeURIComponent(convIn.value)));
      return;
    }
    if (selectedDataTarget === 'hex') {
      const bytes = new TextEncoder().encode(convIn.value);
      convOut.value = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
      return;
    }
    const parsed = parseUniversalInput(convIn.value);
    convOut.value = serializeUniversalOutput(parsed, selectedDataTarget);
  } catch (err) {
    convOut.value = `Conversion Error: ${err.message}`;
  }
});

document.getElementById('btn-download-data').addEventListener('click', () => {
  if (!convOut.value) return;
  const extMap = { json: 'json', csv: 'csv', tsv: 'tsv', xml: 'xml', yaml: 'yaml', ini: 'ini', sql: 'sql', html: 'html', base64: 'txt', hex: 'txt' };
  const ext = extMap[selectedDataTarget] || 'txt';
  downloadBlob(new Blob([convOut.value], { type: 'text/plain;charset=utf-8' }), `converted_data.${ext}`);
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

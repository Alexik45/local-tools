const zipDrop = document.getElementById('conv-zip-drop');
const zipInput = document.getElementById('conv-zip-input');
let filesToZip = [];

zipDrop.addEventListener('click', () => zipInput.click());
zipInput.addEventListener('change', () => {
  filesToZip = Array.from(zipInput.files);
  zipDrop.querySelector('p').textContent = `${filesToZip.length} file(s) ready to compress.`;
});

document.getElementById('btn-build-zip').addEventListener('click', async () => {
  if (filesToZip.length === 0) return alert('Select files first.');
  const zip = new JSZip();
  const name = document.getElementById('archive-filename').value.trim() || 'archive';
  filesToZip.forEach(f => zip.file(f.name, f));
  const content = await zip.generateAsync({ type: 'blob' });
  downloadBlob(content, `${name}.zip`);
});

const hexDrop = document.getElementById('studio-hex-drop');
const hexInput = document.getElementById('studio-hex-input');
const hexPanel = document.getElementById('studio-hex-panel');
const hexMeta = document.getElementById('hex-meta-info');
const hexDump = document.getElementById('hex-stream-dump');
let activeBinaryFile = null;

hexDrop.addEventListener('click', () => hexInput.click());
hexInput.addEventListener('change', () => {
  if (hexInput.files.length > 0) {
    activeBinaryFile = hexInput.files[0];
    hexMeta.textContent = `Name: ${activeBinaryFile.name} | Size: ${(activeBinaryFile.size / 1024).toFixed(2)} KB | Type: ${activeBinaryFile.type || 'binary/raw'}`;
    hexPanel.style.display = 'block';

    const reader = new FileReader();
    reader.onload = (e) => {
      const bytes = new Uint8Array(e.target.result);
      const lines = [];
      for (let i = 0; i < bytes.length; i += 16) {
        const slice = bytes.slice(i, i + 16);
        const hex = Array.from(slice).map(b => b.toString(16).padStart(2, '0')).join(' ');
        const ascii = Array.from(slice).map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.').join('');
        lines.push(`${i.toString(16).padStart(6, '0')}  ${hex.padEnd(48, ' ')} |${ascii}|`);
      }
      hexDump.textContent = lines.join('\n');
    };
    reader.readAsArrayBuffer(activeBinaryFile.slice(0, 4096));
  }
});

async function computeSha256() {
  if (!activeBinaryFile) return;
  const buf = await activeBinaryFile.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  hexMeta.innerHTML += `<br><strong>SHA-256:</strong> ${hex}`;
}

function splitChunks() {
  if (!activeBinaryFile) return;
  const kb = parseInt(document.getElementById('chunk-size').value, 10) || 256;
  const chunkSize = kb * 1024;
  let offset = 0;
  let part = 1;

  while (offset < activeBinaryFile.size) {
    const chunk = activeBinaryFile.slice(offset, offset + chunkSize);
    downloadBlob(chunk, `${activeBinaryFile.name}.part${part}`);
    offset += chunkSize;
    part++;
  }
}

document.getElementById('btn-calc-sha').addEventListener('click', computeSha256);
document.getElementById('btn-split-file').addEventListener('click', splitChunks);

window.setupEditorEnvironment({
  getItems: () => [
    { label: 'Compute SHA-256 Digest', shortcut: 'H', action: computeSha256 },
    { label: 'Split File into Parts', shortcut: 'S', action: splitChunks },
    { divider: true },
    { label: 'Copy Hex Stream', action: () => navigator.clipboard.writeText(hexDump.textContent) }
  ]
}, (e) => {
  if (e.key.toLowerCase() === 'h') computeSha256();
  if (e.key.toLowerCase() === 's') splitChunks();
});

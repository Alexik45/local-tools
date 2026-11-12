let filesToProcess = [];
let selectedFileTarget = 'zip';

const fileFormats = [
  { id: 'zip', label: 'ZIP', desc: 'Deflate archive' },
  { id: 'tar', label: 'TAR', desc: 'POSIX tar bundle' },
  { id: 'gz', label: 'GZIP', desc: 'Native gzip stream' },
  { id: 'unzip', label: 'EXTRACT', desc: 'Unpack ZIP / GZ' },
  { id: 'base64', label: 'BASE64', desc: 'Data URI text' },
  { id: 'hex', label: 'HEX DUMP', desc: 'Full hex text' }
];

initFormatMatrix('file-format-matrix', fileFormats, 'zip', (fmt) => {
  selectedFileTarget = fmt;
  document.getElementById('file-target-hint').textContent = fmt.toUpperCase();
  document.getElementById('opt-file-archive').style.display = ['zip', 'tar'].includes(fmt) ? 'flex' : 'none';
});

bindDropzone('conv-zip-drop', 'conv-zip-input', (files) => {
  filesToProcess = files;
  renderFileQueue('file-queue-list', filesToProcess);
});

async function buildPosixTar(files) {
  const blocks = [];
  for (const file of files) {
    const data = new Uint8Array(await file.arrayBuffer());
    const header = new Uint8Array(512);
    const enc = new TextEncoder();

    header.set(enc.encode(file.name.slice(0, 99)), 0);
    header.set(enc.encode('0000644\0'), 100);
    header.set(enc.encode('0000000\0'), 108);
    header.set(enc.encode('0000000\0'), 116);
    header.set(enc.encode(`${data.length.toString(8).padStart(11, '0')}\0`), 124);
    header.set(enc.encode(`${Math.floor(Date.now() / 1000).toString(8).padStart(11, '0')}\0`), 136);
    header.set(enc.encode('        '), 148);
    header[156] = 48;
    header.set(enc.encode('ustar\0'), 257);
    header.set(enc.encode('00'), 263);

    let sum = 0;
    for (let i = 0; i < 512; i++) sum += header[i];
    header.set(enc.encode(`${sum.toString(8).padStart(6, '0')}\0 `), 148);

    blocks.push(header, data);
    const rem = data.length % 512;
    if (rem > 0) blocks.push(new Uint8Array(512 - rem));
  }
  blocks.push(new Uint8Array(1024));
  return new Blob(blocks, { type: 'application/x-tar' });
}

document.getElementById('btn-build-zip').addEventListener('click', async () => {
  if (filesToProcess.length === 0) return;
  const track = document.getElementById('file-progress-track');
  const fill = document.getElementById('file-progress-fill');
  track.style.display = 'block';
  fill.style.width = '0%';

  const archiveName = document.getElementById('archive-filename').value.trim() || 'bundle';

  if (selectedFileTarget === 'zip') {
    const zip = new JSZip();
    filesToProcess.forEach((f, idx) => {
      zip.file(f.name, f);
      updateQueueStatus('file-queue-list', idx, 'PACKED', 'done');
    });
    const content = await zip.generateAsync({ type: 'blob' });
    downloadBlob(content, `${archiveName}.zip`);
    fill.style.width = '100%';
    return;
  }

  if (selectedFileTarget === 'tar') {
    const tarBlob = await buildPosixTar(filesToProcess);
    filesToProcess.forEach((_, idx) => updateQueueStatus('file-queue-list', idx, 'PACKED', 'done'));
    downloadBlob(tarBlob, `${archiveName}.tar`);
    fill.style.width = '100%';
    return;
  }

  for (let i = 0; i < filesToProcess.length; i++) {
    const f = filesToProcess[i];
    updateQueueStatus('file-queue-list', i, 'PROCESSING', 'working');

    try {
      if (selectedFileTarget === 'gz') {
        const cs = new CompressionStream('gzip');
        const compressedStream = f.stream().pipeThrough(cs);
        const blob = await new Response(compressedStream).blob();
        downloadBlob(blob, `${f.name}.gz`);
      } else if (selectedFileTarget === 'unzip') {
        if (f.name.toLowerCase().endsWith('.gz')) {
          const ds = new DecompressionStream('gzip');
          const outStream = f.stream().pipeThrough(ds);
          const blob = await new Response(outStream).blob();
          downloadBlob(blob, f.name.replace(/\.gz$/i, '') || 'extracted_file');
        } else {
          const zip = await JSZip.loadAsync(f);
          for (const [entryName, entry] of Object.entries(zip.files)) {
            if (!entry.dir) {
              const blob = await entry.async('blob');
              downloadBlob(blob, entryName.split('/').pop());
            }
          }
        }
      } else if (selectedFileTarget === 'base64') {
        const b64 = await new Promise(res => {
          const r = new FileReader();
          r.onload = () => res(r.result);
          r.readAsDataURL(f);
        });
        downloadBlob(new Blob([b64], { type: 'text/plain' }), `${f.name}.b64.txt`);
      } else if (selectedFileTarget === 'hex') {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
        downloadBlob(new Blob([hex], { type: 'text/plain' }), `${f.name}.hex.txt`);
      }
      updateQueueStatus('file-queue-list', i, 'DONE', 'done');
    } catch {
      updateQueueStatus('file-queue-list', i, 'ERROR');
    }
    fill.style.width = `${Math.round(((i + 1) / filesToProcess.length) * 100)}%`;
  }
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

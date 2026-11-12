let rawAudioFiles = [];
let selectedAudTarget = 'mp3';

const audFormats = [
  { id: 'mp3', label: 'MP3', desc: 'MPEG Layer III' },
  { id: 'wav', label: 'WAV', desc: '16-bit PCM raw' },
  { id: 'wav32', label: 'WAV 32', desc: '32-bit float PCM' },
  { id: 'aiff', label: 'AIFF', desc: 'Apple uncompressed' },
  { id: 'ogg', label: 'OGG', desc: 'Opus web stream' }
];

initFormatMatrix('aud-format-matrix', audFormats, 'mp3', (fmt) => {
  selectedAudTarget = fmt;
  document.getElementById('aud-target-hint').textContent = fmt.toUpperCase();
  document.getElementById('opt-aud-bitrate').style.display = fmt === 'mp3' ? 'inline-flex' : 'none';
});

bindDropzone('conv-audio-drop', 'conv-audio-input', (files) => {
  rawAudioFiles = files;
  renderFileQueue('aud-queue-list', rawAudioFiles);
});

function buildWavBlob(decoded, isMono, isFloat32) {
  const numCh = isMono ? 1 : decoded.numberOfChannels;
  const bytesPerSample = isFloat32 ? 4 : 2;
  const len = decoded.length * numCh * bytesPerSample;
  const buf = new ArrayBuffer(44 + len);
  const view = new DataView(buf);
  const writeStr = (off, str) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + len, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, isFloat32 ? 3 : 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, decoded.sampleRate, true);
  view.setUint32(28, decoded.sampleRate * numCh * bytesPerSample, true);
  view.setUint16(32, numCh * bytesPerSample, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeStr(36, 'data');
  view.setUint32(40, len, true);

  let offset = 44;
  for (let i = 0; i < decoded.length; i++) {
    if (isMono && decoded.numberOfChannels > 1) {
      let s = (decoded.getChannelData(0)[i] + decoded.getChannelData(1)[i]) / 2;
      s = Math.max(-1, Math.min(1, s));
      if (isFloat32) { view.setFloat32(offset, s, true); offset += 4; }
      else { view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true); offset += 2; }
    } else {
      for (let ch = 0; ch < numCh; ch++) {
        let s = Math.max(-1, Math.min(1, decoded.getChannelData(ch)[i]));
        if (isFloat32) { view.setFloat32(offset, s, true); offset += 4; }
        else { view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true); offset += 2; }
      }
    }
  }
  return new Blob([view], { type: 'audio/wav' });
}

function buildAiffBlob(decoded, isMono) {
  const numCh = isMono ? 1 : decoded.numberOfChannels;
  const numFrames = decoded.length;
  const dataBytes = numFrames * numCh * 2;
  const totalSize = 54 + dataBytes;
  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);
  const writeStr = (off, str) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };

  writeStr(0, 'FORM');
  view.setUint32(4, totalSize - 8, false);
  writeStr(8, 'AIFF');
  writeStr(12, 'COMM');
  view.setUint32(16, 18, false);
  view.setInt16(20, numCh, false);
  view.setUint32(22, numFrames, false);
  view.setInt16(26, 16, false);

  const rate = decoded.sampleRate;
  view.setUint16(28, 0x400E, false);
  view.setUint32(30, rate << 16, false);
  view.setUint32(34, 0, false);

  writeStr(38, 'SSND');
  view.setUint32(42, dataBytes + 8, false);
  view.setUint32(46, 0, false);
  view.setUint32(50, 0, false);

  let offset = 54;
  for (let i = 0; i < numFrames; i++) {
    if (isMono && decoded.numberOfChannels > 1) {
      let s = (decoded.getChannelData(0)[i] + decoded.getChannelData(1)[i]) / 2;
      s = Math.max(-1, Math.min(1, s));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, false);
      offset += 2;
    } else {
      for (let ch = 0; ch < numCh; ch++) {
        let s = Math.max(-1, Math.min(1, decoded.getChannelData(ch)[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, false);
        offset += 2;
      }
    }
  }
  return new Blob([buf], { type: 'audio/aiff' });
}

function buildMp3Blob(decoded, isMono, bitrate) {
  const numCh = isMono ? 1 : Math.min(2, decoded.numberOfChannels);
  const mp3enc = new lamejs.Mp3Encoder(numCh, decoded.sampleRate, bitrate);
  const left = decoded.getChannelData(0);
  const right = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : left;
  const blockSize = 1152;
  const chunks = [];

  for (let i = 0; i < left.length; i += blockSize) {
    const lBuf = new Int16Array(blockSize);
    const rBuf = new Int16Array(blockSize);
    for (let j = 0; j < blockSize && (i + j) < left.length; j++) {
      if (isMono && decoded.numberOfChannels > 1) {
        const m = (left[i + j] + right[i + j]) / 2;
        lBuf[j] = Math.max(-1, Math.min(1, m)) * 32767;
      } else {
        lBuf[j] = Math.max(-1, Math.min(1, left[i + j])) * 32767;
        rBuf[j] = Math.max(-1, Math.min(1, right[i + j])) * 32767;
      }
    }
    const out = numCh === 1 ? mp3enc.encodeBuffer(lBuf) : mp3enc.encodeBuffer(lBuf, rBuf);
    if (out.length > 0) chunks.push(out);
  }
  const end = mp3enc.flush();
  if (end.length > 0) chunks.push(end);
  return new Blob(chunks, { type: 'audio/mp3' });
}

document.getElementById('btn-batch-wav').addEventListener('click', async () => {
  if (rawAudioFiles.length === 0) return;
  const isMono = document.getElementById('conv-channel-mode').value === 'mono';
  const bitrate = parseInt(document.getElementById('aud-mp3-bitrate').value, 10) || 192;
  const track = document.getElementById('aud-progress-track');
  const fill = document.getElementById('aud-progress-fill');
  track.style.display = 'block';
  fill.style.width = '0%';

  for (let i = 0; i < rawAudioFiles.length; i++) {
    const f = rawAudioFiles[i];
    const base = f.name.substring(0, f.name.lastIndexOf('.')) || 'audio';
    updateQueueStatus('aud-queue-list', i, 'PROCESSING', 'working');

    try {
      const buf = await f.arrayBuffer();
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const decoded = await audioCtx.decodeAudioData(buf);

      if (selectedAudTarget === 'mp3') {
        downloadBlob(buildMp3Blob(decoded, isMono, bitrate), `${base}.mp3`);
      } else if (selectedAudTarget === 'wav') {
        downloadBlob(buildWavBlob(decoded, isMono, false), `${base}.wav`);
      } else if (selectedAudTarget === 'wav32') {
        downloadBlob(buildWavBlob(decoded, isMono, true), `${base}_32bit.wav`);
      } else if (selectedAudTarget === 'aiff') {
        downloadBlob(buildAiffBlob(decoded, isMono), `${base}.aiff`);
      } else if (selectedAudTarget === 'ogg') {
        const dest = audioCtx.createMediaStreamDestination();
        const src = audioCtx.createBufferSource();
        src.buffer = decoded;
        src.connect(dest);
        const rec = new MediaRecorder(dest.stream);
        const chunks = [];
        rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
        rec.start();
        src.start();
        await new Promise(r => { src.onended = r; });
        rec.stop();
        await new Promise(r => { rec.onstop = r; });
        downloadBlob(new Blob(chunks, { type: 'audio/ogg' }), `${base}.ogg`);
      }
      updateQueueStatus('aud-queue-list', i, 'DONE', 'done');
    } catch {
      updateQueueStatus('aud-queue-list', i, 'ERROR');
    }
    fill.style.width = `${Math.round(((i + 1) / rawAudioFiles.length) * 100)}%`;
  }
});

const studioDrop = document.getElementById('studio-audio-drop');
const studioInput = document.getElementById('studio-audio-input');
const studioPanel = document.getElementById('audio-studio-panel');
const waveCanvas = document.getElementById('waveform-canvas');
const waveCtx = waveCanvas.getContext('2d');
let activeAudioBuffer = null;
let currentTrackName = 'audio';

studioDrop.addEventListener('click', () => studioInput.click());
studioInput.addEventListener('change', () => {
  if (studioInput.files.length > 0) {
    const file = studioInput.files[0];
    currentTrackName = file.name.substring(0, file.name.lastIndexOf('.')) || 'audio';
    const reader = new FileReader();
    reader.onload = async (e) => {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      activeAudioBuffer = await audioCtx.decodeAudioData(e.target.result);
      document.getElementById('audio-end').value = activeAudioBuffer.duration.toFixed(2);
      renderWaveform(activeAudioBuffer);
      studioPanel.style.display = 'block';
    };
    reader.readAsArrayBuffer(file);
  }
});

function renderWaveform(buf) {
  const data = buf.getChannelData(0);
  const step = Math.ceil(data.length / waveCanvas.width);
  const amp = waveCanvas.height / 2;
  waveCtx.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
  waveCtx.fillStyle = '#388bfd';

  for (let i = 0; i < waveCanvas.width; i++) {
    let min = 1.0;
    let max = -1.0;
    for (let j = 0; j < step; j++) {
      const datum = data[(i * step) + j];
      if (datum < min) min = datum;
      if (datum > max) max = datum;
    }
    waveCtx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
  }
}

function executeDspExport() {
  if (!activeAudioBuffer) return;
  const startS = parseFloat(document.getElementById('audio-start').value) || 0;
  const endS = parseFloat(document.getElementById('audio-end').value) || activeAudioBuffer.duration;
  const gainDb = parseFloat(document.getElementById('audio-gain').value) || 0;
  const isNorm = document.getElementById('chk-norm').checked;
  const isRev = document.getElementById('chk-rev').checked;
  const isPhase = document.getElementById('chk-phase').checked;

  const rate = activeAudioBuffer.sampleRate;
  const startIdx = Math.floor(startS * rate);
  const endIdx = Math.min(activeAudioBuffer.length, Math.floor(endS * rate));
  const sliceLen = Math.max(0, endIdx - startIdx);
  const gainLin = Math.pow(10, gainDb / 20);
  const chs = activeAudioBuffer.numberOfChannels;
  const channels = [];

  for (let ch = 0; ch < chs; ch++) {
    const raw = activeAudioBuffer.getChannelData(ch);
    const sub = new Float32Array(sliceLen);
    for (let i = 0; i < sliceLen; i++) sub[i] = raw[startIdx + i];
    if (isRev) sub.reverse();
    if (isPhase) { for (let i = 0; i < sliceLen; i++) sub[i] = -sub[i]; }
    channels.push(sub);
  }

  let peak = 0;
  if (isNorm) {
    for (let ch = 0; ch < chs; ch++) {
      for (let i = 0; i < sliceLen; i++) {
        const abs = Math.abs(channels[ch][i]);
        if (abs > peak) peak = abs;
      }
    }
  }
  const normGain = (peak > 0 && isNorm) ? (1.0 / peak) : 1.0;
  const totalGain = gainLin * normGain;

  const dataSize = sliceLen * chs * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const writeStr = (off, str) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, chs, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * chs * 2, true);
  view.setUint16(32, chs * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < sliceLen; i++) {
    for (let ch = 0; ch < chs; ch++) {
      let s = channels[ch][i] * totalGain;
      s = Math.max(-1, Math.min(1, s));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }
  }

  downloadBlob(new Blob([view], { type: 'audio/wav' }), `${currentTrackName}_dsp_master.wav`);
}

document.getElementById('btn-render-master').addEventListener('click', executeDspExport);

window.setupEditorEnvironment({
  getItems: () => [
    { label: 'Peak Normalize (Toggle)', shortcut: 'N', action: () => { const el = document.getElementById('chk-norm'); el.checked = !el.checked; } },
    { label: 'Reverse Playback', shortcut: 'R', action: () => { const el = document.getElementById('chk-rev'); el.checked = !el.checked; } },
    { label: 'Phase Invert (180°)', shortcut: 'P', action: () => { const el = document.getElementById('chk-phase'); el.checked = !el.checked; } },
    { divider: true },
    { label: 'Export 16-Bit WAV Master', shortcut: 'Ctrl+S', action: executeDspExport }
  ]
}, (e) => {
  if (e.ctrlKey && e.key.toLowerCase() === 's') {
    e.preventDefault();
    executeDspExport();
  } else if (e.key.toLowerCase() === 'n') {
    const el = document.getElementById('chk-norm'); el.checked = !el.checked;
  } else if (e.key.toLowerCase() === 'r') {
    const el = document.getElementById('chk-rev'); el.checked = !el.checked;
  }
});

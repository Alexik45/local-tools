const convDrop = document.getElementById('conv-audio-drop');
const convInput = document.getElementById('conv-audio-input');
let rawAudioFiles = [];

convDrop.addEventListener('click', () => convInput.click());
convInput.addEventListener('change', () => {
  rawAudioFiles = Array.from(convInput.files);
  convDrop.querySelector('p').textContent = `${rawAudioFiles.length} file(s) loaded.`;
});

document.getElementById('btn-batch-wav').addEventListener('click', async () => {
  if (rawAudioFiles.length === 0) return;
  const isMono = document.getElementById('conv-channel-mode').value === 'mono';

  for (const f of rawAudioFiles) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const decoded = await audioCtx.decodeAudioData(e.target.result);
      const numCh = isMono ? 1 : decoded.numberOfChannels;
      const len = decoded.length * numCh * 2;
      const buf = new ArrayBuffer(44 + len);
      const view = new DataView(buf);

      function writeStr(offset, str) {
        for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
      }

      writeStr(0, 'RIFF');
      view.setUint32(4, 36 + len, true);
      writeStr(8, 'WAVE');
      writeStr(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, numCh, true);
      view.setUint32(24, decoded.sampleRate, true);
      view.setUint32(28, decoded.sampleRate * numCh * 2, true);
      view.setUint16(32, numCh * 2, true);
      view.setUint16(34, 16, true);
      writeStr(36, 'data');
      view.setUint32(40, len, true);

      let offset = 44;
      for (let i = 0; i < decoded.length; i++) {
        if (isMono && decoded.numberOfChannels > 1) {
          let s = (decoded.getChannelData(0)[i] + decoded.getChannelData(1)[i]) / 2;
          s = Math.max(-1, Math.min(1, s));
          view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
          offset += 2;
        } else {
          for (let ch = 0; ch < numCh; ch++) {
            let s = Math.max(-1, Math.min(1, decoded.getChannelData(ch)[i]));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
            offset += 2;
          }
        }
      }

      downloadBlob(new Blob([view], { type: 'audio/wav' }), `${f.name}_transcoded.wav`);
    };
    reader.readAsArrayBuffer(f);
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

  function writeStr(offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

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

let videoBatchFiles = [];
let selectedVidTarget = 'webm';

const vidFormats = [
  { id: 'webm', label: 'WEBM', desc: 'VP8/VP9 stream' },
  { id: 'mp4', label: 'MP4', desc: 'H.264/AAC container' },
  { id: 'gif', label: 'GIF', desc: 'Animated loop' },
  { id: 'mp3', label: 'MP3', desc: 'Extract audio MP3' },
  { id: 'wav', label: 'WAV', desc: 'Extract PCM audio' },
  { id: 'png', label: 'PNG', desc: 'Poster frame snap' }
];

initFormatMatrix('vid-format-matrix', vidFormats, 'webm', (fmt) => {
  selectedVidTarget = fmt;
  document.getElementById('vid-target-hint').textContent = fmt.toUpperCase();
  document.getElementById('opt-vid-gif').style.display = fmt === 'gif' ? 'inline-flex' : 'none';
  document.getElementById('opt-vid-res').style.display = ['webm', 'mp4', 'png'].includes(fmt) ? 'inline-flex' : 'none';
});

bindDropzone('conv-video-drop', 'conv-video-input', (files) => {
  videoBatchFiles = files;
  renderFileQueue('vid-queue-list', videoBatchFiles);
});

async function extractWavFromMedia(file) {
  const buf = await file.arrayBuffer();
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const decoded = await audioCtx.decodeAudioData(buf);
  const length = decoded.length * decoded.numberOfChannels * 2;
  const out = new ArrayBuffer(44 + length);
  const view = new DataView(out);
  const writeStr = (off, str) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, decoded.numberOfChannels, true);
  view.setUint32(24, decoded.sampleRate, true);
  view.setUint32(28, decoded.sampleRate * decoded.numberOfChannels * 2, true);
  view.setUint16(32, decoded.numberOfChannels * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, length, true);

  let offset = 44;
  for (let i = 0; i < decoded.length; i++) {
    for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
      let s = Math.max(-1, Math.min(1, decoded.getChannelData(ch)[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }
  }
  return new Blob([view], { type: 'audio/wav' });
}

async function extractMp3FromMedia(file) {
  const buf = await file.arrayBuffer();
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const decoded = await audioCtx.decodeAudioData(buf);
  const chs = Math.min(2, decoded.numberOfChannels);
  const mp3enc = new lamejs.Mp3Encoder(chs, decoded.sampleRate, 192);
  const left = decoded.getChannelData(0);
  const right = chs > 1 ? decoded.getChannelData(1) : left;
  const blockSize = 1152;
  const mp3Data = [];

  for (let i = 0; i < left.length; i += blockSize) {
    const lChunk = new Int16Array(blockSize);
    const rChunk = new Int16Array(blockSize);
    for (let j = 0; j < blockSize && (i + j) < left.length; j++) {
      lChunk[j] = Math.max(-1, Math.min(1, left[i + j])) * 32767;
      rChunk[j] = Math.max(-1, Math.min(1, right[i + j])) * 32767;
    }
    const enc = chs === 1 ? mp3enc.encodeBuffer(lChunk) : mp3enc.encodeBuffer(lChunk, rChunk);
    if (enc.length > 0) mp3Data.push(enc);
  }
  const flush = mp3enc.flush();
  if (flush.length > 0) mp3Data.push(flush);
  return new Blob(mp3Data, { type: 'audio/mp3' });
}

async function convertVideoToAnimatedGif(file, targetW, fps) {
  const url = URL.createObjectURL(file);
  const vid = document.createElement('video');
  vid.src = url;
  vid.muted = true;
  await new Promise(r => { vid.onloadedmetadata = r; });

  const ratio = vid.videoWidth / vid.videoHeight;
  const w = targetW;
  const h = Math.round(w / ratio);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');

  const maxDur = Math.min(vid.duration || 5, 12);
  const totalFrames = Math.max(2, Math.floor(maxDur * fps));
  const frames = [];

  for (let i = 0; i < totalFrames; i++) {
    vid.currentTime = (i / fps);
    await new Promise(r => { vid.onseeked = r; });
    ctx.drawImage(vid, 0, 0, w, h);
    frames.push(ctx.getImageData(0, 0, w, h).data);
  }

  URL.revokeObjectURL(url);
  return encodeAnimatedGif(frames, w, h, Math.round(100 / fps));
}

async function transcodeVideoStream(file, targetExt, scale) {
  const url = URL.createObjectURL(file);
  const vid = document.createElement('video');
  vid.src = url;
  vid.muted = false;
  vid.volume = 0.001;
  await new Promise(r => { vid.onloadedmetadata = r; });

  const c = document.createElement('canvas');
  c.width = Math.round(vid.videoWidth * scale);
  c.height = Math.round(vid.videoHeight * scale);
  const ctx = c.getContext('2d');

  const stream = c.captureStream(30);
  const mime = (targetExt === 'mp4' && MediaRecorder.isTypeSupported('video/mp4'))
    ? 'video/mp4'
    : 'video/webm';

  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 3500000 });
  const chunks = [];
  rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

  rec.start();
  vid.play();

  const drawLoop = () => {
    if (!vid.paused && !vid.ended) {
      ctx.drawImage(vid, 0, 0, c.width, c.height);
      requestAnimationFrame(drawLoop);
    }
  };
  drawLoop();

  await new Promise(r => { vid.onended = r; });
  rec.stop();
  await new Promise(r => { rec.onstop = r; });
  URL.revokeObjectURL(url);
  return new Blob(chunks, { type: mime });
}

document.getElementById('btn-run-vid-batch').addEventListener('click', async () => {
  if (videoBatchFiles.length === 0) return;
  const track = document.getElementById('vid-progress-track');
  const fill = document.getElementById('vid-progress-fill');
  track.style.display = 'block';
  fill.style.width = '0%';

  for (let i = 0; i < videoBatchFiles.length; i++) {
    const file = videoBatchFiles[i];
    const base = file.name.substring(0, file.name.lastIndexOf('.')) || 'video';
    updateQueueStatus('vid-queue-list', i, 'PROCESSING', 'working');

    try {
      if (selectedVidTarget === 'wav') {
        const blob = await extractWavFromMedia(file);
        downloadBlob(blob, `${base}.wav`);
      } else if (selectedVidTarget === 'mp3') {
        const blob = await extractMp3FromMedia(file);
        downloadBlob(blob, `${base}.mp3`);
      } else if (selectedVidTarget === 'gif') {
        const w = parseInt(document.getElementById('vid-gif-width').value, 10) || 320;
        const fps = parseInt(document.getElementById('vid-gif-fps').value, 10) || 8;
        const blob = await convertVideoToAnimatedGif(file, w, fps);
        downloadBlob(blob, `${base}.gif`);
      } else if (selectedVidTarget === 'png') {
        const url = URL.createObjectURL(file);
        const vid = document.createElement('video');
        vid.src = url;
        await new Promise(r => { vid.onloadeddata = r; });
        const c = document.createElement('canvas');
        c.width = vid.videoWidth;
        c.height = vid.videoHeight;
        c.getContext('2d').drawImage(vid, 0, 0);
        const blob = await new Promise(r => c.toBlob(r, 'image/png'));
        URL.revokeObjectURL(url);
        downloadBlob(blob, `${base}_poster.png`);
      } else {
        const scale = parseFloat(document.getElementById('vid-scale').value) || 1;
        const blob = await transcodeVideoStream(file, selectedVidTarget, scale);
        downloadBlob(blob, `${base}.${selectedVidTarget}`);
      }
      updateQueueStatus('vid-queue-list', i, 'DONE', 'done');
    } catch {
      updateQueueStatus('vid-queue-list', i, 'ERROR');
    }
    fill.style.width = `${Math.round(((i + 1) / videoBatchFiles.length) * 100)}%`;
  }
});

let mediaRec = null;
let recChunks = [];
document.getElementById('btn-record-screen').addEventListener('click', async () => {
  const btn = document.getElementById('btn-record-screen');
  if (mediaRec && mediaRec.state === 'recording') {
    mediaRec.stop();
    btn.textContent = 'Record Screen (WebM)';
    return;
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  recChunks = [];
  mediaRec = new MediaRecorder(stream, { mimeType: 'video/webm' });
  mediaRec.ondataavailable = e => { if (e.data.size > 0) recChunks.push(e.data); };
  mediaRec.onstop = () => {
    downloadBlob(new Blob(recChunks, { type: 'video/webm' }), `screen_capture_${Date.now()}.webm`);
    stream.getTracks().forEach(t => t.stop());
  };
  mediaRec.start();
  btn.textContent = 'Stop Screen Recording';
});

const studioDrop = document.getElementById('studio-video-drop');
const studioInput = document.getElementById('studio-video-input');
const workbench = document.getElementById('video-workbench');
const video = document.getElementById('player-video');

studioDrop.addEventListener('click', () => studioInput.click());
studioInput.addEventListener('change', () => {
  if (studioInput.files.length > 0) {
    const file = studioInput.files[0];
    video.src = URL.createObjectURL(file);
    workbench.style.display = 'block';
  }
});

document.getElementById('btn-step-prev').addEventListener('click', () => {
  video.currentTime = Math.max(0, video.currentTime - 1 / 30);
});

document.getElementById('btn-step-next').addEventListener('click', () => {
  video.currentTime = Math.min(video.duration, video.currentTime + 1 / 30);
});

document.getElementById('btn-test-loop').addEventListener('click', () => {
  const start = parseFloat(document.getElementById('v-trim-start').value) || 0;
  const end = parseFloat(document.getElementById('v-trim-end').value) || video.duration;
  video.currentTime = start;
  video.play();
  const loopChecker = () => {
    if (video.currentTime >= end) video.currentTime = start;
  };
  video.removeEventListener('timeupdate', video._loop);
  video._loop = loopChecker;
  video.addEventListener('timeupdate', loopChecker);
});

function snapFrame(mime, ext) {
  if (!video.videoWidth) return;
  const c = document.createElement('canvas');
  c.width = video.videoWidth;
  c.height = video.videoHeight;
  c.getContext('2d').drawImage(video, 0, 0);
  c.toBlob(blob => {
    downloadBlob(blob, `frame_${video.currentTime.toFixed(2)}s.${ext}`);
  }, mime, 0.95);
}

document.getElementById('btn-snap-png').addEventListener('click', () => snapFrame('image/png', 'png'));
document.getElementById('btn-snap-webp').addEventListener('click', () => snapFrame('image/webp', 'webp'));
document.getElementById('btn-snap-jpg').addEventListener('click', () => snapFrame('image/jpeg', 'jpg'));

window.setupEditorEnvironment({
  getItems: () => [
    { label: video.paused ? 'Play Video' : 'Pause Video', shortcut: 'Space', action: () => { video.paused ? video.play() : video.pause(); } },
    { label: 'Set Trim Start Here', shortcut: 'I', action: () => { document.getElementById('v-trim-start').value = video.currentTime.toFixed(2); } },
    { label: 'Set Trim End Here', shortcut: 'O', action: () => { document.getElementById('v-trim-end').value = video.currentTime.toFixed(2); } },
    { divider: true },
    { label: 'Capture Frame (PNG)', shortcut: 'S', action: () => snapFrame('image/png', 'png') },
    { label: 'Step -1 Frame', shortcut: 'Left', action: () => { video.currentTime = Math.max(0, video.currentTime - 1 / 30); } },
    { label: 'Step +1 Frame', shortcut: 'Right', action: () => { video.currentTime = Math.min(video.duration, video.currentTime + 1 / 30); } }
  ]
}, (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    video.paused ? video.play() : video.pause();
  } else if (e.key.toLowerCase() === 'i') {
    document.getElementById('v-trim-start').value = video.currentTime.toFixed(2);
  } else if (e.key.toLowerCase() === 'o') {
    document.getElementById('v-trim-end').value = video.currentTime.toFixed(2);
  } else if (e.key.toLowerCase() === 's') {
    snapFrame('image/png', 'png');
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    video.currentTime = Math.max(0, video.currentTime - 1 / 30);
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    video.currentTime = Math.min(video.duration, video.currentTime + 1 / 30);
  }
});

const convDrop = document.getElementById('conv-video-drop');
const convInput = document.getElementById('conv-video-input');
const convStatus = document.getElementById('conv-video-status');
let loadedVideoFile = null;

convDrop.addEventListener('click', () => convInput.click());
convInput.addEventListener('change', () => {
  if (convInput.files.length > 0) {
    loadedVideoFile = convInput.files[0];
    convStatus.textContent = `File ready: ${loadedVideoFile.name}`;
  }
});

document.getElementById('btn-extract-wav').addEventListener('click', async () => {
  if (!loadedVideoFile) return alert('Select video file first.');
  convStatus.textContent = 'Decoding audio channels from video container...';

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const decoded = await audioCtx.decodeAudioData(e.target.result);
      const length = decoded.length * decoded.numberOfChannels * 2;
      const buf = new ArrayBuffer(44 + length);
      const view = new DataView(buf);

      function writeStr(offset, str) {
        for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
      }

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

      downloadBlob(new Blob([view], { type: 'audio/wav' }), `${loadedVideoFile.name}_soundtrack.wav`);
      convStatus.textContent = 'Audio extracted cleanly.';
    } catch {
      convStatus.textContent = 'Failed to extract audio track.';
    }
  };
  reader.readAsArrayBuffer(loadedVideoFile);
});

let mediaRec = null;
let recChunks = [];
document.getElementById('btn-record-screen').addEventListener('click', async () => {
  const btn = document.getElementById('btn-record-screen');
  if (mediaRec && mediaRec.state === 'recording') {
    mediaRec.stop();
    btn.textContent = 'Record Screen to WebM';
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
  video.currentTime = Math.max(0, video.currentTime - 1/30);
});

document.getElementById('btn-step-next').addEventListener('click', () => {
  video.currentTime = Math.min(video.duration, video.currentTime + 1/30);
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
    { label: 'Step -1 Frame', shortcut: '←', action: () => { video.currentTime = Math.max(0, video.currentTime - 1/30); } },
    { label: 'Step +1 Frame', shortcut: '→', action: () => { video.currentTime = Math.min(video.duration, video.currentTime + 1/30); } }
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
    video.currentTime = Math.max(0, video.currentTime - 1/30);
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    video.currentTime = Math.min(video.duration, video.currentTime + 1/30);
  }
});

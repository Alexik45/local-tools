# tools://local — Client-Side Utilities & Studio Suite

A privacy-focused, zero-telemetry suite of web-based media processors, development utilities, and in-browser editors. All operations run **100% client-side** inside browser RAM using native Web APIs, WebAssembly, and hardware-accelerated canvases. No cloud sync, no tracking cookies, and no file size paywalls.

Live Demo: [alexik45.github.io/local-tools](https://alexik45.github.io/local-tools/)

---

## Architecture & Privacy Model

Most conventional file utilities upload user payloads to remote backend servers for processing. `tools://local` operates entirely on the client:

* **Zero Network Egress:** Uploaded media, documents, and data buffers never leave your machine.
* **Ephemeral Memory:** Files reside in volatile browser memory (`Blob`, `ArrayBuffer`, canvas contexts) and are wiped on tab refresh.
* **Local Session Vault:** Optional offline history tracker using `localStorage`.

---

## Tooling Modules

### 1. Image Studio & Transcoder (`images.html`)
* **Fast Converter:** Batch transcoding across PNG, JPG, and WebP with configurable quantization parameters.
* **Advanced Studio (Canva-style Suite):**
  * Hardware-accelerated canvas layer engine powered by Fabric.js.
  * Direct numeric dimension overrides (width/height pixel scaling).
  * Text formatting, typography scaling, color pickers, and vector shapes.
  * Real-time image grading: brightness, contrast, pixelation, and filters.
  * Export options: High-res PNG, JPG, WebP, vector SVG, compiled single-page PDF, and raw JSON layout templates.
  * Isolated context menus (Right-Click) and hotkey mappings (`Ctrl+C`, `Ctrl+V`, `Ctrl+D`, `Del`, Layer brackets `[` and `]`).

### 2. Video Studio & Diagnostics (`videos.html`)
* **Fast Extractor:** Direct audio extraction from MP4/WebM containers into uncompressed 16-bit WAV tracks.
* **Screen Recorder:** In-browser screen and window capture exporting to native WebM video.
* **Workbench:** Frame-by-frame scrubbing (1/30s precision steps), selection range looping, and lossless frame snapshots.

### 3. Audio DSP Studio (`audio.html`)
* **Fast Transcoder:** Multi-file stereo downmixing and format normalization to 16-bit PCM WAV.
* **Waveform Workbench:** Visual amplitude rendering across samples, millisecond trimming, digital 0dBFS peak normalization, gain scaling, and phase polarity inversion.

### 4. Data Matrix & Cryptography (`data.html`)
* **Format Parsers:** Bidirectional JSON-to-CSV and CSV-to-JSON converters.
* **Crypto Engine:** Hardware-accelerated SHA-256 and SHA-512 cryptographic digests via Web Crypto API.
* **Matrix Studio:** Editable table spreadsheet with dynamic rows/columns and instant structured export.

### 5. PDF Studio (`pdf.html`)
* **Fast Compiler:** In-memory batch compilation of multiple image formats into a single PDF.
* **Document Suite:** Client-side document merging via PDF-Lib, custom page range extraction, and 45-degree watermark text stamping.

### 6. Files & Binary Inspector (`files.html`)
* **ZIP Packager:** Multi-file archiving and compression running in browser RAM via JSZip.
* **Hex Stream Dump:** Byte-level hexadecimal viewer with memory offset mapping and binary chunk splitting.

---

## Technology Stack

* **Core:** Semantic HTML5, CSS Grid / Flexbox, Vanilla ES6+ JavaScript
* **Graphics & Canvases:** HTML5 `<canvas>`, Fabric.js (Layer & Object Engine)
* **Document Processing:** PDF-Lib (PDF generation, manipulation, and stamping)
* **Compression & Formats:** JSZip (In-memory ZIP streaming)
* **Audio Processing:** Web Audio API (`AudioContext`, `decodeAudioData`, PCM byte manipulation)
* **Security & Hashes:** Web Crypto API (`crypto.subtle`)

---

## Local Development & Deployment

This project consists entirely of static assets and requires no compilation step or runtime server.

1. Clone repository:
   ```bash
   git clone [https://github.com/Alexik45/local-tools.git](https://github.com/Alexik45/local-tools.git)
   cd local-tools

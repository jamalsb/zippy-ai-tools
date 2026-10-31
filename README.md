# ⚡ Zippy AI Tools

Three browser-based creative tools in one static site — **no build step, no framework, no dependencies, no signup.**

| Tool | What it does |
|---|---|
| 🎨 **Thumbnail Studio** | Layer-based 1280×720 editor. Text, boxes, circles, lines, colour layers. Drag to position, undo/redo, autosave, PNG export at 1× or 2×. |
| 🖼️ **AI Image Creator** | Prompt → image. Aspect ratio (1:1 / 16:9 / 9:16), style presets, loading state, download. Real generation with your own API key; **demo mode** without one. |
| 🎬 **AI Video Generator & Editor** | Script → storyboard → editable timeline. Add images or colour cards, reorder, set per-scene duration, caption overlays, live preview, and export a real **MP4** (H.264 where available) with a live progress bar and cancel button. |

Live: **https://zippy-ai-tools.vercel.app**

---

## Screenshots

> Drop images into `docs/` and reference them here.

| Home | Thumbnail Studio |
|---|---|
| `docs/home.png` | `docs/thumbnail.png` |

| AI Image Creator | AI Video Studio |
|---|---|
| `docs/image.png` | `docs/video.png` |

---

## Video export format

Export produces an **MP4** by default — the file lands as `zippy-ai-video-<timestamp>.mp4`.

Encoding happens entirely in the browser. The tool picks the best path your browser supports, in this order:

| Tier | Path | Codec in the MP4 | Notes |
|---|---|---|---|
| 1 | **WebCodecs + `src/mp4.js`** | **H.264** (`avc1` + `avcC`) | Ideal. Chrome, Edge and Safari 16.4+ expose an H.264 encoder. |
| 2 | **WebCodecs + `src/mp4.js`** | **VP9** (`vp09` + `vpcC`) | Used when the browser has WebCodecs but no H.264 encoder — Firefox is the common case. Still a standard MP4; plays in Chrome, Edge, Firefox and Safari 17+. |
| 3 | **MediaRecorder** | — (WebM, not MP4) | Last resort, only when WebCodecs is missing entirely. The file is `.webm` and the UI says so plainly. |

**No server, no upload, no ffmpeg, no CDN.** The MP4 container is written by `src/mp4.js` — about 190 lines of plain JavaScript that emit the ISO-BMFF boxes (`ftyp`, `moov`, `mdat`) directly. One video track, constant frame duration, `faststart` (the `moov` index lands before the media data so the file starts playing before it has fully downloaded).

Export is **not real-time** on tiers 1–2: every frame is rendered and encoded as fast as the CPU allows, so a 20-second timeline typically exports in a few seconds. The status line reports file size, duration, resolution, frame rate, elapsed time, and which codec path was used.

### Export progress

Long timelines take a while, so the export panel shows a live progress bar instead of going quiet:

- **Percentage** — frames encoded so far ÷ total frames, driving both the bar width and the button label (`⏳ Encoding… 45%`).
- **ETA** — the average time per frame measured so far, multiplied by the frames still to go (`~12s left`). It settles within the first batch and gets more accurate as the run continues.
- **Frame counter** — the raw `230/417 frames` figure under the bar, so you can sanity-check the estimate yourself.
- **Done state** — the bar turns green at 100% and shows the finished file size and duration (`Done · 4.33 MB · 13.9s`), then clears itself after a moment. The status line stays with the full details.
- **Cancel** — a `✕ Cancel` button sits beside the bar. It stops the job immediately, releases the encoder, hides the bar, and downloads nothing; your timeline is untouched and you can export again straight away. The button disappears once the file is written, because there is nothing left to cancel.

Tier 3 is different: MediaRecorder records in real time, so there are no frames to count. That path reports progress as elapsed recording time against the timeline duration (`Recording… 52% · 2.1s / 4.0s`) on the same bar, and the Cancel button works there too — it stops the recorder without downloading a partial file.

If you need guaranteed H.264, export from Chrome or Edge. H.264 output is also the safest choice for Premiere, Final Cut, and older Android devices.

---

## Run locally

No install, no build. Any static server works:

```bash
git clone https://github.com/jamalsb/zippy-ai-tools.git
cd zippy-ai-tools
python3 -m http.server 8000
# open http://localhost:8000
```

Opening `index.html` directly with `file://` also works, but a local server is recommended so `localStorage` and canvas exports behave consistently.

### Deploy

The repo is a plain static site. On Vercel: import the repo, framework preset **Other**, no build command, output directory `.` — done.

---

## Where to put your API key

Click the **⚙️** button in the top bar (or the *Settings* link on the home page).

| Field | Purpose |
|---|---|
| **Image generation key** | Sent as `Authorization: Bearer <key>` to the image API. |
| **Image API base URL** | Defaults to `https://api.openai.com/v1`. Point it at any OpenAI-compatible `/images/generations` endpoint. |
| **Video generation key** | Optional, reserved for a future hosted video model. The video tool works fully offline today. |

**Keys are stored only in your browser's `localStorage`** under the `zippy.key.*` namespace. They are never committed to this repo, never bundled into the build, and never sent anywhere except the API endpoint you configure. Clearing them is one click in the same dialog.

> ⚠️ Because keys live in `localStorage`, anyone with access to your browser profile can read them. Use a scoped, revocable key — not a production master key.

### Demo mode

With no key set, **AI Image Creator** renders a deterministic placeholder graphic (gradient, blobs, grid, your prompt as a caption) so the entire UI — loading state, result panel, download — is testable end to end. The result is clearly labelled `DEMO MODE` in the image itself.

**AI Video Studio** needs no key at all: it composes frames on a canvas, encodes them with WebCodecs, and muxes a real MP4 locally.

---

## Project structure

```
zippy-ai-tools/
├── index.html            # shell: nav, three views, settings modal
├── src/
│   ├── styles.css        # all styling (CSS custom properties)
│   ├── core.js           # shared helpers: uid, clamp, toast, storage, wrapText
│   ├── mp4.js            # MP4 (ISO-BMFF) muxer — ftyp/moov/mdat, no dependencies
│   ├── thumbnail.js      # Thumbnail Studio
│   ├── image-creator.js  # AI Image Creator
│   ├── video-studio.js   # AI Video Generator & Editor
│   └── app.js            # hash router + settings modal + boot
└── README.md
```

Routing is hash-based (`#/home`, `#/thumbnail`, `#/image`, `#/video`), so every view is directly linkable and the back button works. Each tool initialises lazily the first time its view is opened.

---

## Browser support

| Feature | Requirement |
|---|---|
| Thumbnail Studio | Any modern browser |
| AI Image Creator (demo) | Any modern browser |
| AI Image Creator (real) | Any browser that can `fetch` your chosen API |
| Video export — MP4 (H.264) | `VideoEncoder` with H.264 — Chrome, Edge, Safari 16.4+ |
| Video export — MP4 (VP9) | `VideoEncoder` without H.264 — Firefox |
| Video export — WebM fallback | `MediaRecorder` + `canvas.captureStream`, when WebCodecs is absent |

Export requires a secure context (`https://` or `localhost`) because WebCodecs is only exposed there. Serving the folder over plain `http://` on a remote host drops you to the WebM fallback.

---

## Known limitations

- Video export has no audio track yet.
- Browsers without an H.264 encoder get VP9-in-MP4 rather than H.264 — still a valid MP4, but some legacy editors prefer H.264.
- Very old browsers without WebCodecs fall back to a WebM file.
- `localStorage` caps around 5 MB, so very large background images may not persist across reloads.
- The image API call assumes an OpenAI-compatible `/images/generations` shape (`b64_json` or `url` in `data[0]`).

---

## License

MIT

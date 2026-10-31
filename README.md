# ⚡ Zippy AI Tools

Three browser-based creative tools in one static site — **no build step, no framework, no dependencies, no signup.**

| Tool | What it does |
|---|---|
| 🎨 **Thumbnail Studio** | Layer-based 1280×720 editor. Text, boxes, circles, lines, colour layers. Drag to position, undo/redo, autosave, PNG export at 1× or 2×. |
| 🖼️ **AI Image Creator** | Prompt → image. Aspect ratio (1:1 / 16:9 / 9:16), style presets, loading state, download. Real generation with your own API key; **demo mode** without one. |
| 🎬 **AI Video Generator & Editor** | Script → storyboard → editable timeline. Add images or colour cards, reorder, set per-scene duration, caption overlays, live preview, and export a real `.webm`. |

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

**AI Video Studio** needs no key at all: it composes frames on a canvas and records them with `MediaRecorder`, so the export is a genuine video file produced locally.

---

## Project structure

```
zippy-ai-tools/
├── index.html            # shell: nav, three views, settings modal
├── src/
│   ├── styles.css        # all styling (CSS custom properties)
│   ├── core.js           # shared helpers: uid, clamp, toast, storage, wrapText
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
| Video export | `MediaRecorder` + `canvas.captureStream` — Chrome, Edge, Firefox. Safari support is partial. |

Video export records in **real time**: a 20-second timeline takes 20 seconds to export. Keep the tab visible while it runs — background tabs throttle `requestAnimationFrame`.

---

## Known limitations

- Video export is WebM only (VP9/VP8). No MP4 muxing without a build step.
- Video export has no audio track yet.
- `localStorage` caps around 5 MB, so very large background images may not persist across reloads.
- The image API call assumes an OpenAI-compatible `/images/generations` shape (`b64_json` or `url` in `data[0]`).

---

## License

MIT

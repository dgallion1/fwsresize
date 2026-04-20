# FWS Image Prep Tool

A client-side web application that prepares watercolor painting images for Florida Watercolor Society (FWS) show submissions. Built for Carol Gallion.

## For Carol (Non-Technical Users)

**Getting started is simple:**

1. Open `index.html` by double-clicking it — it opens in your web browser
2. Drop your painting image onto the upload area (or click to choose a file)
3. Enter your painting title and entry number (#1 or #2)
4. Click **"Prepare My Image"**
5. Click **"Download"** to save the ready-to-submit file

The default output meets FWS juried-show specs: **1920 px** longest side, under **5 MB**, Baseline JPEG, sRGB, 72 DPI. If a specific show's prospectus lists different requirements, use the **Advanced settings** panel on the Painting Details step to override the longest-side pixels, max file size, and/or DPI.

For detailed instructions, open `help.html` in your browser or click the "Help" link inside the app.

**Tip:** on the results screen, click either the Original or Processed thumbnail to expand it. Scroll to zoom, drag to pan, Esc or click the dark background to close.

**Important:** Keep `index.html` and `app.js` in the same folder — the tool needs both files.

Your images never leave your computer. All processing happens locally in your browser.

If a TIFF or other image cannot be decoded by your browser, the tool now tells you and suggests retrying with JPEG or PNG.

---

## Technical Documentation

### Architecture

The application is a zero-dependency, client-side single-page app. Runtime code is `index.html` + `app.js`; the rest supports docs, tests, and build tasks:

| File | Purpose |
|------|---------|
| `index.html` | HTML structure + CSS styling, references `app.js` |
| `app.js` | All application logic (state, image processing, DOM manipulation) |
| `help.html` | User-facing help guide |
| `app.test.js` | Jest test suite (98 tests) |
| `Makefile` | Build, test, and run targets |

`app.js` uses a UMD-style IIFE pattern:
- In the browser: exports to `window.FWSApp`
- In Node.js: exports via `module.exports` (for testing)

No build step, no bundler, no framework. Opens directly from the filesystem via `file://`.

**Domain:** [fwsresize.app](https://fwsresize.app) — registered via GCP Cloud Domains, DNS managed by Cloud DNS.

### Image Processing Pipeline

When the user clicks "Prepare My Image," the following steps run in sequence:

1. **Read settings** — `parseAdvanced()` reads the Advanced panel's three input fields (longest-side pixels, max file size MB, DPI) and falls back to `DEFAULT_TARGET_SIZE` (1920), `DEFAULT_MAX_BYTES` (5 MB), and `DEFAULT_DPI` (72) when an input is blank, non-numeric, or out of range. DPI is clamped to the JFIF 16-bit range (1–65535).

2. **Resize** — `calcResize()` computes target dimensions. The longest side is scaled to the parsed target size. Images smaller than the target are not upscaled.

3. **Canvas render** — A `<canvas>` element is created at the target dimensions. `ctx.drawImage()` renders the source image scaled to fit. Canvas output is inherently sRGB.

4. **JPEG export with size control** — `canvas.toBlob(cb, 'image/jpeg', quality)` produces a baseline JPEG. Starting quality is 0.92. If the blob exceeds the parsed max-bytes cap, quality is reduced by 0.05 and retried, clamped to a floor of 0.30. If the final blob is still over the cap at the floor, a warning is surfaced on the results page so the user knows the cap wasn't met (rather than silently shipping an over-cap file).

5. **DPI metadata stamping** — `patchDPIBytes(bytes, dpi)` directly manipulates the JPEG binary to set the chosen DPI in the JFIF APP0 header:
   - Byte 13: `0x01` (units = dots per inch)
   - Bytes 14–15: X density (big-endian); e.g. `0x00 0x48` for 72 DPI, `0x01 0x2C` for 300 DPI
   - Bytes 16–17: Y density (big-endian, same encoding)
   - If no JFIF APP0 segment exists, one is injected after the SOI marker.

6. **Filename construction** — `buildFilename(title, entryNum)` uses the configurable `config.lastName` and `config.firstName` to produce `GALLIONcarol#N_Title.jpg` (default), sanitizing characters that are invalid in downloaded filenames.

7. **Download** — A blob URL is created via `URL.createObjectURL()` and assigned to an `<a download>` element.

### Key Functions

| Function | Type | Description |
|----------|------|-------------|
| `getConfig()` | Pure | Returns current artist name config |
| `setConfig(opts)` | Pure | Updates `lastName` and/or `firstName` for filename generation |
| `formatSize(bytes)` | Pure | Formats byte count as B/KB/MB string |
| `sanitizeTitle(title)` | Pure | Removes filename-invalid characters and trims trailing dots/spaces |
| `buildFilename(title, entryNum)` | Pure | Constructs FWS-format filename |
| `calcResize(w, h, target)` | Pure | Computes target dimensions, scale factor, and whether downscaling occurred |
| `parseAdvanced(rawTargetSize, rawMaxMb, rawDpi)` | Pure | Parses the Advanced panel inputs; returns `{ targetSize, maxBytes, dpi }` with defaults on blank/invalid/out-of-range input |
| `patchDPIBytes(uint8array, dpi)` | Pure | Patches or injects JFIF APP0 density metadata (defaults to 72 DPI when `dpi` is omitted) |
| `patchDPI(blob, dpi)` | Async | Blob wrapper around `patchDPIBytes` |
| `canvasToBlob(canvas, quality)` | Async | Promise wrapper for `canvas.toBlob()` |
| `exportWithSizeLimit(canvas, max)` | Async | Iteratively reduces JPEG quality to meet size limit |
| `selectEntry(num)` | DOM | Updates state and UI for entry number |
| `goToStep(step)` | DOM | Navigates wizard steps, validates prerequisites |
| `handleFile(file)` | DOM | Validates file type, triggers FileReader and Image loading |
| `processImage()` | Async/DOM | Full processing pipeline — resize, export, patch, display results |
| `startOver()` | DOM | Resets all state and UI to initial values |
| `initUploadListeners()` | DOM | Binds drag-and-drop, click, and change listeners on upload area |
| `openLightbox(id)` / `closeLightbox()` | DOM | Show/hide the full-viewport image viewer, copying the given `<img>`'s `src` |
| `lightboxZoomBy(factor)` | Pure-ish | Multiplies the lightbox zoom factor (clamped to 0.5–20) and applies the CSS transform |
| `lightboxStartDrag` / `lightboxMoveDrag` / `lightboxEndDrag` | DOM | Pan state machine driven by mouse/touch events |
| `initLightbox()` | DOM | Binds keydown/wheel/mouse/touch listeners for the lightbox |

### State Management

Artist name is held in a closure-scoped `config` object (defaults to Carol Gallion):

```javascript
{ lastName: 'GALLION', firstName: 'carol' }
```

Application state is held in a closure-scoped `state` object:

```javascript
{
  originalFile: null,      // File object from upload
  originalImage: null,     // HTMLImageElement with naturalWidth/Height
  entryNumber: 1,          // 1 or 2
  processedBlobURL: null   // blob: URL for the processed image
}
```

`getState()` exposes the current state for testing. `resetState()` restores defaults and revokes any active blob URL.

Target size, max file size, and DPI are not kept in state — they are read fresh from the Advanced panel's `<input>` elements at process time via `parseAdvanced()`. Defaults (`DEFAULT_TARGET_SIZE = 1920`, `DEFAULT_MAX_BYTES = 5 MB`, `DEFAULT_DPI = 72`) are exported for test access.

### Testing

Tests use Jest with jsdom.

```bash
make build         # install dev dependencies
make test          # run tests with coverage report
make run           # open app in browser (WSL)
make clean         # remove node_modules and coverage
```

**Coverage:**

| Metric | Coverage |
|--------|----------|
| Statements | 100% |
| Lines | 100% |
| Functions | 100% |
| Branches | 99% |

The single uncovered branch is the UMD module-format detection (`typeof module !== 'undefined'`), which always takes the Node path during testing.

**Test structure:**

- **Config** — `getConfig`, `setConfig`, config-driven filename generation
- **Pure functions** — `formatSize`, `buildFilename`, `calcResize`, `parseAdvanced`
- **DPI patching** — existing JFIF patching, header injection, non-JPEG passthrough, data integrity
- **Async blob processing** — `patchDPI`, `canvasToBlob`, `exportWithSizeLimit` (including quality reduction loop and floor)
- **State management** — defaults, reset, blob URL lifecycle
- **DOM interactions** — entry selection, filename preview, step navigation with validation, file upload with mocked FileReader/Image chain, and decode/read error handling
- **Upload listeners** — click, dragover, dragleave, drop (with and without files), file input change
- **End-to-end `processImage`** — default-path processing, Advanced target-size override, Advanced max-bytes override, Advanced DPI override (with byte-level blob verification), small-image warning, sanitized filename, blob URL revocation
- **Lightbox** — open/close, zoom clamping, mouse-drag pan, single-finger touch-drag pan, wheel zoom in/out, Escape to close, background-click to close, image-click does not close, two-finger touch ignored

### JFIF APP0 Binary Format Reference

The DPI patching code relies on the JFIF specification:

```
Offset  Length  Description
0–1     2       SOI marker: FF D8
2–3     2       APP0 marker: FF E0
4–5     2       Segment length (big-endian, includes these 2 bytes)
6–10    5       Identifier: "JFIF\0" (4A 46 49 46 00)
11      1       Major version
12      1       Minor version
13      1       Units: 00=aspect ratio, 01=DPI, 02=dots/cm
14–15   2       X density (big-endian)
16–17   2       Y density (big-endian)
18      1       Thumbnail width
19      1       Thumbnail height
```

### Browser Compatibility

Requires a modern browser with support for:
- `canvas.toBlob()` (all modern browsers)
- `Blob` constructor and `arrayBuffer()` method
- `URL.createObjectURL()`
- ES5+ (no transpilation needed — code avoids ES6+ syntax)
- `FileReader` API and drag-and-drop events

Tested on: Chrome, Edge, Firefox, Safari (desktop and mobile).

### Project Structure

```
mom/
  index.html          # Main application (HTML + CSS); references app.js?v=DEPLOY_VERSION
  app.js              # Application logic (UMD module)
  help.html           # User-facing help guide
  app.test.js         # Jest test suite (98 tests)
  Makefile            # build, test, run, clean, docker-deploy targets
  package.json        # npm config (test script)
  Dockerfile          # nginx:alpine image; seds DEPLOY_VERSION into index.html at build
  docker-compose.yml  # Runs the container on $PORT (default 3002)
  default.conf        # nginx cache headers: no-cache on HTML, immutable on JS
  README.md           # This file
  .gitignore          # Ignores node_modules, coverage
```

### Deployment

Deployed to [fwsresize.app](https://fwsresize.app) via Docker + nginx, fronted by Cloudflare.

```bash
make docker-deploy     # rsync to DEPLOY_HOST (default: spark) and rebuild the container
```

The Makefile computes `VERSION := $(git-sha)-$(timestamp)` locally and passes it as a Docker build-arg. The Dockerfile `sed`s it into `index.html` so every deploy ships a fresh `<script src="app.js?v={VERSION}">`. Combined with the `default.conf` cache policy (no-cache on HTML, `immutable` long cache on JS), a deploy is live immediately in all browsers without manual cache-clearing: the browser revalidates the HTML on next load, sees the new versioned JS URL, and fetches the new JS.

Overrides: `DEPLOY_HOST`, `DEPLOY_PORT`, and `SSH` are all Makefile variables. Default is `spark` over `tailscale ssh` on port `3002`.

### Customization

To adapt this tool for a different artist:

1. Call `FWSApp.setConfig({ lastName: 'SMITH', firstName: 'jane' })` before use, or update the defaults in `app.js`
2. In `index.html`, update the page title and any hardcoded references
3. In `help.html`, update the filename examples and references to "Carol Gallion"

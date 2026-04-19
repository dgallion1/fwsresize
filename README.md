# FWS Image Prep Tool

A client-side web application that prepares watercolor painting images for Florida Watercolor Society (FWS) show submissions. Built for Carol Gallion.

## For Carol (Non-Technical Users)

**Getting started is simple:**

1. Open `index.html` by double-clicking it — it opens in your web browser
2. Drop your painting image onto the upload area (or click to choose a file)
3. Pick your show type: **Juried** or **Non-Juried**
4. Enter your painting title and entry number (#1 or #2)
5. Click **"Prepare My Image"**
6. Click **"Download"** to save the ready-to-submit file

For detailed instructions, open `help.html` in your browser or click the "Help" link inside the app.

**Important:** Keep `index.html` and `app.js` in the same folder — the tool needs both files.

Your images never leave your computer. All processing happens locally in your browser.

---

## Technical Documentation

### Architecture

The application is a zero-dependency, client-side single-page app split across two files:

| File | Purpose |
|------|---------|
| `index.html` | HTML structure + CSS styling, references `app.js` |
| `app.js` | All application logic (state, image processing, DOM manipulation) |
| `help.html` | User-facing help guide |
| `app.test.js` | Jest test suite (63 tests) |

`app.js` uses a UMD-style IIFE pattern:
- In the browser: exports to `window.FWSApp`
- In Node.js: exports via `module.exports` (for testing)

No build step, no bundler, no framework. Opens directly from the filesystem via `file://`.

### Image Processing Pipeline

When the user clicks "Prepare My Image," the following steps run in sequence:

1. **Resize** — `calcResize()` computes target dimensions. The longest side is scaled to the target (1800px juried, 600px non-juried). Images smaller than the target are not upscaled.

2. **Canvas render** — A `<canvas>` element is created at the target dimensions. `ctx.drawImage()` renders the source image scaled to fit. Canvas output is inherently sRGB.

3. **JPEG export with size control** — `canvas.toBlob(cb, 'image/jpeg', quality)` produces a baseline JPEG. Starting quality is 0.92. If the blob exceeds 5 MB, quality is reduced by 0.05 and retried, down to a floor of 0.30.

4. **DPI metadata stamping** — `patchDPIBytes()` directly manipulates the JPEG binary to set 72 DPI in the JFIF APP0 header:
   - Byte 13: `0x01` (units = dots per inch)
   - Bytes 14–15: `0x00 0x48` (X density = 72)
   - Bytes 16–17: `0x00 0x48` (Y density = 72)
   - If no JFIF APP0 segment exists, one is injected after the SOI marker.

5. **Filename construction** — `buildFilename(title, entryNum)` produces `GALLIONcarol#N_Title.jpg`.

6. **Download** — A blob URL is created via `URL.createObjectURL()` and assigned to an `<a download>` element.

### Key Functions

| Function | Type | Description |
|----------|------|-------------|
| `formatSize(bytes)` | Pure | Formats byte count as B/KB/MB string |
| `buildFilename(title, entryNum)` | Pure | Constructs FWS-format filename |
| `calcResize(w, h, target)` | Pure | Computes target dimensions, scale factor, and whether downscaling occurred |
| `targetForShowType(type)` | Pure | Returns 1800 (juried) or 600 (non-juried) |
| `patchDPIBytes(uint8array)` | Pure | Patches or injects JFIF APP0 DPI metadata in a JPEG byte array |
| `patchDPI(blob)` | Async | Blob wrapper around `patchDPIBytes` |
| `canvasToBlob(canvas, quality)` | Async | Promise wrapper for `canvas.toBlob()` |
| `exportWithSizeLimit(canvas, max)` | Async | Iteratively reduces JPEG quality to meet size limit |
| `selectShowType(type)` | DOM | Updates state and UI for show type selection |
| `selectEntry(num)` | DOM | Updates state and UI for entry number |
| `goToStep(step)` | DOM | Navigates wizard steps, validates prerequisites |
| `handleFile(file)` | DOM | Validates file type, triggers FileReader and Image loading |
| `processImage()` | Async/DOM | Full processing pipeline — resize, export, patch, display results |
| `startOver()` | DOM | Resets all state and UI to initial values |
| `initUploadListeners()` | DOM | Binds drag-and-drop, click, and change listeners on upload area |

### State Management

Application state is held in a closure-scoped `state` object:

```javascript
{
  originalFile: null,      // File object from upload
  originalImage: null,     // HTMLImageElement with naturalWidth/Height
  showType: 'juried',      // 'juried' or 'nonjuried'
  entryNumber: 1,          // 1 or 2
  processedBlobURL: null   // blob: URL for the processed image
}
```

`getState()` exposes the current state for testing. `resetState()` restores defaults and revokes any active blob URL.

### Testing

Tests use Jest with jsdom.

```bash
npm install        # install dev dependencies
npm test           # run tests with coverage report
```

**Coverage:**

| Metric | Coverage |
|--------|----------|
| Statements | 100% |
| Lines | 100% |
| Functions | 100% |
| Branches | 98.21% |

The single uncovered branch is the UMD module-format detection (`typeof module !== 'undefined'`), which always takes the Node path during testing.

**Test structure:**

- **Pure functions** — `formatSize`, `buildFilename`, `calcResize`, `targetForShowType`
- **DPI patching** — existing JFIF patching, header injection, non-JPEG passthrough, data integrity
- **Async blob processing** — `patchDPI`, `canvasToBlob`, `exportWithSizeLimit` (including quality reduction loop and floor)
- **State management** — defaults, reset, blob URL lifecycle
- **DOM interactions** — show type/entry selection, filename preview, step navigation with validation, file upload with mocked FileReader/Image chain
- **Upload listeners** — click, dragover, dragleave, drop (with and without files), file input change
- **End-to-end `processImage`** — juried/non-juried shows, small image warnings, entry numbering, blob URL revocation

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
  index.html          # Main application (HTML + CSS)
  app.js              # Application logic (UMD module)
  help.html           # User-facing help guide
  app.test.js         # Jest test suite
  package.json        # npm config (test script)
  README.md           # This file
  .gitignore          # Ignores node_modules, coverage
```

### Customization

To adapt this tool for a different artist:

1. In `app.js`, modify `buildFilename()` to use a different name format
2. In `index.html`, update the page title and any hardcoded references
3. In `help.html`, update the filename examples and references to "Carol Gallion"
4. Update the tests in `app.test.js` to match the new filename format

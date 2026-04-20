/**
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');

// Load the HTML so jsdom has the full DOM structure
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

// Polyfill URL.createObjectURL / revokeObjectURL for jsdom
if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = jest.fn(() => 'blob:http://localhost/mock');
}
if (typeof URL.revokeObjectURL !== 'function') {
  URL.revokeObjectURL = jest.fn();
}

// Polyfill Blob.prototype.arrayBuffer for jsdom
if (typeof Blob.prototype.arrayBuffer !== 'function') {
  Blob.prototype.arrayBuffer = function () {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(this);
    });
  };
}

// Helper: set up the DOM and load the app module fresh
function setupDOM() {
  document.documentElement.innerHTML = html;
  let app;
  jest.isolateModules(() => {
    app = require('./app.js');
  });
  // Reset mocks for URL methods
  if (jest.isMockFunction(URL.createObjectURL)) URL.createObjectURL.mockClear();
  if (jest.isMockFunction(URL.revokeObjectURL)) URL.revokeObjectURL.mockClear();
  return app;
}

// ---- Config tests ----

describe('getConfig / setConfig', () => {
  let app;
  beforeEach(() => { app = setupDOM(); });

  test('returns default config', () => {
    expect(app.getConfig()).toEqual({ lastName: 'GALLION', firstName: 'carol' });
  });

  test('setConfig updates lastName', () => {
    app.setConfig({ lastName: 'SMITH' });
    expect(app.getConfig().lastName).toBe('SMITH');
    expect(app.getConfig().firstName).toBe('carol');
  });

  test('setConfig updates firstName', () => {
    app.setConfig({ firstName: 'jane' });
    expect(app.getConfig().firstName).toBe('jane');
  });

  test('setConfig updates both', () => {
    app.setConfig({ lastName: 'DOE', firstName: 'john' });
    expect(app.getConfig()).toEqual({ lastName: 'DOE', firstName: 'john' });
  });

  test('buildFilename uses config', () => {
    app.setConfig({ lastName: 'SMITH', firstName: 'jane' });
    expect(app.buildFilename('River Walk', 1)).toBe('SMITHjane#1_River Walk.jpg');
  });
});

// ---- Pure function tests ----

describe('formatSize', () => {
  let app;
  beforeEach(() => { app = setupDOM(); });

  test('formats bytes', () => {
    expect(app.formatSize(0)).toBe('0 B');
    expect(app.formatSize(512)).toBe('512 B');
    expect(app.formatSize(1023)).toBe('1023 B');
  });

  test('formats kilobytes', () => {
    expect(app.formatSize(1024)).toBe('1.0 KB');
    expect(app.formatSize(1536)).toBe('1.5 KB');
    expect(app.formatSize(1048575)).toBe('1024.0 KB');
  });

  test('formats megabytes', () => {
    expect(app.formatSize(1048576)).toBe('1.0 MB');
    expect(app.formatSize(5242880)).toBe('5.0 MB');
    expect(app.formatSize(1572864)).toBe('1.5 MB');
  });
});

describe('buildFilename', () => {
  let app;
  beforeEach(() => { app = setupDOM(); });

  test('builds filename with entry 1', () => {
    expect(app.buildFilename('Sunset Over Tampa Bay', 1))
      .toBe('GALLIONcarol#1_Sunset Over Tampa Bay.jpg');
  });

  test('builds filename with entry 2', () => {
    expect(app.buildFilename('Morning Mist', 2))
      .toBe('GALLIONcarol#2_Morning Mist.jpg');
  });

  test('handles empty title', () => {
    expect(app.buildFilename('', 1)).toBe('GALLIONcarol#1_.jpg');
  });

  test('handles special characters in title', () => {
    expect(app.buildFilename("Carol's Painting", 1))
      .toBe("GALLIONcarol#1_Carol's Painting.jpg");
  });

  test('sanitizes filesystem-invalid title characters', () => {
    expect(app.buildFilename('Sky / Water: Study?*', 2))
      .toBe('GALLIONcarol#2_Sky Water Study.jpg');
  });

  test('trims trailing dots and spaces from title', () => {
    expect(app.buildFilename('Evening Light.   ', 1))
      .toBe('GALLIONcarol#1_Evening Light.jpg');
  });
});

describe('calcResize', () => {
  let app;
  beforeEach(() => { app = setupDOM(); });

  test('downscales landscape image', () => {
    const result = app.calcResize(4000, 3000, 1920);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1440);
    expect(result.wasDownscaled).toBe(true);
    expect(result.scale).toBeCloseTo(0.48);
    expect(result.longestSide).toBe(4000);
  });

  test('downscales portrait image', () => {
    const result = app.calcResize(3000, 4000, 1920);
    expect(result.width).toBe(1440);
    expect(result.height).toBe(1920);
    expect(result.wasDownscaled).toBe(true);
  });

  test('downscales to a smaller custom target', () => {
    const result = app.calcResize(4000, 3000, 600);
    expect(result.width).toBe(600);
    expect(result.height).toBe(450);
    expect(result.wasDownscaled).toBe(true);
  });

  test('does not upscale small image', () => {
    const result = app.calcResize(500, 400, 1920);
    expect(result.width).toBe(500);
    expect(result.height).toBe(400);
    expect(result.scale).toBe(1);
    expect(result.wasDownscaled).toBe(false);
    expect(result.longestSide).toBe(500);
  });

  test('does not upscale image at exact target size', () => {
    const result = app.calcResize(1920, 1200, 1920);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1200);
    expect(result.scale).toBe(1);
    expect(result.wasDownscaled).toBe(false);
  });

  test('handles square image', () => {
    const result = app.calcResize(3000, 3000, 1920);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1920);
    expect(result.wasDownscaled).toBe(true);
  });

  test('rounds dimensions correctly', () => {
    const result = app.calcResize(2001, 1501, 1920);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(Math.round(1501 * (1920 / 2001)));
  });
});

describe('parseAdvanced', () => {
  let app;
  beforeEach(() => { app = setupDOM(); });

  test('returns defaults when all inputs are blank', () => {
    const result = app.parseAdvanced('', '', '');
    expect(result.targetSize).toBe(1920);
    expect(result.maxBytes).toBe(5 * 1024 * 1024);
    expect(result.dpi).toBe(72);
  });

  test('returns defaults for non-numeric input', () => {
    const result = app.parseAdvanced('abc', 'xyz', 'foo');
    expect(result.targetSize).toBe(1920);
    expect(result.maxBytes).toBe(5 * 1024 * 1024);
    expect(result.dpi).toBe(72);
  });

  test('returns defaults for zero or negative input', () => {
    const result = app.parseAdvanced('0', '-2', '-1');
    expect(result.targetSize).toBe(1920);
    expect(result.maxBytes).toBe(5 * 1024 * 1024);
    expect(result.dpi).toBe(72);
  });

  test('parses valid target size', () => {
    const result = app.parseAdvanced('1200', '', '');
    expect(result.targetSize).toBe(1200);
    expect(result.maxBytes).toBe(5 * 1024 * 1024);
    expect(result.dpi).toBe(72);
  });

  test('parses valid max MB', () => {
    const result = app.parseAdvanced('', '2', '');
    expect(result.targetSize).toBe(1920);
    expect(result.maxBytes).toBe(Math.round(2 * 1024 * 1024));
    expect(result.dpi).toBe(72);
  });

  test('parses valid DPI', () => {
    const result = app.parseAdvanced('', '', '300');
    expect(result.targetSize).toBe(1920);
    expect(result.maxBytes).toBe(5 * 1024 * 1024);
    expect(result.dpi).toBe(300);
  });

  test('parses all three custom values together', () => {
    const result = app.parseAdvanced('1600', '1.5', '150');
    expect(result.targetSize).toBe(1600);
    expect(result.maxBytes).toBe(Math.round(1.5 * 1024 * 1024));
    expect(result.dpi).toBe(150);
  });

  test('rejects DPI above the JFIF 16-bit range', () => {
    const result = app.parseAdvanced('', '', '70000');
    expect(result.dpi).toBe(72);
  });

  test('exports default constants', () => {
    expect(app.DEFAULT_TARGET_SIZE).toBe(1920);
    expect(app.DEFAULT_MAX_BYTES).toBe(5 * 1024 * 1024);
    expect(app.DEFAULT_DPI).toBe(72);
  });
});

// ---- DPI patching tests ----

describe('patchDPIBytes', () => {
  let app;
  beforeEach(() => { app = setupDOM(); });

  test('patches existing JFIF APP0 header', () => {
    // Build a minimal JPEG with JFIF header
    const bytes = new Uint8Array(20);
    bytes[0] = 0xFF; bytes[1] = 0xD8; // SOI
    bytes[2] = 0xFF; bytes[3] = 0xE0; // APP0
    bytes[4] = 0x00; bytes[5] = 0x10; // length
    bytes[6] = 0x4A; bytes[7] = 0x46; bytes[8] = 0x49; bytes[9] = 0x46; bytes[10] = 0x00; // JFIF\0
    bytes[11] = 0x01; bytes[12] = 0x02; // version
    bytes[13] = 0x00; // units = aspect ratio (not DPI yet)
    bytes[14] = 0x00; bytes[15] = 0x01; // X density = 1
    bytes[16] = 0x00; bytes[17] = 0x01; // Y density = 1

    const result = app.patchDPIBytes(bytes);
    expect(result.patched).toBe(true);
    expect(result.injected).toBe(false);
    expect(result.bytes[13]).toBe(0x01);  // units = DPI
    expect(result.bytes[14]).toBe(0x00);
    expect(result.bytes[15]).toBe(0x48);  // 72
    expect(result.bytes[16]).toBe(0x00);
    expect(result.bytes[17]).toBe(0x48);  // 72
  });

  test('injects JFIF header when APP0 marker present but not JFIF', () => {
    const bytes = new Uint8Array(20);
    bytes[0] = 0xFF; bytes[1] = 0xD8; // SOI
    bytes[2] = 0xFF; bytes[3] = 0xE0; // APP0
    bytes[4] = 0x00; bytes[5] = 0x10; // length
    // Not JFIF identifier
    bytes[6] = 0x00; bytes[7] = 0x00;

    const result = app.patchDPIBytes(bytes);
    expect(result.patched).toBe(true);
    expect(result.injected).toBe(true);
    // New header should be injected: SOI + JFIF APP0 + rest
    expect(result.bytes[0]).toBe(0xFF);
    expect(result.bytes[1]).toBe(0xD8);
    expect(result.bytes[2]).toBe(0xFF);
    expect(result.bytes[3]).toBe(0xE0);
    // Check JFIF identifier in injected header
    expect(result.bytes[6]).toBe(0x4A); // J
    expect(result.bytes[7]).toBe(0x46); // F
    expect(result.bytes[8]).toBe(0x49); // I
    expect(result.bytes[9]).toBe(0x46); // F
    expect(result.bytes[10]).toBe(0x00);
    // Check DPI values in injected header
    expect(result.bytes[13]).toBe(0x01); // units = DPI
    expect(result.bytes[14]).toBe(0x00);
    expect(result.bytes[15]).toBe(0x48); // 72
    expect(result.bytes[16]).toBe(0x00);
    expect(result.bytes[17]).toBe(0x48); // 72
  });

  test('injects JFIF header when no APP0 marker', () => {
    // JPEG with SOI followed by something else (e.g., APP1/EXIF)
    const bytes = new Uint8Array(10);
    bytes[0] = 0xFF; bytes[1] = 0xD8; // SOI
    bytes[2] = 0xFF; bytes[3] = 0xE1; // APP1 (not APP0)
    bytes[4] = 0x00; bytes[5] = 0x04;

    const result = app.patchDPIBytes(bytes);
    expect(result.patched).toBe(true);
    expect(result.injected).toBe(true);
    // Original data after SOI should follow the injected header
    expect(result.bytes.length).toBe(2 + 18 + 8); // SOI + JFIF header + remaining original
    expect(result.bytes[0]).toBe(0xFF);
    expect(result.bytes[1]).toBe(0xD8);
    // Injected JFIF at offset 2
    expect(result.bytes[2]).toBe(0xFF);
    expect(result.bytes[3]).toBe(0xE0);
    // Original APP1 should follow after the 18-byte JFIF header
    expect(result.bytes[20]).toBe(0xFF);
    expect(result.bytes[21]).toBe(0xE1);
  });

  test('returns unpatched for non-JPEG data', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47]); // PNG header
    const result = app.patchDPIBytes(bytes);
    expect(result.patched).toBe(false);
  });

  test('patches existing JFIF with a custom DPI', () => {
    const bytes = new Uint8Array(20);
    bytes[0] = 0xFF; bytes[1] = 0xD8;
    bytes[2] = 0xFF; bytes[3] = 0xE0;
    bytes[4] = 0x00; bytes[5] = 0x10;
    bytes[6] = 0x4A; bytes[7] = 0x46; bytes[8] = 0x49; bytes[9] = 0x46; bytes[10] = 0x00;
    bytes[11] = 0x01; bytes[12] = 0x02;

    const result = app.patchDPIBytes(bytes, 300);
    expect(result.patched).toBe(true);
    expect(result.bytes[13]).toBe(0x01);  // units = DPI
    // 300 decimal = 0x012C, big-endian → 0x01, 0x2C
    expect(result.bytes[14]).toBe(0x01);
    expect(result.bytes[15]).toBe(0x2C);
    expect(result.bytes[16]).toBe(0x01);
    expect(result.bytes[17]).toBe(0x2C);
  });

  test('injects a new JFIF header with a custom DPI', () => {
    const bytes = new Uint8Array(10);
    bytes[0] = 0xFF; bytes[1] = 0xD8;
    bytes[2] = 0xFF; bytes[3] = 0xE1; // APP1 (not APP0)
    bytes[4] = 0x00; bytes[5] = 0x04;

    const result = app.patchDPIBytes(bytes, 300);
    expect(result.patched).toBe(true);
    expect(result.injected).toBe(true);
    expect(result.bytes[13]).toBe(0x01);
    expect(result.bytes[14]).toBe(0x01);
    expect(result.bytes[15]).toBe(0x2C);
    expect(result.bytes[16]).toBe(0x01);
    expect(result.bytes[17]).toBe(0x2C);
  });

  test('preserves original data length when patching existing JFIF', () => {
    const bytes = new Uint8Array(100);
    bytes[0] = 0xFF; bytes[1] = 0xD8;
    bytes[2] = 0xFF; bytes[3] = 0xE0;
    bytes[4] = 0x00; bytes[5] = 0x10;
    bytes[6] = 0x4A; bytes[7] = 0x46; bytes[8] = 0x49; bytes[9] = 0x46; bytes[10] = 0x00;
    bytes[11] = 0x01; bytes[12] = 0x02;
    // Fill rest with marker data
    for (let i = 18; i < 100; i++) bytes[i] = i;

    const result = app.patchDPIBytes(bytes);
    expect(result.bytes.length).toBe(100);
    // Verify rest of data is untouched
    for (let i = 18; i < 100; i++) {
      expect(result.bytes[i]).toBe(i);
    }
  });
});

describe('patchDPI (async blob version)', () => {
  let app;
  beforeEach(() => { app = setupDOM(); });

  test('patches a JPEG blob and returns a new blob', async () => {
    const bytes = new Uint8Array(20);
    bytes[0] = 0xFF; bytes[1] = 0xD8;
    bytes[2] = 0xFF; bytes[3] = 0xE0;
    bytes[4] = 0x00; bytes[5] = 0x10;
    bytes[6] = 0x4A; bytes[7] = 0x46; bytes[8] = 0x49; bytes[9] = 0x46; bytes[10] = 0x00;
    bytes[11] = 0x01; bytes[12] = 0x02;
    bytes[13] = 0x00; bytes[14] = 0x00; bytes[15] = 0x01;
    bytes[16] = 0x00; bytes[17] = 0x01;

    const blob = new Blob([bytes], { type: 'image/jpeg' });
    const result = await app.patchDPI(blob);

    expect(result).toBeInstanceOf(Blob);
    expect(result.type).toBe('image/jpeg');
    const resultBytes = new Uint8Array(await result.arrayBuffer());
    expect(resultBytes[13]).toBe(0x01);
    expect(resultBytes[15]).toBe(0x48);
    expect(resultBytes[17]).toBe(0x48);
  });

  test('returns original blob for non-JPEG data', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47]);
    const blob = new Blob([bytes], { type: 'image/png' });
    const result = await app.patchDPI(blob);
    // Should return the exact same blob reference
    expect(result).toBe(blob);
  });
});

// ---- State management tests ----

describe('state management', () => {
  let app;
  beforeEach(() => { app = setupDOM(); });

  test('initial state has correct defaults', () => {
    const state = app.getState();
    expect(state.originalFile).toBeNull();
    expect(state.originalImage).toBeNull();
    expect(state.entryNumber).toBe(1);
    expect(state.processedBlobURL).toBeNull();
    expect(state.showType).toBeUndefined();
  });

  test('resetState restores defaults', () => {
    const state = app.getState();
    state.entryNumber = 2;
    app.resetState();
    const fresh = app.getState();
    expect(fresh.entryNumber).toBe(1);
  });

  test('resetState revokes existing blob URL', () => {
    const state = app.getState();
    state.processedBlobURL = 'blob:http://localhost/fake';
    app.resetState();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/fake');
  });

  test('resetState handles null blob URL without error', () => {
    expect(() => app.resetState()).not.toThrow();
  });
});

// ---- DOM interaction tests ----

describe('selectEntry', () => {
  let app;
  beforeEach(() => { app = setupDOM(); });

  test('selects entry 1', () => {
    app.selectEntry(1);
    expect(app.getState().entryNumber).toBe(1);
    expect(document.getElementById('entry-1').classList.contains('selected')).toBe(true);
    expect(document.getElementById('entry-2').classList.contains('selected')).toBe(false);
  });

  test('selects entry 2', () => {
    app.selectEntry(2);
    expect(app.getState().entryNumber).toBe(2);
    expect(document.getElementById('entry-1').classList.contains('selected')).toBe(false);
    expect(document.getElementById('entry-2').classList.contains('selected')).toBe(true);
  });

  test('updates filename preview when selecting entry', () => {
    document.getElementById('painting-title').value = 'Test';
    app.selectEntry(2);
    expect(document.getElementById('filename-text').textContent)
      .toBe('GALLIONcarol#2_Test.jpg');
  });
});

describe('updateFilenamePreview', () => {
  let app;
  beforeEach(() => { app = setupDOM(); });

  test('updates filename text from input', () => {
    document.getElementById('painting-title').value = 'Sunset';
    app.updateFilenamePreview();
    expect(document.getElementById('filename-text').textContent)
      .toBe('GALLIONcarol#1_Sunset.jpg');
  });

  test('uses current entry number', () => {
    app.selectEntry(2);
    document.getElementById('painting-title').value = 'Waves';
    app.updateFilenamePreview();
    expect(document.getElementById('filename-text').textContent)
      .toBe('GALLIONcarol#2_Waves.jpg');
  });

  test('handles empty title', () => {
    document.getElementById('painting-title').value = '';
    app.updateFilenamePreview();
    expect(document.getElementById('filename-text').textContent)
      .toBe('GALLIONcarol#1_.jpg');
  });
});

describe('goToStep', () => {
  let app;
  beforeEach(() => { app = setupDOM(); });

  test('shows step 1 and hides others', () => {
    app.goToStep(1);
    expect(document.getElementById('step-1').classList.contains('visible')).toBe(true);
    expect(document.getElementById('step-2').classList.contains('visible')).toBe(false);
    expect(document.getElementById('step-3').classList.contains('visible')).toBe(false);
  });

  test('shows step 3 with dots updated', () => {
    // Need an originalImage so we can pass through the step-2 prerequisite
    app.getState().originalImage = { naturalWidth: 100, naturalHeight: 100 };
    app.goToStep(3);
    expect(document.getElementById('step-3').classList.contains('visible')).toBe(true);
    expect(document.getElementById('dot-1').classList.contains('done')).toBe(true);
    expect(document.getElementById('dot-2').classList.contains('done')).toBe(true);
    expect(document.getElementById('dot-3').classList.contains('active')).toBe(true);
  });

  test('prevents going to step 2 without image', () => {
    const alertMock = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const result = app.goToStep(2);
    expect(result).toBe(false);
    expect(alertMock).toHaveBeenCalledWith('Please upload an image first.');
    alertMock.mockRestore();
  });

  test('allows going to step 2 with image loaded', () => {
    app.getState().originalImage = { naturalWidth: 100, naturalHeight: 100 };
    const result = app.goToStep(2);
    expect(result).toBe(true);
    expect(document.getElementById('step-2').classList.contains('visible')).toBe(true);
  });

  test('returns true on success', () => {
    const result = app.goToStep(1);
    expect(result).toBe(true);
  });
});

describe('handleFile', () => {
  let app;
  beforeEach(() => { app = setupDOM(); });

  test('rejects non-image file', () => {
    const alertMock = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const file = new File(['test'], 'doc.pdf', { type: 'application/pdf' });
    const result = app.handleFile(file);
    expect(result).toBe(false);
    expect(alertMock).toHaveBeenCalledWith('Please choose an image file (JPEG, PNG, or TIFF).');
    alertMock.mockRestore();
  });

  test('accepts image file and sets state', () => {
    const file = new File(['test'], 'photo.jpg', { type: 'image/jpeg' });
    const result = app.handleFile(file);
    expect(result).toBe(true);
    expect(app.getState().originalFile).toBe(file);
  });

  test('rejects SVG even though it is image/*', () => {
    const alertMock = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const file = new File(['<svg/>'], 'evil.svg', { type: 'image/svg+xml' });
    const result = app.handleFile(file);
    expect(result).toBe(false);
    expect(alertMock).toHaveBeenCalledWith('Please choose an image file (JPEG, PNG, or TIFF).');
    alertMock.mockRestore();
  });

  test('rejects oversize file', () => {
    const alertMock = jest.spyOn(window, 'alert').mockImplementation(() => {});
    // Fake an oversized file without allocating the bytes.
    const file = new File(['x'], 'huge.jpg', { type: 'image/jpeg' });
    Object.defineProperty(file, 'size', { value: app.MAX_UPLOAD_BYTES + 1 });
    const result = app.handleFile(file);
    expect(result).toBe(false);
    expect(alertMock).toHaveBeenCalledWith(expect.stringContaining('upload limit'));
    expect(app.getState().originalFile).toBeNull();
    alertMock.mockRestore();
  });

  test('FileReader onload sets up Image and img.onload updates DOM', () => {
    // Mock FileReader to synchronously trigger onload
    const origFileReader = global.FileReader;
    const mockFileReader = function () {
      this.readAsDataURL = function () {
        this.onload({ target: { result: 'data:image/jpeg;base64,fakedata' } });
      };
    };
    global.FileReader = mockFileReader;

    // Mock Image to synchronously trigger onload and expose naturalWidth/Height
    const origImage = global.Image;
    global.Image = function () {
      const img = {};
      Object.defineProperty(img, 'src', {
        set: function () {
          // Define naturalWidth/Height before calling onload
          Object.defineProperty(img, 'naturalWidth', { value: 2000, configurable: true });
          Object.defineProperty(img, 'naturalHeight', { value: 1500, configurable: true });
          if (img.onload) img.onload();
        },
        configurable: true,
      });
      return img;
    };

    const file = new File(['test'], 'painting.jpg', { type: 'image/jpeg' });
    app.handleFile(file);

    expect(app.getState().originalImage).toBeTruthy();
    expect(document.getElementById('preview-img').src).toBe('data:image/jpeg;base64,fakedata');
    expect(document.getElementById('original-preview').style.display).toBe('block');
    expect(document.getElementById('upload-next-row').style.display).toBe('flex');
    expect(document.getElementById('original-info').textContent).toContain('2000 x 1500');

    global.FileReader = origFileReader;
    global.Image = origImage;
  });

  test('shows an alert when FileReader fails', () => {
    const alertMock = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const origFileReader = global.FileReader;
    const mockFileReader = function () {
      this.readAsDataURL = function () {
        this.onerror(new Error('read failed'));
      };
    };
    global.FileReader = mockFileReader;

    const file = new File(['test'], 'painting.tiff', { type: 'image/tiff' });
    app.handleFile(file);

    expect(app.getState().originalFile).toBeNull();
    expect(app.getState().originalImage).toBeNull();
    expect(document.getElementById('original-preview').style.display).toBe('none');
    expect(document.getElementById('upload-next-row').style.display).toBe('none');
    expect(alertMock).toHaveBeenCalledWith(
      'The image file could not be read. Please try a different JPEG, PNG, or TIFF file.'
    );

    global.FileReader = origFileReader;
    alertMock.mockRestore();
  });

  test('shows an alert when the browser cannot decode the image', () => {
    const alertMock = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const origFileReader = global.FileReader;
    const mockFileReader = function () {
      this.readAsDataURL = function () {
        this.onload({ target: { result: 'data:image/tiff;base64,fakedata' } });
      };
    };
    global.FileReader = mockFileReader;

    const origImage = global.Image;
    global.Image = function () {
      const img = {};
      Object.defineProperty(img, 'src', {
        set: function () {
          if (img.onerror) img.onerror(new Error('decode failed'));
        },
        configurable: true,
      });
      return img;
    };

    const file = new File(['test'], 'painting.tiff', { type: 'image/tiff' });
    app.handleFile(file);

    expect(app.getState().originalFile).toBeNull();
    expect(app.getState().originalImage).toBeNull();
    expect(document.getElementById('original-preview').style.display).toBe('none');
    expect(document.getElementById('upload-next-row').style.display).toBe('none');
    expect(alertMock).toHaveBeenCalledWith(
      'This image format could not be opened in your browser. Please try a JPEG or PNG file.'
    );

    global.FileReader = origFileReader;
    global.Image = origImage;
    alertMock.mockRestore();
  });
});

describe('startOver', () => {
  let app;
  beforeEach(() => { app = setupDOM(); });

  test('resets all state and UI', () => {
    // Set some state
    app.getState().entryNumber = 2;
    document.getElementById('painting-title').value = 'Test';
    document.getElementById('original-preview').style.display = 'block';
    document.getElementById('upload-next-row').style.display = 'flex';
    document.getElementById('adv-target-size').value = '1200';
    document.getElementById('adv-max-mb').value = '2';
    document.getElementById('adv-dpi').value = '300';

    app.startOver();

    expect(app.getState().entryNumber).toBe(1);
    expect(document.getElementById('painting-title').value).toBe('');
    expect(document.getElementById('original-preview').style.display).toBe('none');
    expect(document.getElementById('upload-next-row').style.display).toBe('none');
    expect(document.getElementById('filename-text').textContent).toBe('GALLIONcarol#1_.jpg');
    expect(document.getElementById('entry-1').classList.contains('selected')).toBe(true);
    expect(document.getElementById('entry-2').classList.contains('selected')).toBe(false);
    expect(document.getElementById('adv-target-size').value).toBe('');
    expect(document.getElementById('adv-max-mb').value).toBe('');
    expect(document.getElementById('adv-dpi').value).toBe('');
    expect(document.getElementById('step-1').classList.contains('visible')).toBe(true);
  });

  test('revokes existing blob URL', () => {
    app.getState().processedBlobURL = 'blob:http://localhost/fake';
    app.startOver();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/fake');
  });
});

describe('initUploadListeners', () => {
  let app;
  beforeEach(() => { app = setupDOM(); });

  test('sets up click listener on upload area', () => {
    app.initUploadListeners();
    const fileInput = document.getElementById('file-input');
    const clickSpy = jest.spyOn(fileInput, 'click');
    document.getElementById('upload-area').click();
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  test('sets up dragover listener', () => {
    app.initUploadListeners();
    const uploadArea = document.getElementById('upload-area');
    const event = new Event('dragover');
    event.preventDefault = jest.fn();
    uploadArea.dispatchEvent(event);
    expect(uploadArea.classList.contains('drag-over')).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  test('sets up dragleave listener', () => {
    app.initUploadListeners();
    const uploadArea = document.getElementById('upload-area');
    uploadArea.classList.add('drag-over');
    uploadArea.dispatchEvent(new Event('dragleave'));
    expect(uploadArea.classList.contains('drag-over')).toBe(false);
  });

  test('sets up drop listener', () => {
    app.initUploadListeners();
    const uploadArea = document.getElementById('upload-area');
    const alertMock = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const file = new File(['test'], 'doc.txt', { type: 'text/plain' });
    const event = new Event('drop');
    event.preventDefault = jest.fn();
    event.dataTransfer = { files: [file] };
    uploadArea.dispatchEvent(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(uploadArea.classList.contains('drag-over')).toBe(false);
    alertMock.mockRestore();
  });

  test('drop with no files does nothing', () => {
    app.initUploadListeners();
    const uploadArea = document.getElementById('upload-area');
    const event = new Event('drop');
    event.preventDefault = jest.fn();
    event.dataTransfer = { files: [] };
    uploadArea.dispatchEvent(event);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  test('sets up file input change listener with no files', () => {
    app.initUploadListeners();
    const fileInput = document.getElementById('file-input');
    Object.defineProperty(fileInput, 'files', {
      value: [],
      writable: true,
    });
    // Should not throw
    fileInput.dispatchEvent(new Event('change'));
  });

  test('file input change with file calls handleFile', () => {
    app.initUploadListeners();
    const fileInput = document.getElementById('file-input');
    const alertMock = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const file = new File(['data'], 'painting.jpg', { type: 'image/jpeg' });
    Object.defineProperty(fileInput, 'files', {
      value: [file],
      writable: true,
      configurable: true,
    });
    fileInput.dispatchEvent(new Event('change'));
    expect(app.getState().originalFile).toBe(file);
    alertMock.mockRestore();
  });
});

// ---- Lightbox tests ----

describe('lightbox', () => {
  let app;
  beforeEach(() => {
    app = setupDOM();
    app.initLightbox();
    // Give result-original a fake src so openLightbox has something to copy
    document.getElementById('result-original').src = 'data:image/jpeg;base64,fake';
  });

  test('openLightbox shows overlay and copies src with zoom reset', () => {
    const state = app.getLightboxState();
    state.zoom = 3;
    state.panX = 50;
    state.panY = -20;

    const ok = app.openLightbox('result-original');
    expect(ok).toBe(true);
    expect(document.getElementById('lightbox').classList.contains('visible')).toBe(true);
    expect(document.getElementById('lightbox-img').src).toContain('data:image/jpeg;base64,fake');
    expect(app.getLightboxState().zoom).toBe(1);
    expect(app.getLightboxState().panX).toBe(0);
    expect(app.getLightboxState().panY).toBe(0);
  });

  test('openLightbox returns false when source element has no src', () => {
    // result-processed hasn't been populated
    const ok = app.openLightbox('result-processed');
    expect(ok).toBe(false);
    expect(document.getElementById('lightbox').classList.contains('visible')).toBe(false);
  });

  test('closeLightbox hides overlay', () => {
    app.openLightbox('result-original');
    app.closeLightbox();
    expect(document.getElementById('lightbox').classList.contains('visible')).toBe(false);
  });

  test('lightboxZoomBy multiplies current zoom', () => {
    app.openLightbox('result-original');
    app.lightboxZoomBy(2);
    expect(app.getLightboxState().zoom).toBe(2);
    app.lightboxZoomBy(1.5);
    expect(app.getLightboxState().zoom).toBeCloseTo(3);
  });

  test('lightboxZoomBy clamps at max zoom', () => {
    app.openLightbox('result-original');
    for (let i = 0; i < 50; i++) app.lightboxZoomBy(2);
    expect(app.getLightboxState().zoom).toBe(20);
  });

  test('lightboxZoomBy clamps at min zoom', () => {
    app.openLightbox('result-original');
    for (let i = 0; i < 50; i++) app.lightboxZoomBy(0.5);
    expect(app.getLightboxState().zoom).toBe(0.5);
  });

  test('drag updates panX and panY by mouse delta', () => {
    app.openLightbox('result-original');
    app.lightboxStartDrag(100, 100);
    app.lightboxMoveDrag(150, 130);
    expect(app.getLightboxState().panX).toBe(50);
    expect(app.getLightboxState().panY).toBe(30);
    app.lightboxEndDrag();
    expect(app.getLightboxState().dragging).toBe(false);
  });

  test('move without drag is ignored', () => {
    app.openLightbox('result-original');
    const before = { x: app.getLightboxState().panX, y: app.getLightboxState().panY };
    app.lightboxMoveDrag(500, 500);
    expect(app.getLightboxState().panX).toBe(before.x);
    expect(app.getLightboxState().panY).toBe(before.y);
  });

  test('wheel scroll up zooms in', () => {
    app.openLightbox('result-original');
    const overlay = document.getElementById('lightbox');
    const evt = new Event('wheel', { bubbles: true, cancelable: true });
    evt.deltaY = -100;
    overlay.dispatchEvent(evt);
    expect(app.getLightboxState().zoom).toBeGreaterThan(1);
  });

  test('wheel scroll down zooms out', () => {
    app.openLightbox('result-original');
    app.lightboxZoomBy(4);
    const overlay = document.getElementById('lightbox');
    const evt = new Event('wheel', { bubbles: true, cancelable: true });
    evt.deltaY = 100;
    overlay.dispatchEvent(evt);
    expect(app.getLightboxState().zoom).toBeLessThan(4);
  });

  test('Escape key closes the lightbox when visible', () => {
    app.openLightbox('result-original');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.getElementById('lightbox').classList.contains('visible')).toBe(false);
  });

  test('Escape key is ignored when lightbox is hidden', () => {
    // Sanity: closing something already closed is a no-op; mainly ensures the
    // handler does not throw when the overlay is not visible.
    expect(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    }).not.toThrow();
  });

  test('clicking the overlay background closes the lightbox', () => {
    app.openLightbox('result-original');
    const overlay = document.getElementById('lightbox');
    const clickEvt = new Event('click', { bubbles: true });
    Object.defineProperty(clickEvt, 'target', { value: overlay });
    overlay.dispatchEvent(clickEvt);
    expect(overlay.classList.contains('visible')).toBe(false);
  });

  test('clicking on the image does not close', () => {
    app.openLightbox('result-original');
    const overlay = document.getElementById('lightbox');
    const img = document.getElementById('lightbox-img');
    const clickEvt = new Event('click', { bubbles: true });
    Object.defineProperty(clickEvt, 'target', { value: img });
    overlay.dispatchEvent(clickEvt);
    expect(overlay.classList.contains('visible')).toBe(true);
  });

  test('mouse drag event chain updates pan and ends cleanly', () => {
    app.openLightbox('result-original');
    const img = document.getElementById('lightbox-img');

    const down = new MouseEvent('mousedown', { bubbles: true, clientX: 100, clientY: 100 });
    img.dispatchEvent(down);
    expect(app.getLightboxState().dragging).toBe(true);
    expect(img.classList.contains('grabbing')).toBe(true);

    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 175, clientY: 120 }));
    expect(app.getLightboxState().panX).toBe(75);
    expect(app.getLightboxState().panY).toBe(20);

    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(app.getLightboxState().dragging).toBe(false);
    expect(img.classList.contains('grabbing')).toBe(false);
  });

  test('touch drag event chain updates pan for single-finger touch', () => {
    app.openLightbox('result-original');
    const img = document.getElementById('lightbox-img');

    const start = new Event('touchstart', { bubbles: true });
    start.touches = [{ clientX: 10, clientY: 10 }];
    img.dispatchEvent(start);
    expect(app.getLightboxState().dragging).toBe(true);

    const move = new Event('touchmove', { bubbles: true });
    move.touches = [{ clientX: 60, clientY: 40 }];
    document.dispatchEvent(move);
    expect(app.getLightboxState().panX).toBe(50);
    expect(app.getLightboxState().panY).toBe(30);

    document.dispatchEvent(new Event('touchend', { bubbles: true }));
    expect(app.getLightboxState().dragging).toBe(false);
  });

  test('two-finger touchstart is ignored (no pinch support yet)', () => {
    app.openLightbox('result-original');
    const img = document.getElementById('lightbox-img');
    const start = new Event('touchstart', { bubbles: true });
    start.touches = [{ clientX: 0, clientY: 0 }, { clientX: 50, clientY: 50 }];
    img.dispatchEvent(start);
    expect(app.getLightboxState().dragging).toBe(false);
  });

  test('touchmove without active drag is a no-op', () => {
    app.openLightbox('result-original');
    const before = app.getLightboxState().panX;
    const move = new Event('touchmove', { bubbles: true });
    move.touches = [{ clientX: 500, clientY: 500 }];
    document.dispatchEvent(move);
    expect(app.getLightboxState().panX).toBe(before);
  });
});

// ---- Canvas and export tests ----

describe('canvasToBlob', () => {
  let app;
  beforeEach(() => { app = setupDOM(); });

  test('calls canvas.toBlob with correct args', async () => {
    const mockBlob = new Blob(['test'], { type: 'image/jpeg' });
    const mockCanvas = {
      toBlob: jest.fn((cb, type, quality) => cb(mockBlob)),
    };
    const result = await app.canvasToBlob(mockCanvas, 0.9);
    expect(mockCanvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.9);
    expect(result).toBe(mockBlob);
  });
});

describe('exportWithSizeLimit', () => {
  let app;
  beforeEach(() => { app = setupDOM(); });

  test('iterates up to quality 1.0 when every step fits the budget', async () => {
    const smallBlob = new Blob(['x'.repeat(1000)], { type: 'image/jpeg' });
    const canvas = {
      toBlob: jest.fn((cb) => cb(smallBlob)),
    };
    const result = await app.exportWithSizeLimit(canvas, 5 * 1024 * 1024);
    expect(result.blob).toBe(smallBlob);
    expect(result.quality).toBeCloseTo(1.0);
    // Starts at 0.92, then 0.94, 0.96, 0.98, 1.00 = 5 encodes.
    expect(canvas.toBlob).toHaveBeenCalledTimes(5);
  });

  test('stops upward iteration before next quality would overshoot budget', async () => {
    // Simulate a canvas where file size scales with quality. The budget
    // should accept 0.92 and 0.94, but 0.96 would overshoot.
    const sizeByQuality = {
      0.92: 800 * 1024,
      0.94: 900 * 1024,
      0.96: 1100 * 1024,   // overshoots the 1 MB budget
      0.98: 1400 * 1024,
      1.0:  2000 * 1024,
    };
    const canvas = {
      toBlob: jest.fn((cb, mime, q) => {
        const rounded = Math.round(q * 100) / 100;
        cb(new Blob(['x'.repeat(sizeByQuality[rounded])], { type: 'image/jpeg' }));
      }),
    };
    const result = await app.exportWithSizeLimit(canvas, 1024 * 1024);
    expect(result.quality).toBeCloseTo(0.94);
    expect(result.blob.size).toBe(900 * 1024);
    // Called at 0.92 (fits) → 0.94 (fits) → 0.96 (overshoots, rejected). 3 calls.
    expect(canvas.toBlob).toHaveBeenCalledTimes(3);
  });

  test('upward iteration does not run when starting quality overshoots', async () => {
    // If 0.92 is already over budget, we should fall into the down-branch
    // only — no upward probing.
    const largeBlob = new Blob(['x'.repeat(6 * 1024 * 1024)], { type: 'image/jpeg' });
    const smallBlob = new Blob(['x'.repeat(1000)], { type: 'image/jpeg' });
    let call = 0;
    const canvas = {
      toBlob: jest.fn((cb) => {
        call++;
        cb(call === 1 ? largeBlob : smallBlob);
      }),
    };
    const result = await app.exportWithSizeLimit(canvas, 5 * 1024 * 1024);
    // 0.92 overshoots → step down to 0.87 where mock now returns smallBlob.
    expect(result.quality).toBeCloseTo(0.87);
    expect(result.blob).toBe(smallBlob);
    expect(canvas.toBlob).toHaveBeenCalledTimes(2);
  });

  test('reduces quality when blob exceeds size limit', async () => {
    let callCount = 0;
    const largeBlob = new Blob(['x'.repeat(6 * 1024 * 1024)], { type: 'image/jpeg' });
    const smallBlob = new Blob(['x'.repeat(1000)], { type: 'image/jpeg' });

    const canvas = {
      toBlob: jest.fn((cb) => {
        callCount++;
        cb(callCount <= 2 ? largeBlob : smallBlob);
      }),
    };

    const result = await app.exportWithSizeLimit(canvas, 5 * 1024 * 1024);
    expect(result.blob).toBe(smallBlob);
    expect(canvas.toBlob).toHaveBeenCalledTimes(3);
    // quality starts at 0.92, reduced by 0.05 twice = 0.82
    expect(result.quality).toBeCloseTo(0.82);
  });

  test('stops reducing quality at 0.3 floor', async () => {
    const largeBlob = new Blob(['x'.repeat(6 * 1024 * 1024)], { type: 'image/jpeg' });
    const canvas = {
      toBlob: jest.fn((cb) => cb(largeBlob)),
    };

    const result = await app.exportWithSizeLimit(canvas, 5 * 1024 * 1024);
    expect(result.quality).toBeCloseTo(0.3);
    expect(result.blob).toBe(largeBlob); // still large, but we gave up
  });
});

// ---- processImage tests ----

describe('processImage', () => {
  let app;
  beforeEach(() => {
    app = setupDOM();
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('alerts and returns null when title is empty', async () => {
    const alertMock = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const focusMock = jest.spyOn(document.getElementById('painting-title'), 'focus')
      .mockImplementation(() => {});
    document.getElementById('painting-title').value = '   ';
    app.getState().originalImage = { naturalWidth: 100, naturalHeight: 100 };

    const result = await app.processImage();
    expect(result).toBeNull();
    expect(alertMock).toHaveBeenCalledWith('Please enter a painting title.');
    expect(focusMock).toHaveBeenCalled();
    alertMock.mockRestore();
    focusMock.mockRestore();
  });

  test('processes image end-to-end with default settings', async () => {
    // Set up state
    const state = app.getState();
    state.originalImage = {
      naturalWidth: 4000,
      naturalHeight: 3000,
    };
    state.originalFile = new File(['x'.repeat(2000000)], 'test.jpeg', { type: 'image/jpeg' });
    state.entryNumber = 1;

    document.getElementById('painting-title').value = 'Sunset Bay';
    document.getElementById('preview-img').src = 'data:image/jpeg;base64,test';

    // Mock canvas and its context
    const mockCtx = { drawImage: jest.fn() };

    // Build a small fake JPEG with JFIF header for patchDPI
    const fakeJpeg = new Uint8Array(20);
    fakeJpeg[0] = 0xFF; fakeJpeg[1] = 0xD8;
    fakeJpeg[2] = 0xFF; fakeJpeg[3] = 0xE0;
    fakeJpeg[4] = 0x00; fakeJpeg[5] = 0x10;
    fakeJpeg[6] = 0x4A; fakeJpeg[7] = 0x46; fakeJpeg[8] = 0x49; fakeJpeg[9] = 0x46; fakeJpeg[10] = 0x00;
    fakeJpeg[11] = 0x01; fakeJpeg[12] = 0x02;
    const fakeBlob = new Blob([fakeJpeg], { type: 'image/jpeg' });

    const origCreateElement = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => mockCtx,
          toBlob: (cb) => cb(fakeBlob),
        };
      }
      return origCreateElement(tag);
    });

    URL.createObjectURL.mockReturnValue('blob:http://localhost/processed');

    const promise = app.processImage();
    // Advance the 50ms setTimeout
    jest.advanceTimersByTime(50);
    const result = await promise;

    expect(result).not.toBeNull();
    expect(result.filename).toBe('GALLIONcarol#1_Sunset Bay.jpg');
    expect(result.dims.width).toBe(1920);
    expect(result.dims.height).toBe(1440);
    expect(mockCtx.drawImage).toHaveBeenCalledWith(state.originalImage, 0, 0, 1920, 1440);

    // Check DOM updates
    expect(document.getElementById('meta-proc-dims').textContent).toBe('1920 x 1440 px');
    expect(document.getElementById('meta-orig-dims').textContent).toBe('4000 x 3000 px');
    expect(document.getElementById('meta-proc-format').textContent).toBe('JPEG (Baseline), sRGB, 72 DPI');
    expect(document.getElementById('success-msg').textContent)
      .toContain('Sunset Bay');
    expect(document.getElementById('download-btn').download)
      .toBe('GALLIONcarol#1_Sunset Bay.jpg');
    expect(document.getElementById('results').style.display).toBe('block');
    expect(document.getElementById('processing-spinner').classList.contains('visible')).toBe(false);
    expect(document.getElementById('size-warning').style.display).toBe('none');

    document.createElement.mockRestore();
  });

  test('shows size warning for small image', async () => {
    const state = app.getState();
    state.originalImage = {
      naturalWidth: 400,
      naturalHeight: 300,
    };
    state.originalFile = new File(['x'], 'small.jpeg', { type: 'image/jpeg' });
    state.entryNumber = 1;

    document.getElementById('painting-title').value = 'Tiny';
    document.getElementById('preview-img').src = 'data:image/jpeg;base64,test';

    const fakeJpeg = new Uint8Array(20);
    fakeJpeg[0] = 0xFF; fakeJpeg[1] = 0xD8;
    fakeJpeg[2] = 0xFF; fakeJpeg[3] = 0xE0;
    fakeJpeg[4] = 0x00; fakeJpeg[5] = 0x10;
    fakeJpeg[6] = 0x4A; fakeJpeg[7] = 0x46; fakeJpeg[8] = 0x49; fakeJpeg[9] = 0x46; fakeJpeg[10] = 0x00;
    fakeJpeg[11] = 0x01; fakeJpeg[12] = 0x02;
    const fakeBlob = new Blob([fakeJpeg], { type: 'image/jpeg' });

    const mockCtx = { drawImage: jest.fn() };
    const origCreateElement = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'canvas') {
        return {
          width: 0, height: 0,
          getContext: () => mockCtx,
          toBlob: (cb) => cb(fakeBlob),
        };
      }
      return origCreateElement(tag);
    });
    URL.createObjectURL.mockReturnValue('blob:fake');

    const promise = app.processImage();
    jest.advanceTimersByTime(50);
    const result = await promise;

    expect(result.dims.wasDownscaled).toBe(false);
    expect(result.dims.width).toBe(400);
    expect(result.dims.height).toBe(300);
    expect(document.getElementById('size-warning').style.display).toBe('block');
    expect(document.getElementById('size-warning').textContent).toContain('400px');
    expect(document.getElementById('size-warning').textContent).toContain('1920px');

    document.createElement.mockRestore();
  });

  test('honors Advanced target size override', async () => {
    const state = app.getState();
    state.originalImage = { naturalWidth: 2000, naturalHeight: 1000 };
    state.originalFile = new File(['x'], 'test.png', { type: 'image/png' });
    state.entryNumber = 2;

    document.getElementById('painting-title').value = 'Waves';
    document.getElementById('preview-img').src = 'data:image/png;base64,test';
    // Advanced override: 600px longest side
    document.getElementById('adv-target-size').value = '600';

    const fakeJpeg = new Uint8Array(20);
    fakeJpeg[0] = 0xFF; fakeJpeg[1] = 0xD8;
    fakeJpeg[2] = 0xFF; fakeJpeg[3] = 0xE0;
    fakeJpeg[4] = 0x00; fakeJpeg[5] = 0x10;
    fakeJpeg[6] = 0x4A; fakeJpeg[7] = 0x46; fakeJpeg[8] = 0x49; fakeJpeg[9] = 0x46; fakeJpeg[10] = 0x00;
    fakeJpeg[11] = 0x01; fakeJpeg[12] = 0x02;
    const fakeBlob = new Blob([fakeJpeg], { type: 'image/jpeg' });

    const mockCtx = { drawImage: jest.fn() };
    const origCreateElement = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'canvas') {
        return {
          width: 0, height: 0,
          getContext: () => mockCtx,
          toBlob: (cb) => cb(fakeBlob),
        };
      }
      return origCreateElement(tag);
    });
    URL.createObjectURL.mockReturnValue('blob:fake');

    const promise = app.processImage();
    jest.advanceTimersByTime(50);
    const result = await promise;

    expect(result.filename).toBe('GALLIONcarol#2_Waves.jpg');
    expect(result.dims.width).toBe(600);
    expect(result.dims.height).toBe(300);
    expect(document.getElementById('meta-orig-format').textContent).toBe('PNG');

    document.createElement.mockRestore();
  });

  test('honors Advanced DPI override and stamps it into the output blob', async () => {
    const state = app.getState();
    state.originalImage = { naturalWidth: 2000, naturalHeight: 1000 };
    state.originalFile = new File(['x'], 'test.jpeg', { type: 'image/jpeg' });
    state.entryNumber = 1;

    document.getElementById('painting-title').value = 'Print Copy';
    document.getElementById('preview-img').src = 'data:image/jpeg;base64,test';
    document.getElementById('adv-dpi').value = '300';

    const fakeJpeg = new Uint8Array(20);
    fakeJpeg[0] = 0xFF; fakeJpeg[1] = 0xD8;
    fakeJpeg[2] = 0xFF; fakeJpeg[3] = 0xE0;
    fakeJpeg[4] = 0x00; fakeJpeg[5] = 0x10;
    fakeJpeg[6] = 0x4A; fakeJpeg[7] = 0x46; fakeJpeg[8] = 0x49; fakeJpeg[9] = 0x46; fakeJpeg[10] = 0x00;
    fakeJpeg[11] = 0x01; fakeJpeg[12] = 0x02;
    const fakeBlob = new Blob([fakeJpeg], { type: 'image/jpeg' });

    const mockCtx = { drawImage: jest.fn() };
    const origCreateElement = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'canvas') {
        return {
          width: 0, height: 0,
          getContext: () => mockCtx,
          toBlob: (cb) => cb(fakeBlob),
        };
      }
      return origCreateElement(tag);
    });
    URL.createObjectURL.mockReturnValue('blob:fake');

    const promise = app.processImage();
    jest.advanceTimersByTime(50);
    const result = await promise;

    // Format metadata reflects the custom DPI
    expect(document.getElementById('meta-proc-format').textContent).toBe('JPEG (Baseline), sRGB, 300 DPI');

    // Verify the output blob actually has 300 DPI stamped (0x012C big-endian)
    const outBytes = new Uint8Array(await result.blob.arrayBuffer());
    expect(outBytes[13]).toBe(0x01);
    expect(outBytes[14]).toBe(0x01);
    expect(outBytes[15]).toBe(0x2C);
    expect(outBytes[16]).toBe(0x01);
    expect(outBytes[17]).toBe(0x2C);

    document.createElement.mockRestore();
  });

  test('honors Advanced max file size override', async () => {
    const state = app.getState();
    state.originalImage = { naturalWidth: 2000, naturalHeight: 1000 };
    state.originalFile = new File(['x'], 'test.jpeg', { type: 'image/jpeg' });
    state.entryNumber = 1;

    document.getElementById('painting-title').value = 'Small Cap';
    document.getElementById('preview-img').src = 'data:image/jpeg;base64,test';
    // 1 MB cap → parseAdvanced returns 1*1024*1024 = 1048576
    document.getElementById('adv-max-mb').value = '1';

    // 1.5 MB blob: over the 1 MB cap so exportWithSizeLimit will loop
    const oversizedJpeg = new Uint8Array(1.5 * 1024 * 1024);
    oversizedJpeg[0] = 0xFF; oversizedJpeg[1] = 0xD8;
    oversizedJpeg[2] = 0xFF; oversizedJpeg[3] = 0xE0;
    oversizedJpeg[4] = 0x00; oversizedJpeg[5] = 0x10;
    oversizedJpeg[6] = 0x4A; oversizedJpeg[7] = 0x46; oversizedJpeg[8] = 0x49; oversizedJpeg[9] = 0x46; oversizedJpeg[10] = 0x00;
    oversizedJpeg[11] = 0x01; oversizedJpeg[12] = 0x02;
    const oversizedBlob = new Blob([oversizedJpeg], { type: 'image/jpeg' });

    let toBlobCalls = 0;
    const mockCtx = { drawImage: jest.fn() };
    const origCreateElement = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'canvas') {
        return {
          width: 0, height: 0,
          getContext: () => mockCtx,
          toBlob: (cb) => { toBlobCalls++; cb(oversizedBlob); },
        };
      }
      return origCreateElement(tag);
    });
    URL.createObjectURL.mockReturnValue('blob:fake');

    const promise = app.processImage();
    jest.advanceTimersByTime(50);
    await promise;

    // Size cap of 1 MB forces the quality loop to retry multiple times
    expect(toBlobCalls).toBeGreaterThan(1);

    // The mocked blob stays at 1.5 MB even at the 0.30 quality floor, so the
    // user's 1 MB cap can't be satisfied. processImage() must surface this
    // rather than silently ship a file over the requested cap.
    const warnEl = document.getElementById('size-warning');
    expect(warnEl.style.display).toBe('block');
    expect(warnEl.textContent).toContain('1.5 MB');
    expect(warnEl.textContent).toContain('1.0 MB');
    expect(warnEl.textContent).toMatch(/cap|minimum|smaller longest-side/i);

    document.createElement.mockRestore();
  });

  test('uses sanitized filename for download output', async () => {
    const state = app.getState();
    state.originalImage = { naturalWidth: 2000, naturalHeight: 1000 };
    state.originalFile = new File(['x'], 'test.jpeg', { type: 'image/jpeg' });
    state.entryNumber = 2;

    document.getElementById('painting-title').value = 'Sky / Water: Study?*';
    document.getElementById('preview-img').src = 'data:image/jpeg;base64,test';

    const fakeJpeg = new Uint8Array(20);
    fakeJpeg[0] = 0xFF; fakeJpeg[1] = 0xD8;
    fakeJpeg[2] = 0xFF; fakeJpeg[3] = 0xE0;
    fakeJpeg[4] = 0x00; fakeJpeg[5] = 0x10;
    fakeJpeg[6] = 0x4A; fakeJpeg[7] = 0x46; fakeJpeg[8] = 0x49; fakeJpeg[9] = 0x46; fakeJpeg[10] = 0x00;
    fakeJpeg[11] = 0x01; fakeJpeg[12] = 0x02;
    const fakeBlob = new Blob([fakeJpeg], { type: 'image/jpeg' });

    const mockCtx = { drawImage: jest.fn() };
    const origCreateElement = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'canvas') {
        return {
          width: 0, height: 0,
          getContext: () => mockCtx,
          toBlob: (cb) => cb(fakeBlob),
        };
      }
      return origCreateElement(tag);
    });
    URL.createObjectURL.mockReturnValue('blob:fake');

    const promise = app.processImage();
    jest.advanceTimersByTime(50);
    const result = await promise;

    expect(result.filename).toBe('GALLIONcarol#2_Sky Water Study.jpg');
    expect(document.getElementById('download-btn').download)
      .toBe('GALLIONcarol#2_Sky Water Study.jpg');

    document.createElement.mockRestore();
  });

  test('revokes previous blob URL when processing again', async () => {
    const state = app.getState();
    state.originalImage = { naturalWidth: 2000, naturalHeight: 1000 };
    state.originalFile = new File(['x'], 'test.jpeg', { type: 'image/jpeg' });
    state.processedBlobURL = 'blob:http://localhost/old';

    document.getElementById('painting-title').value = 'Test';
    document.getElementById('preview-img').src = 'data:test';

    const fakeJpeg = new Uint8Array(20);
    fakeJpeg[0] = 0xFF; fakeJpeg[1] = 0xD8;
    fakeJpeg[2] = 0xFF; fakeJpeg[3] = 0xE0;
    fakeJpeg[4] = 0x00; fakeJpeg[5] = 0x10;
    fakeJpeg[6] = 0x4A; fakeJpeg[7] = 0x46; fakeJpeg[8] = 0x49; fakeJpeg[9] = 0x46; fakeJpeg[10] = 0x00;
    fakeJpeg[11] = 0x01; fakeJpeg[12] = 0x02;
    const fakeBlob = new Blob([fakeJpeg], { type: 'image/jpeg' });

    const mockCtx = { drawImage: jest.fn() };
    const origCreateElement = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'canvas') {
        return {
          width: 0, height: 0,
          getContext: () => mockCtx,
          toBlob: (cb) => cb(fakeBlob),
        };
      }
      return origCreateElement(tag);
    });
    URL.createObjectURL.mockReturnValue('blob:http://localhost/new');

    const promise = app.processImage();
    jest.advanceTimersByTime(50);
    await promise;

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/old');

    document.createElement.mockRestore();
  });
});

// ---- Warning tests (FWS minimum resolution + problematic title chars) ----

describe('findProblemTitleChars', () => {
  let app;
  beforeEach(() => { app = setupDOM(); });

  test('returns empty for clean title', () => {
    expect(app.findProblemTitleChars('Sunset Over Tampa Bay')).toEqual([]);
  });

  test('flags ampersand', () => {
    expect(app.findProblemTitleChars('Black & White')).toEqual(['&']);
  });

  test('flags apostrophe', () => {
    expect(app.findProblemTitleChars("Carol's Painting")).toEqual(["'"]);
  });

  test('flags every problem character', () => {
    expect(app.findProblemTitleChars('a & b \' c " d / e \\ f : g'))
      .toEqual(['&', "'", '"', '/', '\\', ':']);
  });

  test('exports the canonical problem-char list', () => {
    expect(app.PROBLEM_TITLE_CHARS).toEqual(['&', "'", '"', '/', '\\', ':']);
  });
});

describe('title warning (updateFilenamePreview)', () => {
  let app;
  beforeEach(() => { app = setupDOM(); });

  test('shows warning when title contains problematic characters', () => {
    document.getElementById('painting-title').value = "Carol's Painting & Co.";
    app.updateFilenamePreview();
    const warn = document.getElementById('title-warning');
    expect(warn.style.display).toBe('block');
    expect(warn.textContent).toContain("'");
    expect(warn.textContent).toContain('&');
  });

  test('hides warning when title is clean', () => {
    const warn = document.getElementById('title-warning');
    warn.style.display = 'block';
    document.getElementById('painting-title').value = 'Sunset Over Tampa Bay';
    app.updateFilenamePreview();
    expect(warn.style.display).toBe('none');
  });

  test('hides warning for empty title', () => {
    document.getElementById('painting-title').value = '';
    app.updateFilenamePreview();
    expect(document.getElementById('title-warning').style.display).toBe('none');
  });
});

describe('FWS_MIN_LONGEST_SIDE upload warning', () => {
  let app;
  beforeEach(() => { app = setupDOM(); });

  test('exports the constant at 1800 px', () => {
    expect(app.FWS_MIN_LONGEST_SIDE).toBe(1800);
  });

  function uploadImageOfSize(width, height) {
    const origFileReader = global.FileReader;
    global.FileReader = function () {
      this.readAsDataURL = function () {
        this.onload({ target: { result: 'data:image/jpeg;base64,fake' } });
      };
    };
    const origImage = global.Image;
    global.Image = function () {
      const img = {};
      Object.defineProperty(img, 'src', {
        set: function () {
          Object.defineProperty(img, 'naturalWidth', { value: width, configurable: true });
          Object.defineProperty(img, 'naturalHeight', { value: height, configurable: true });
          if (img.onload) img.onload();
        },
        configurable: true,
      });
      return img;
    };
    const file = new File(['test'], 'painting.jpg', { type: 'image/jpeg' });
    app.handleFile(file);
    global.FileReader = origFileReader;
    global.Image = origImage;
  }

  test('shows warning when longest side is below 1800 px', () => {
    uploadImageOfSize(1200, 900);
    const warn = document.getElementById('upload-warning');
    expect(warn.style.display).toBe('block');
    expect(warn.textContent).toContain('1200');
    expect(warn.textContent).toContain('1800');
  });

  test('uses the longer of the two dimensions', () => {
    uploadImageOfSize(900, 1600);
    const warn = document.getElementById('upload-warning');
    expect(warn.style.display).toBe('block');
    expect(warn.textContent).toContain('1600');
  });

  test('hides warning when longest side meets the 1800 px minimum', () => {
    uploadImageOfSize(1800, 1200);
    expect(document.getElementById('upload-warning').style.display).toBe('none');
  });

  test('hides warning for images well above the minimum', () => {
    uploadImageOfSize(4000, 3000);
    expect(document.getElementById('upload-warning').style.display).toBe('none');
  });

  test('clears warning when FileReader fails after a prior small image', () => {
    uploadImageOfSize(1000, 800);
    expect(document.getElementById('upload-warning').style.display).toBe('block');

    const alertMock = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const origFileReader = global.FileReader;
    global.FileReader = function () {
      this.readAsDataURL = function () { this.onerror(new Error('boom')); };
    };
    app.handleFile(new File(['x'], 'bad.jpg', { type: 'image/jpeg' }));
    expect(document.getElementById('upload-warning').style.display).toBe('none');
    global.FileReader = origFileReader;
    alertMock.mockRestore();
  });

  test('startOver hides both warnings', () => {
    document.getElementById('upload-warning').style.display = 'block';
    document.getElementById('title-warning').style.display = 'block';
    app.startOver();
    expect(document.getElementById('upload-warning').style.display).toBe('none');
    expect(document.getElementById('title-warning').style.display).toBe('none');
  });
});

describe('initAppHandlers', () => {
  let app;
  beforeEach(() => {
    app = setupDOM();
    app.initAppHandlers();
  });

  test('entry-1 / entry-2 clicks select entry', () => {
    document.getElementById('entry-2').click();
    expect(app.getState().entryNumber).toBe(2);
    document.getElementById('entry-1').click();
    expect(app.getState().entryNumber).toBe(1);
  });

  test('painting-title input updates filename preview', () => {
    const input = document.getElementById('painting-title');
    input.value = 'Misty Morning';
    input.dispatchEvent(new Event('input'));
    expect(document.getElementById('filename-text').textContent).toContain('Misty Morning');
  });

  test('step2-back-btn goes to step 1', () => {
    // goToStep(2) demands an uploaded image; give it one so the alert path
    // doesn't fire and pollute the test output.
    app.getState().originalImage = { naturalWidth: 100, naturalHeight: 100 };
    app.goToStep(2);
    document.getElementById('step2-back-btn').click();
    expect(document.getElementById('step-1').classList.contains('visible')).toBe(true);
  });

  test('upload-next-btn goes to step 2 when image is loaded', () => {
    app.getState().originalImage = { naturalWidth: 100, naturalHeight: 100 };
    document.getElementById('upload-next-btn').click();
    expect(document.getElementById('step-2').classList.contains('visible')).toBe(true);
  });

  test('start-over-btn resets state', () => {
    app.getState().entryNumber = 2;
    document.getElementById('start-over-btn').click();
    expect(app.getState().entryNumber).toBe(1);
  });

  test('lightbox-close click hides lightbox', () => {
    app.initLightbox();
    document.getElementById('result-original').src = 'data:image/jpeg;base64,x';
    app.openLightbox('result-original');
    document.getElementById('lightbox-close').click();
    expect(document.getElementById('lightbox').classList.contains('visible')).toBe(false);
  });

  test('result-original click opens lightbox', () => {
    app.initLightbox();
    document.getElementById('result-original').src = 'data:image/jpeg;base64,x';
    document.getElementById('result-original').click();
    expect(document.getElementById('lightbox').classList.contains('visible')).toBe(true);
  });
});

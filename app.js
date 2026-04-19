// FWS Image Prep - Application Logic
// Extracted for testability; works both as browser global and Node module.

(function (exports) {
  'use strict';

  // ---- State ----
  let state = {
    originalFile: null,
    originalImage: null,
    showType: 'juried',
    entryNumber: 1,
    processedBlobURL: null,
  };

  function getState() { return state; }

  function resetState() {
    if (state.processedBlobURL && typeof URL !== 'undefined' && URL.revokeObjectURL) {
      URL.revokeObjectURL(state.processedBlobURL);
    }
    state = {
      originalFile: null,
      originalImage: null,
      showType: 'juried',
      entryNumber: 1,
      processedBlobURL: null,
    };
  }

  // ---- Pure functions ----

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function buildFilename(title, entryNum) {
    return 'GALLIONcarol#' + entryNum + '_' + title + '.jpg';
  }

  function calcResize(origWidth, origHeight, targetSize) {
    var longestSide = Math.max(origWidth, origHeight);
    var scale = longestSide <= targetSize ? 1 : targetSize / longestSide;
    return {
      width: Math.round(origWidth * scale),
      height: Math.round(origHeight * scale),
      scale: scale,
      longestSide: longestSide,
      wasDownscaled: longestSide > targetSize,
    };
  }

  function targetForShowType(showType) {
    return showType === 'juried' ? 1800 : 600;
  }

  // ---- DPI patching ----

  function patchDPIBytes(bytes) {
    // Verify SOI (FF D8)
    if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) {
      return { patched: false, bytes: bytes };
    }

    // Check for APP0 JFIF marker at bytes 2-3
    if (bytes[2] === 0xFF && bytes[3] === 0xE0) {
      // Verify JFIF identifier at bytes 6-10
      if (bytes[6] === 0x4A && bytes[7] === 0x46 &&
          bytes[8] === 0x49 && bytes[9] === 0x46 && bytes[10] === 0x00) {
        // Patch density fields
        bytes[13] = 0x01;       // units = DPI
        bytes[14] = 0x00;       // X density high byte
        bytes[15] = 0x48;       // X density low byte (72)
        bytes[16] = 0x00;       // Y density high byte
        bytes[17] = 0x48;       // Y density low byte (72)
        return { patched: true, bytes: bytes, injected: false };
      }
    }

    // No JFIF header found — inject one after SOI
    var jfifHeader = new Uint8Array([
      0xFF, 0xE0,             // APP0 marker
      0x00, 0x10,             // segment length: 16 bytes
      0x4A, 0x46, 0x49, 0x46, 0x00,  // "JFIF\0"
      0x01, 0x02,             // version 1.2
      0x01,                   // units = DPI
      0x00, 0x48,             // X density = 72
      0x00, 0x48,             // Y density = 72
      0x00, 0x00              // no thumbnail
    ]);

    var result = new Uint8Array(2 + jfifHeader.length + bytes.length - 2);
    result[0] = 0xFF;
    result[1] = 0xD8;
    result.set(jfifHeader, 2);
    result.set(bytes.subarray(2), 2 + jfifHeader.length);
    return { patched: true, bytes: result, injected: true };
  }

  async function patchDPI(blob) {
    var buffer = await blob.arrayBuffer();
    var bytes = new Uint8Array(buffer);
    var result = patchDPIBytes(bytes);
    if (!result.patched) return blob;
    return new Blob([result.bytes], { type: 'image/jpeg' });
  }

  // ---- Canvas helpers ----

  function canvasToBlob(canvas, quality) {
    return new Promise(function (resolve) {
      canvas.toBlob(resolve, 'image/jpeg', quality);
    });
  }

  async function exportWithSizeLimit(canvas, maxBytes) {
    var quality = 0.92;
    var blob = await canvasToBlob(canvas, quality);

    while (blob.size > maxBytes && quality > 0.3) {
      quality -= 0.05;
      blob = await canvasToBlob(canvas, quality);
    }

    return { blob: blob, quality: quality };
  }

  // ---- DOM interaction ----

  function selectShowType(type) {
    state.showType = type;
    document.getElementById('card-juried').classList.toggle('selected', type === 'juried');
    document.getElementById('card-nonjuried').classList.toggle('selected', type === 'nonjuried');
  }

  function selectEntry(num) {
    state.entryNumber = num;
    document.getElementById('entry-1').classList.toggle('selected', num === 1);
    document.getElementById('entry-2').classList.toggle('selected', num === 2);
    updateFilenamePreview();
  }

  function updateFilenamePreview() {
    var title = document.getElementById('painting-title').value;
    var filename = buildFilename(title, state.entryNumber);
    document.getElementById('filename-text').textContent = filename;
  }

  function goToStep(step) {
    if (step === 2 && !state.originalImage) {
      alert('Please upload an image first.');
      return false;
    }

    for (var i = 1; i <= 4; i++) {
      document.getElementById('step-' + i).classList.toggle('visible', i === step);
      var dot = document.getElementById('dot-' + i);
      dot.classList.remove('active', 'done');
      if (i < step) dot.classList.add('done');
      if (i === step) dot.classList.add('active');
    }
    return true;
  }

  function handleFile(file) {
    if (!file.type.startsWith('image/')) {
      alert('Please choose an image file (JPEG, PNG, or TIFF).');
      return false;
    }

    state.originalFile = file;
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        state.originalImage = img;
        document.getElementById('preview-img').src = e.target.result;
        document.getElementById('original-info').textContent =
          img.naturalWidth + ' x ' + img.naturalHeight + ' pixels  \u00B7  ' + formatSize(file.size);
        document.getElementById('original-preview').style.display = 'block';
        document.getElementById('upload-next-row').style.display = 'flex';
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    return true;
  }

  async function processImage() {
    var title = document.getElementById('painting-title').value.trim();
    if (!title) {
      alert('Please enter a painting title.');
      document.getElementById('painting-title').focus();
      return null;
    }

    goToStep(4);
    document.getElementById('processing-spinner').classList.add('visible');
    document.getElementById('results').style.display = 'none';

    // Let the UI update before heavy processing
    await new Promise(function (r) { setTimeout(r, 50); });

    var targetSize = targetForShowType(state.showType);
    var dims = calcResize(
      state.originalImage.naturalWidth,
      state.originalImage.naturalHeight,
      targetSize
    );

    // Draw on canvas
    var canvas = document.createElement('canvas');
    canvas.width = dims.width;
    canvas.height = dims.height;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(state.originalImage, 0, 0, dims.width, dims.height);

    // Export JPEG with size control
    var maxBytes = 5 * 1024 * 1024;
    var exported = await exportWithSizeLimit(canvas, maxBytes);

    // Patch DPI metadata
    var patched = await patchDPI(exported.blob);

    // Build filename
    var filename = buildFilename(title, state.entryNumber);

    // Clean up old blob URL
    if (state.processedBlobURL) URL.revokeObjectURL(state.processedBlobURL);
    state.processedBlobURL = URL.createObjectURL(patched);

    // Populate results
    document.getElementById('result-original').src = document.getElementById('preview-img').src;
    document.getElementById('result-processed').src = state.processedBlobURL;

    document.getElementById('meta-orig-dims').textContent =
      state.originalImage.naturalWidth + ' x ' + state.originalImage.naturalHeight + ' px';
    document.getElementById('meta-proc-dims').textContent = dims.width + ' x ' + dims.height + ' px';
    document.getElementById('meta-orig-size').textContent = formatSize(state.originalFile.size);
    document.getElementById('meta-proc-size').textContent = formatSize(patched.size);
    document.getElementById('meta-orig-format').textContent =
      state.originalFile.type.replace('image/', '').toUpperCase();

    document.getElementById('success-msg').textContent =
      'Your image "' + title + '" is ready to download as: ' + filename;

    // Size warning
    var sizeWarn = document.getElementById('size-warning');
    if (!dims.wasDownscaled) {
      sizeWarn.textContent =
        'Note: Your original image (' + dims.longestSide + 'px) is smaller than the recommended ' +
        targetSize + 'px. The image was not enlarged to avoid losing quality.';
      sizeWarn.style.display = 'block';
    } else {
      sizeWarn.style.display = 'none';
    }

    // Download button
    var dlBtn = document.getElementById('download-btn');
    dlBtn.href = state.processedBlobURL;
    dlBtn.download = filename;

    document.getElementById('processing-spinner').classList.remove('visible');
    document.getElementById('results').style.display = 'block';

    return { filename: filename, dims: dims, blob: patched };
  }

  function startOver() {
    resetState();

    document.getElementById('file-input').value = '';
    document.getElementById('original-preview').style.display = 'none';
    document.getElementById('upload-next-row').style.display = 'none';
    document.getElementById('painting-title').value = '';
    document.getElementById('filename-text').textContent = 'GALLIONcarol#1_.jpg';
    document.getElementById('entry-1').classList.add('selected');
    document.getElementById('entry-2').classList.remove('selected');
    selectShowType('juried');

    goToStep(1);
  }

  function initUploadListeners() {
    var uploadArea = document.getElementById('upload-area');
    var fileInput = document.getElementById('file-input');

    uploadArea.addEventListener('click', function () { fileInput.click(); });

    uploadArea.addEventListener('dragover', function (e) {
      e.preventDefault();
      uploadArea.classList.add('drag-over');
    });

    uploadArea.addEventListener('dragleave', function () {
      uploadArea.classList.remove('drag-over');
    });

    uploadArea.addEventListener('drop', function (e) {
      e.preventDefault();
      uploadArea.classList.remove('drag-over');
      if (e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', function () {
      if (fileInput.files.length > 0) {
        handleFile(fileInput.files[0]);
      }
    });
  }

  // ---- Exports ----
  exports.getState = getState;
  exports.resetState = resetState;
  exports.formatSize = formatSize;
  exports.buildFilename = buildFilename;
  exports.calcResize = calcResize;
  exports.targetForShowType = targetForShowType;
  exports.patchDPIBytes = patchDPIBytes;
  exports.patchDPI = patchDPI;
  exports.canvasToBlob = canvasToBlob;
  exports.exportWithSizeLimit = exportWithSizeLimit;
  exports.selectShowType = selectShowType;
  exports.selectEntry = selectEntry;
  exports.updateFilenamePreview = updateFilenamePreview;
  exports.goToStep = goToStep;
  exports.handleFile = handleFile;
  exports.processImage = processImage;
  exports.startOver = startOver;
  exports.initUploadListeners = initUploadListeners;

})(typeof module !== 'undefined' && module.exports ? module.exports : (window.FWSApp = {}));

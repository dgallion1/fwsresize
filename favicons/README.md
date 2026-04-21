# Favicon — Watercolor Submission Tool

Pure watercolor droplet mark. Deep blue drop with coral and green paint-dab accents.

## Files

| File | Size | Purpose |
|---|---|---|
| `favicon.svg` | vector | Modern browsers — scales to any size |
| `favicon.ico` | 16/32/48 bundled | Legacy browsers, Windows tabs |
| `favicon-16.png` | 16×16 | Browser tab (small) |
| `favicon-32.png` | 32×32 | Browser tab (retina) |
| `favicon-48.png` | 48×48 | Windows shortcut |
| `favicon-180.png` | 180×180 | Apple touch icon (iOS home screen) |
| `favicon-192.png` | 192×192 | Android / PWA |
| `favicon-512.png` | 512×512 | PWA splash / large |

## HTML setup

Drop all files into your project's root or `public/` folder, then add this to the `<head>` of `index.html`:

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/favicon-180.png">
<link rel="shortcut icon" href="/favicon.ico">
```

## Regenerating

If you want to tweak the design, edit `favicon.svg` then run:

```bash
python build.py
```

Requires `pip install Pillow cairosvg`.

"""Generate favicon files in all standard sizes from the master SVG."""
import cairosvg
from PIL import Image
import os

SRC = "/home/claude/favicon/favicon.svg"
OUT = "/home/claude/favicon"

sizes = {
    "favicon-16.png": 16,
    "favicon-32.png": 32,
    "favicon-48.png": 48,
    "favicon-180.png": 180,
    "favicon-192.png": 192,
    "favicon-512.png": 512,
}

for filename, size in sizes.items():
    out_path = os.path.join(OUT, filename)
    cairosvg.svg2png(
        url=SRC,
        write_to=out_path,
        output_width=size,
        output_height=size,
    )
    print(f"Created {filename} ({size}x{size})")

ico_sources = [
    Image.open(os.path.join(OUT, "favicon-16.png")),
    Image.open(os.path.join(OUT, "favicon-32.png")),
    Image.open(os.path.join(OUT, "favicon-48.png")),
]
ico_path = os.path.join(OUT, "favicon.ico")
ico_sources[0].save(
    ico_path,
    format="ICO",
    sizes=[(16, 16), (32, 32), (48, 48)],
    append_images=ico_sources[1:],
)
print(f"Created favicon.ico (16, 32, 48 bundled)")

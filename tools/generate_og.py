"""Generate the ATLAS OG / Twitter card images with proper hierarchy.

Layout (1200×630, the Facebook/LinkedIn/WhatsApp standard):

  ┌─────────────────────────────────────────────────────────┐
  │  ▌▌                                          [REV/0.1]  │  <- top chrome
  │                                                         │
  │     ●Λ      ATLAS                                       │
  │             ───────────────                             │
  │             Distributed ZK proving                      │
  │             Groth16 · Kafka · Worker threads            │
  │                                                         │
  │  ┌── Proving is the bottleneck. ──┐                     │
  │  └── Verifying is cheap. ──────────┘                    │
  │                                                         │
  │  github / patrick-steve / atlas                         │  <- bottom chrome
  └─────────────────────────────────────────────────────────┘
"""

import os
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# Surface sizes
SIZES = {
    "og-image.png": (1200, 630),       # Facebook / LinkedIn / WhatsApp / Open Graph
    "twitter-image.png": (1200, 675),  # Twitter large card (16:9)
}

BG = (5, 7, 10, 255)
GRID = (24, 28, 38, 255)
SIGNAL = (126, 231, 135)
SIGNAL_DIM = (63, 169, 72)
AMBER = (242, 192, 85)
INK_300 = (94, 102, 117)
INK_100 = (182, 191, 204)
INK_50 = (216, 221, 229)

# Font candidates — pick the first that exists.
WIN_FONTS = "C:/Windows/Fonts"
FONT_CANDIDATES_MONO = [
    f"{WIN_FONTS}/consola.ttf",   # Consolas — broadly available on Windows
    f"{WIN_FONTS}/cour.ttf",      # Courier New fallback
]
FONT_CANDIDATES_BOLD = [
    f"{WIN_FONTS}/segoeuib.ttf",  # Segoe UI Bold
    f"{WIN_FONTS}/arialbd.ttf",
]
FONT_CANDIDATES_SANS = [
    f"{WIN_FONTS}/segoeui.ttf",
    f"{WIN_FONTS}/arial.ttf",
]


def first_font(candidates, size):
    for c in candidates:
        if os.path.exists(c):
            try:
                return ImageFont.truetype(c, size=size)
            except Exception:
                pass
    return ImageFont.load_default()


def draw_grid(img):
    d = ImageDraw.Draw(img)
    w, h = img.size
    step = 64
    for x in range(0, w, step):
        d.line([(x, 0), (x, h)], fill=GRID, width=1)
    for y in range(0, h, step):
        d.line([(0, y), (w, y)], fill=GRID, width=1)


def draw_corner_bracket(d, x, y, dx, dy, arm=22, w=4, color=(126, 231, 135, 200)):
    d.line([(x, y), (x + dx * arm, y)], fill=color, width=w)
    d.line([(x, y), (x, y + dy * arm)], fill=color, width=w)


def draw_chrome(img):
    d = ImageDraw.Draw(img, "RGBA")
    w, h = img.size
    # outer hairline frame
    d.rectangle([(28, 28), (w - 28, h - 28)], outline=(40, 50, 65, 255), width=1)
    # 4 corner brackets
    inset = 60
    arm = 32
    draw_corner_bracket(d, inset, inset, 1, 1, arm=arm)
    draw_corner_bracket(d, w - inset, inset, -1, 1, arm=arm)
    draw_corner_bracket(d, inset, h - inset, 1, -1, arm=arm)
    draw_corner_bracket(d, w - inset, h - inset, -1, -1, arm=arm)


def pulse_dot(d, x, y, r=6, color=SIGNAL):
    # outer halo
    halo = Image.new("RGBA", (r * 8, r * 8), (0, 0, 0, 0))
    hd = ImageDraw.Draw(halo)
    hd.ellipse([0, 0, r * 8 - 1, r * 8 - 1], fill=(*color, 90))
    halo = halo.filter(ImageFilter.GaussianBlur(radius=r * 1.2))
    img.alpha_composite(halo, (x - r * 4, y - r * 4))
    d.ellipse([x - r, y - r, x + r, y + r], fill=color)


def compose(filename: str, size: tuple[int, int], logo_path: str):
    global img
    w, h = size
    img = Image.new("RGBA", size, BG)
    draw_grid(img)
    draw_chrome(img)
    d = ImageDraw.Draw(img, "RGBA")

    # Fonts
    f_kicker = first_font(FONT_CANDIDATES_MONO, 18)
    f_atlas = first_font(FONT_CANDIDATES_BOLD, 128)
    f_subtitle = first_font(FONT_CANDIDATES_SANS, 32)
    f_meta = first_font(FONT_CANDIDATES_MONO, 18)
    f_thesis = first_font(FONT_CANDIDATES_SANS, 42)
    f_footer = first_font(FONT_CANDIDATES_MONO, 16)

    # ----- Top kicker row -----
    pulse_dot(d, 80, 80, r=5, color=SIGNAL)
    d.text((100, 70), "ATLAS / RESEARCH PIPELINE / GROTH16", font=f_kicker, fill=INK_100)
    rev_text = "REV / 0.1"
    rev_w = d.textlength(rev_text, font=f_kicker)
    d.text((w - 80 - rev_w, 70), rev_text, font=f_kicker, fill=INK_300)

    # ----- Logo + wordmark row -----
    logo = Image.open(logo_path).convert("RGBA")
    target_logo = int(h * 0.42)
    logo.thumbnail((target_logo, target_logo), Image.Resampling.LANCZOS)
    logo_x = 90
    logo_y = (h - logo.height) // 2 - 20
    img.alpha_composite(logo, (logo_x, logo_y))

    text_x = logo_x + logo.width + 30
    # "ATLAS" wordmark
    title_y = logo_y + 30
    d.text((text_x, title_y), "ATLAS", font=f_atlas, fill=INK_50)
    title_w = d.textlength("ATLAS", font=f_atlas)
    # phosphor underline rule
    d.rectangle([(text_x, title_y + 145), (text_x + title_w, title_y + 147)], fill=SIGNAL)

    # subtitle
    d.text((text_x, title_y + 165), "Distributed ZK proving", font=f_subtitle, fill=INK_100)

    # tech chips row
    chips = ["GROTH16", "BN254", "POSEIDON", "KAFKAJS", "WORKER_THREADS"]
    chip_x = text_x
    chip_y = title_y + 215
    for c in chips:
        cw = d.textlength(c, font=f_meta) + 18
        d.rectangle([(chip_x, chip_y), (chip_x + cw, chip_y + 28)], outline=(60, 75, 95, 255), width=1)
        d.text((chip_x + 9, chip_y + 5), c, font=f_meta, fill=INK_100)
        chip_x += cw + 8

    # ----- Thesis at the bottom -----
    thesis_y = h - 140
    d.text((90, thesis_y), "Proving is the bottleneck.", font=f_thesis, fill=INK_50)
    d.text((90, thesis_y + 50), "Verifying is cheap.", font=f_thesis, fill=SIGNAL)

    # ----- Footer / repo URL -----
    footer_text = "github.com / patrick-steve / atlas"
    fw = d.textlength(footer_text, font=f_footer)
    d.text((w - 80 - fw, h - 75), footer_text, font=f_footer, fill=INK_300)

    img.save(filename)
    return filename


def main():
    here = os.path.dirname(__file__)
    out_dir = os.path.join(here, "build", "assets")
    os.makedirs(out_dir, exist_ok=True)
    logo_path = os.path.join(here, "build", "logo.png")
    if not os.path.exists(logo_path):
        print(f"missing {logo_path} — run generate_logo.py first", file=sys.stderr)
        sys.exit(1)
    for name, size in SIZES.items():
        compose(os.path.join(out_dir, name), size, logo_path)
        print(f"wrote {name}  ({size[0]}×{size[1]})")


if __name__ == "__main__":
    main()

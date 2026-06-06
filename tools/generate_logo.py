"""Generate the ATLAS source logo at 1024x1024.

Mark concept:
  A stylized Λ (lambda) — two thick phosphor-green diagonals meeting at an
  apex, with a small bright amber dot at the vertex (the "signal source").
  A faint horizontal scan-line crosses the mark at mid-height, hinting at
  the oscilloscope/instrument-panel aesthetic.

  At favicon scale (16×16) the silhouette reads as a sharp triangular
  signal mark — distinct from blockchain hex/cube cliches and instantly
  parseable in a browser tab.
"""

import os
from PIL import Image, ImageDraw, ImageFilter

SIZE = 1024

# Palette — matches web/tailwind.config.ts
BG = (5, 7, 10, 0)         # transparent (BG of consuming surface is #05070A)
SIGNAL = (126, 231, 135)    # #7EE787 phosphor green
SIGNAL_DIM = (63, 169, 72)  # #3FA948
AMBER = (242, 192, 85)      # #F2C055
INK = (16, 20, 27)


def make_logo(transparent: bool = True) -> Image.Image:
    img = Image.new("RGBA", (SIZE, SIZE), BG if transparent else (5, 7, 10, 255))
    draw = ImageDraw.Draw(img, "RGBA")

    # ------------------------------------------------------------------
    # 1. Frame — a fine square graticule like an oscilloscope display.
    # ------------------------------------------------------------------
    if not transparent:
        # subtle inner grid only when we have a solid backdrop
        grid_color = (40, 50, 60, 90)
        step = SIZE // 8
        for i in range(1, 8):
            draw.line([(i * step, 0), (i * step, SIZE)], fill=grid_color, width=2)
            draw.line([(0, i * step), (SIZE, i * step)], fill=grid_color, width=2)

    # corner brackets — instrument-panel chrome detail
    bracket_color = (126, 231, 135, 90)
    inset = int(SIZE * 0.08)
    arm = int(SIZE * 0.10)
    bw = 8
    for cx, cy, dx, dy in [
        (inset, inset, 1, 1),
        (SIZE - inset, inset, -1, 1),
        (inset, SIZE - inset, 1, -1),
        (SIZE - inset, SIZE - inset, -1, -1),
    ]:
        draw.line([(cx, cy), (cx + dx * arm, cy)], fill=bracket_color, width=bw)
        draw.line([(cx, cy), (cx, cy + dy * arm)], fill=bracket_color, width=bw)

    # ------------------------------------------------------------------
    # 2. The mark — a thick Λ built from two slabs.
    # ------------------------------------------------------------------
    cx = SIZE // 2
    apex_y = int(SIZE * 0.22)
    base_y = int(SIZE * 0.82)
    half_base = int(SIZE * 0.28)
    stroke_width = int(SIZE * 0.10)   # thick — readable at 16×16

    left_slab = [
        (cx, apex_y),
        (cx - half_base, base_y),
        (cx - half_base + stroke_width, base_y),
        (cx + stroke_width // 2, apex_y + stroke_width // 2),
    ]
    right_slab = [
        (cx, apex_y),
        (cx + half_base, base_y),
        (cx + half_base - stroke_width, base_y),
        (cx - stroke_width // 2, apex_y + stroke_width // 2),
    ]
    draw.polygon(left_slab, fill=SIGNAL)
    draw.polygon(right_slab, fill=SIGNAL)

    # The base feet — small horizontal stubs that visually anchor the legs.
    foot_h = int(SIZE * 0.025)
    foot_w = int(SIZE * 0.12)
    for x_center in (cx - half_base + stroke_width // 2, cx + half_base - stroke_width // 2):
        draw.rectangle(
            [x_center - foot_w // 2, base_y, x_center + foot_w // 2, base_y + foot_h],
            fill=SIGNAL,
        )

    # ------------------------------------------------------------------
    # 3. The signal — a bright amber dot at the apex with a phosphor halo.
    # ------------------------------------------------------------------
    dot_r = int(SIZE * 0.035)
    # halo (rendered on a temp layer + blurred)
    halo = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    halo_draw = ImageDraw.Draw(halo)
    halo_draw.ellipse(
        [cx - dot_r * 5, apex_y - dot_r * 5, cx + dot_r * 5, apex_y + dot_r * 5],
        fill=(*SIGNAL, 160),
    )
    halo = halo.filter(ImageFilter.GaussianBlur(radius=22))
    img.alpha_composite(halo)

    draw = ImageDraw.Draw(img, "RGBA")
    draw.ellipse(
        [cx - dot_r, apex_y - dot_r, cx + dot_r, apex_y + dot_r],
        fill=AMBER,
    )
    # tiny inner highlight
    draw.ellipse(
        [cx - dot_r // 3, apex_y - dot_r // 3, cx + dot_r // 3, apex_y + dot_r // 3],
        fill=(255, 250, 230),
    )

    # ------------------------------------------------------------------
    # 4. Scan line — a thin amber horizontal stroke across the mid-band
    #    behind the Λ, like an active sweep on an oscilloscope.
    # ------------------------------------------------------------------
    scan_y = int(SIZE * 0.58)
    scan = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    scan_draw = ImageDraw.Draw(scan)
    scan_draw.line(
        [(int(SIZE * 0.18), scan_y), (int(SIZE * 0.82), scan_y)],
        fill=(*AMBER, 140),
        width=int(SIZE * 0.012),
    )
    scan = scan.filter(ImageFilter.GaussianBlur(radius=2.5))
    # composite UNDER the lambda so the slabs interrupt it
    base = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    base.alpha_composite(scan)
    base.alpha_composite(img)
    img = base

    return img


def save_set(out_dir: str):
    os.makedirs(out_dir, exist_ok=True)
    logo = make_logo(transparent=True)
    logo.save(os.path.join(out_dir, "logo.png"))
    # solid backdrop variant — used as the source for OG image
    logo_solid = make_logo(transparent=False)
    logo_solid.save(os.path.join(out_dir, "logo-solid.png"))
    print(f"wrote {out_dir}/logo.png and logo-solid.png  ({SIZE}x{SIZE})")


if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser()
    p.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "build"))
    args = p.parse_args()
    save_set(args.out)

"""Bake the splash-screen logo and glow assets for both themes.

Run from the repo root (mobile/):
    pip install pillow
    python3 scripts/build-splash-assets.py

Reads the existing tagline-free app-icon PNGs, crops each to its tight
bounding box, re-pads both equally (so light/dark center identically),
and bakes a blurred "glow" copy of each using premultiplied alpha so
colours don't darken at the edges. See docs/splash-screen spec for why
the glow is pre-baked rather than done at runtime with RN Image
blurRadius (inconsistent across Android devices).
"""

from PIL import Image, ImageFilter

SRC = {
    "light": "assets/images/app-icon-light-without-tagline.png",
    "dark": "assets/images/app-icon-dark-without-tagline.png",
}
OUT = "assets/images"

for theme, path in SRC.items():
    logo = Image.open(path).convert("RGBA")
    logo = logo.crop(logo.getbbox())
    p = round(logo.width * 0.04)
    tight = Image.new("RGBA", (logo.width + 2 * p, logo.height + 2 * p), (0, 0, 0, 0))
    tight.alpha_composite(logo, (p, p))
    tight.save(f"{OUT}/splash-logo-{theme}.png")

    m = round(logo.width * 0.18)  # extra margin so the blur is not clipped
    g = Image.new("RGBA", (tight.width + 2 * m, tight.height + 2 * m), (0, 0, 0, 0))
    g.alpha_composite(tight, (m, m))
    g = g.convert("RGBa").filter(ImageFilter.GaussianBlur(logo.width * 0.045)).convert("RGBA")
    g.save(f"{OUT}/splash-glow-{theme}.png")

    print(f"{theme}: logo {tight.size}, glow {g.size}")

# Fully transparent placeholder for the native splash (expo-splash-screen
# plugin). Android 12+ draws its own splash icon area with a circular mask;
# an empty image here keeps that area empty so the wide wordmark is never
# cropped by it. The real brand visuals live entirely in AppSplash.
blank = Image.new("RGBA", (200, 200), (0, 0, 0, 0))
blank.save(f"{OUT}/splash-blank.png")
print("blank: splash-blank.png (200, 200)")

# Regenerates every public brand asset from the retained master
# (src/assets/brand/favicon-master.png, 1024x1024 RGBA). Deterministic:
# same master in -> byte-stable assets out (Pillow LANCZOS resampling,
# optimize=True). Run only when the master artwork itself changes, then
# re-run node scripts/test-brand-asset-ownership.mjs.
#
# Requires: Python 3 + Pillow (not an npm dependency by design — this is a
# rare, manual asset-regeneration step, not part of the build).
# Run: python scripts/generation/generate-brand-assets.py
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MASTER = os.path.join(ROOT, "src", "assets", "brand", "favicon-master.png")
PUBLIC = os.path.join(ROOT, "public")

# Badge core (alpha >= 128) spans (144,104)-(894,845) in the 1024px master;
# icon variants crop to an 820px square centered on that core so the badge
# stays legible at 16x16 instead of drowning in the outer glow. The og-image
# keeps the full canvas (glow included) because there is room at 630px.
ICON_CROP = (109, 64, 929, 884)

master = Image.open(MASTER).convert("RGBA")
assert master.size == (1024, 1024), f"unexpected master size {master.size}"
badge = master.crop(ICON_CROP)


def save_png(im, name, **kw):
    dest = os.path.join(PUBLIC, name)
    im.save(dest, "PNG", optimize=True, **kw)
    print(f"{name}: {os.path.getsize(dest)} bytes {im.size} {im.mode}")


# Browser favicon (declared in index.html; path also pinned by the tracked
# Worker client-asset manifests — do not rename without updating both).
save_png(badge.resize((96, 96), Image.LANCZOS), "favicon.png")

# Implicit /favicon.ico fallback (no <link> declares it; legacy agents and
# direct requests rely on the conventional root path).
badge.resize((48, 48), Image.LANCZOS).save(
    os.path.join(PUBLIC, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)]
)
print(f"favicon.ico: {os.path.getsize(os.path.join(PUBLIC, 'favicon.ico'))} bytes")

# Apple touch icon: iOS composites onto black, so flatten explicitly to keep
# the render deterministic across contexts.
apple = Image.new("RGB", (180, 180), (0, 0, 0))
resized = badge.resize((180, 180), Image.LANCZOS)
apple.paste(resized, (0, 0), resized)
save_png(apple, "apple-touch-icon.png")

# Social preview: full artwork (glow intact) centered on a 1200x630 black
# canvas — the glow fades to black so the extension is seamless. Opaque by
# design: social platforms render PNG alpha unpredictably.
og = Image.new("RGB", (1200, 630), (0, 0, 0))
square = master.resize((630, 630), Image.LANCZOS)
og.paste(square, ((1200 - 630) // 2, 0), square)
save_png(og, "og-image.png")

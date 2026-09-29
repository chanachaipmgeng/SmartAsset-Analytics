"""Generated placeholder photos for demo data (no binary assets in the repo)."""

import io
import random

from PIL import Image, ImageDraw, ImageFont

Color = tuple[int, int, int]

PALETTE: list[Color] = [
    (79, 70, 229),
    (14, 116, 144),
    (190, 24, 93),
    (21, 128, 61),
    (194, 65, 12),
    (109, 40, 217),
    (3, 105, 161),
    (161, 98, 7),
]


def _font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    return ImageFont.load_default(size=size)


def _png(image: Image.Image) -> bytes:
    out = io.BytesIO()
    image.save(out, format="PNG", optimize=True)
    return out.getvalue()


def _mix(a: Color, b: Color, t: float) -> Color:
    return (round(a[0] + (b[0] - a[0]) * t), round(a[1] + (b[1] - a[1]) * t), round(a[2] + (b[2] - a[2]) * t))


def _gradient(size: tuple[int, int], top: Color, bottom: Color) -> Image.Image:
    width, height = size
    image = Image.new("RGB", size, top)
    draw = ImageDraw.Draw(image)
    for y in range(height):
        draw.line([(0, y), (width, y)], fill=_mix(top, bottom, y / max(1, height - 1)))
    return image


def _terminal(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], accent: Color, label: str) -> None:
    """A wall-mounted face/fingerprint terminal: body, screen, sensor and a serial sticker."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    draw.rounded_rectangle(box, radius=w // 8, fill=(38, 38, 44), outline=(20, 20, 24), width=4)
    screen = (x0 + w * 0.1, y0 + h * 0.08, x1 - w * 0.1, y0 + h * 0.55)
    draw.rounded_rectangle(screen, radius=w // 20, fill=_mix(accent, (255, 255, 255), 0.35))
    cx, cy = (screen[0] + screen[2]) / 2, (screen[1] + screen[3]) / 2
    r = w * 0.14
    draw.ellipse((cx - r, cy - r * 1.2, cx + r, cy + r * 1.2), outline=(255, 255, 255), width=5)
    sensor = (x0 + w * 0.32, y0 + h * 0.64, x1 - w * 0.32, y0 + h * 0.84)
    draw.rounded_rectangle(sensor, radius=w // 16, fill=(70, 70, 80), outline=accent, width=3)
    draw.text((x0 + w / 2, y1 - h * 0.06), label, fill=(210, 210, 215), font=_font(max(10, w // 14)), anchor="mm")


def model_image(brand: str, name: str, seed: int) -> bytes:
    rng = random.Random(seed)
    accent = rng.choice(PALETTE)
    image = _gradient((900, 900), (250, 250, 252), (228, 230, 236))
    draw = ImageDraw.Draw(image)
    draw.ellipse((250, 760, 650, 820), fill=(205, 207, 214))
    _terminal(draw, (300, 150, 600, 780), accent, brand.upper())
    draw.text((450, 70), f"{brand} {name}", fill=(40, 40, 48), font=_font(42), anchor="mm")
    return _png(image)


def avatar(initials: str, seed: int) -> bytes:
    rng = random.Random(seed)
    color = rng.choice(PALETTE)
    image = _gradient((480, 480), _mix(color, (255, 255, 255), 0.15), _mix(color, (0, 0, 0), 0.25))
    draw = ImageDraw.Draw(image)
    draw.ellipse((150, 80, 330, 260), fill=_mix(color, (255, 255, 255), 0.55))
    draw.ellipse((70, 280, 410, 620), fill=_mix(color, (255, 255, 255), 0.55))
    draw.text((240, 440), initials.upper()[:2], fill=(255, 255, 255), font=_font(96), anchor="mm")
    return _png(image)


def device_photo(serial: str, seed: int, *, damaged: bool = False) -> bytes:
    """Bench photo of one unit; `damaged` adds cracks and a warning tag (repair / failed QC evidence)."""
    rng = random.Random(seed)
    accent = rng.choice(PALETTE)
    desk = rng.choice([(186, 160, 128), (150, 150, 158), (205, 190, 168)])
    image = _gradient((1024, 768), _mix(desk, (255, 255, 255), 0.3), desk)
    draw = ImageDraw.Draw(image)
    tilt = rng.randint(-40, 40)
    _terminal(draw, (380 + tilt, 110, 640 + tilt, 660), accent, serial)
    if damaged:
        x, y = 470 + tilt, 190
        for _ in range(5):
            nx, ny = x + rng.randint(-45, 45), y + rng.randint(15, 55)
            draw.line([(x, y), (nx, ny)], fill=(250, 250, 250), width=3)
            x, y = nx, ny
        draw.rounded_rectangle((720, 80, 960, 150), radius=14, fill=(220, 38, 38))
        draw.text((840, 115), "REPAIR", fill=(255, 255, 255), font=_font(40), anchor="mm")
    draw.text((24, 740), serial, fill=(30, 30, 30), font=_font(22), anchor="lm")
    return _png(image)


def site_photo(serial: str, seed: int) -> bytes:
    """A unit mounted by a door at the customer's site."""
    rng = random.Random(seed)
    accent = rng.choice(PALETTE)
    wall = rng.choice([(236, 232, 224), (214, 222, 230), (230, 220, 210), (222, 230, 216)])
    image = _gradient((1024, 768), _mix(wall, (255, 255, 255), 0.4), wall)
    draw = ImageDraw.Draw(image)
    door_x = rng.randint(80, 200)
    draw.rectangle((door_x, 90, door_x + 330, 768), fill=_mix(wall, (90, 70, 50), 0.6), outline=(60, 50, 40), width=6)
    draw.ellipse((door_x + 280, 420, door_x + 306, 446), fill=(200, 180, 90))
    draw.rectangle((0, 700, 1024, 768), fill=_mix(wall, (0, 0, 0), 0.35))
    _terminal(draw, (620, 250, 780, 560), accent, serial[-6:])
    draw.rectangle((690, 560, 710, 700), fill=(170, 170, 176))
    return _png(image)

import math
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "icons")
os.makedirs(OUT, exist_ok=True)

CORAL = (255, 90, 54, 255)
WHITE = (255, 255, 255, 255)
GOLD = (255, 209, 102, 255)


def write_png(path, width, height, pixels):
    raw = b"".join(b"\x00" + pixels[y * width * 4 : (y + 1) * width * 4] for y in range(height))

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as handle:
        handle.write(png)


def rounded_rect(px, py, x, y, w, h, r):
    dx = abs(px - (x + w / 2)) - (w / 2 - r)
    dy = abs(py - (y + h / 2)) - (h / 2 - r)
    ox, oy = max(dx, 0), max(dy, 0)
    inside = min(max(dx, dy), 0)
    return math.hypot(ox, oy) + inside - r


def render(size):
    pixels = bytearray(size * size * 4)
    s = size / 512

    bars = [
        (96 * s, 292 * s, 72 * s, 124 * s, 22 * s),
        (196 * s, 220 * s, 72 * s, 196 * s, 22 * s),
        (296 * s, 148 * s, 72 * s, 268 * s, 22 * s),
    ]
    circle = (384 * s, 112 * s, 36 * s)

    for y in range(size):
        for x in range(size):
            color = CORAL
            for bx, by, bw, bh, br in bars:
                if rounded_rect(x + 0.5, y + 0.5, bx, by, bw, bh, br) <= 0:
                    color = WHITE
                    break
            cx, cy, cr = circle
            if math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= cr:
                color = GOLD
            i = (y * size + x) * 4
            pixels[i : i + 4] = bytes(color)
    return pixels


for size in (180, 192, 512):
    write_png(os.path.join(OUT, f"icon-{size}.png"), size, size, render(size))
    print(f"wrote icon-{size}.png")

"""Generate platform icons and installer artwork from the owned SVG logo.

Optional asset tooling: CairoSVG and Pillow. No build-time dependency.
"""
from io import BytesIO
from pathlib import Path

import cairosvg
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SVG = ROOT/'frontend/public/bible.svg'


def logo(size):
    return Image.open(BytesIO(cairosvg.svg2png(url=str(SVG), output_width=size, output_height=size))).convert('RGBA')


def main():
    icon = logo(1024)
    icon.save(ROOT/'build/appicon.png')
    icon.save(ROOT/'build/windows/icon.ico', sizes=[(n, n) for n in [16, 24, 32, 48, 64, 128, 256]])
    icon.save(ROOT/'build/darwin/icons.icns')
    welcome = Image.new('RGB', (164, 314), '#1e4b66')
    welcome.paste(logo(116), (24, 44), logo(116))
    draw = ImageDraw.Draw(welcome)
    font = ImageFont.load_default(size=24)
    small = ImageFont.load_default(size=12)
    draw.text((82, 181), 'BIBLE', anchor='mt', font=font, fill='white')
    draw.line((49, 223, 115, 223), fill='#edc575', width=3)
    draw.text((82, 245), 'OFFLINE READER', anchor='mt', font=small, fill='#d4e0e7')
    welcome.save(ROOT/'build/windows/welcome.bmp')
    header = Image.new('RGB', (150, 57), 'white')
    header.paste(logo(46), (99, 5), logo(46))
    header.save(ROOT/'build/windows/header.bmp')


if __name__ == '__main__':
    main()

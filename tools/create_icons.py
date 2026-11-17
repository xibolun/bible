"""Regenerate the product-owned icon (optional tooling: Pillow 12.x).

Run wails3 generate icons afterwards to create platform icon bundles.
"""
from pathlib import Path
from PIL import Image, ImageDraw

root=Path(__file__).resolve().parents[1]
image=Image.new('RGBA',(1024,1024),(0,0,0,0))
draw=ImageDraw.Draw(image)
draw.rounded_rectangle((64,32,960,992),radius=160,fill='#1e4b66')
draw.line((512,296,512,696),fill='white',width=56)
draw.line((360,424,664,424),fill='white',width=56)
draw.line((200,880,824,880),fill='#aec8d3',width=32)
image.save(root/'build/appicon.png')

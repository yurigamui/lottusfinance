# Uso: python3 toWebp.py entrada.png saida.webp  (reduz de 3200x2000 para 1600x1000, qualidade 82)
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
if im.width != 1600: im = im.resize((1600, 1000), Image.LANCZOS)
im.save(sys.argv[2], 'WEBP', quality=int(sys.argv[3]) if len(sys.argv) > 3 else 82, method=6)

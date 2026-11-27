# Compara duas pastas de capturas pixel a pixel (AC27). Uso: python3 cmp-capturas.py <antes> <depois>
import sys, os
from PIL import Image, ImageChops
import numpy as np
a_dir, b_dir = sys.argv[1], sys.argv[2]
diffs = 0
names = sorted(os.listdir(a_dir))
for f in names:
    a = Image.open(os.path.join(a_dir, f)).convert('RGB'); b = Image.open(os.path.join(b_dir, f)).convert('RGB')
    if a.size != b.size: print('TAMANHO DIFERENTE', f, a.size, b.size); diffs += 1; continue
    d = np.array(ImageChops.difference(a, b)).sum(axis=2)
    if d.any():
        ys, xs = np.nonzero(d); diffs += 1
        print('DIFERE', f, 'pixels', len(ys), 'caixa', (xs.min(), ys.min(), xs.max(), ys.max()), 'desvio máx', int(d.max()))
print(f'{len(names) - diffs} de {len(names)} capturas idênticas pixel a pixel')

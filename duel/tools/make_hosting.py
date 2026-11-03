"""Zip for Firebase Hosting: hosting/ (config, upload scripts, instructions) + publish/index.html as public/index.html.

Run after publish/build.py. Output: hosting/duelo-firebase.zip (not committed).
"""
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
out = ROOT / 'hosting' / 'duelo-firebase.zip'
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for name in ['firebase.json', 'LEEME.txt', 'subir-windows.bat', 'subir-mac-linux.command']:
        info = zipfile.ZipInfo(f'duelo-firebase/{name}')
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = (0o755 if name.endswith('.command') else 0o644) << 16
        z.writestr(info, (ROOT / 'hosting' / name).read_bytes())
    z.write(ROOT / 'publish' / 'index.html', 'duelo-firebase/public/index.html')
print(out, out.stat().st_size // 1024, 'KB')

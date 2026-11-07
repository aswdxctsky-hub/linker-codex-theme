"""Build theme assets and an integrity manifest with the system Python (3.9+)."""
from pathlib import Path
import hashlib, json, runpy

root = Path(__file__).resolve().parent
integration = root.parent
runpy.run_path(str(integration / 'build.py'), run_name='__main__')
files = ['bundle/runtime.js', 'bundle/media.json', 'pipe-client.mjs',
         'media-delivery.mjs', 'compatibility.mjs', 'macos/context.mjs',
         'macos/compatibility.mjs', 'macos/compatibility.json', 'macos/launcher.mjs']
manifest = {'schema': 1, 'files': {name: hashlib.sha256((integration / name).read_bytes()).hexdigest() for name in files}}
(root / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'mac_manifest_files': len(files)}))

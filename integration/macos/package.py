"""Create a local .app launcher; never patch or resign the official application."""
from pathlib import Path
import argparse, json, plistlib, runpy, shutil, subprocess

root = Path(__file__).resolve().parent
repo = root.parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--app', default='/Applications/ChatGPT.app')
parser.add_argument('--output', default=str(repo / 'release' / 'ChatGPT 主题.app'))
parser.add_argument('--dmg', action='store_true')
args = parser.parse_args()
official = Path(args.app).resolve()
info = plistlib.loads((official / 'Contents/Info.plist').read_bytes())
if info.get('CFBundleIdentifier') != 'com.openai.codex':
    raise SystemExit('Expected the official com.openai.codex application')
runpy.run_path(str(root / 'build.py'), run_name='__main__')
out = Path(args.output).resolve()
if out.exists():
    old_info = out / 'Contents/Info.plist'
    if not old_info.is_file() or plistlib.loads(old_info.read_bytes()).get('CFBundleIdentifier') != 'local.linker.codex-theme':
        raise SystemExit('Refusing to replace a bundle not created by this project')
    shutil.rmtree(out)
resources = out / 'Contents/Resources'
macos = out / 'Contents/MacOS'
resources.mkdir(parents=True)
macos.mkdir()
manifest = json.loads((root / 'manifest.json').read_text())
for name in [*manifest['files'], 'macos/manifest.json']:
    target = resources / 'integration' / name
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(root.parent / name, target)
shutil.copy2(official / 'Contents/Resources/electron.icns', resources / 'Theme.icns')
shutil.copy2(repo / 'concept-v4/THIRD-PARTY-NOTICES.md', resources / 'THIRD-PARTY-NOTICES.md')
(out / 'Contents/Info.plist').write_bytes(plistlib.dumps({
    'CFBundleIdentifier': 'local.linker.codex-theme',
    'CFBundleName': 'ChatGPT 主题', 'CFBundleDisplayName': 'ChatGPT 主题',
    'CFBundleExecutable': 'Linker', 'CFBundlePackageType': 'APPL',
    'CFBundleShortVersionString': '0.1.0', 'CFBundleVersion': '1',
    'CFBundleIconFile': 'Theme', 'LSUIElement': True,
    'LSMinimumSystemVersion': '13.0', 'NSHighResolutionCapable': True,
}))
entry = macos / 'Linker'
entry.write_text('''#!/bin/sh
set -eu
resources=$(CDPATH= cd -- "$(dirname -- "$0")/../Resources" && pwd)
official=""
for candidate in "${LINKER_OFFICIAL_APP:-/Applications/ChatGPT.app}" /Applications/Codex.app "$HOME/Applications/ChatGPT.app" "$HOME/Applications/Codex.app"; do
  if [ -f "$candidate/Contents/Info.plist" ] && [ "$(/usr/bin/plutil -extract CFBundleIdentifier raw -o - "$candidate/Contents/Info.plist" 2>/dev/null)" = com.openai.codex ]; then
    official=$candidate
    break
  fi
done
if [ -z "$official" ]; then
  /usr/bin/osascript -e 'display alert "未找到 ChatGPT" message "请先安装官方 ChatGPT / Codex 应用。"'
  exit 1
fi
runtime="$official/Contents/Resources/cua_node/bin/node"
if [ ! -x "$runtime" ]; then
  /usr/bin/open "$official"
  /usr/bin/osascript -e 'display alert "已打开原版" message "当前应用没有主题需要的运行环境，请更新主题适配。"'
  exit 0
fi
case "${1:-}" in -psn_*) shift ;; esac
exec "$runtime" "$resources/integration/macos/launcher.mjs" --app "$official" "$@"
''', encoding='utf-8')
entry.chmod(0o755)
subprocess.run(['/usr/bin/codesign', '--force', '--sign', '-', str(out)], check=True)
subprocess.run(['/usr/bin/codesign', '--verify', '--strict', str(out)], check=True)
readme = out.parent / '使用说明.txt'
readme.write_text('''ChatGPT 主题 · Mac 测试版 0.1.0

1. 用 ⌘Q 完全退出正在运行的 ChatGPT。
2. 双击「ChatGPT 主题.app」。开场后进入原来的应用与账户。
3. 开场右下角「原版」会立即恢复并保持停用。
   也可用主题菜单或 ⌘⌥⇧L 恢复。
4. 此版本不会替换 Dock、官方应用或登录项。
   直接点击官方图标仍按官方方式启动。

首次正式账户效果仍需实机验收。隔离测试、版本及限制见仓库 docs/MAC_STATUS.md。
主题资料位于 ~/Library/Application Support/Linker/CodexTheme/。
应用升级后，未通过兼容检查的版本会打开原版。
''', encoding='utf-8')
if args.dmg:
    stage = out.parent / 'dmg-staging'
    if stage.exists():
        raise SystemExit('Remove or choose a different existing dmg-staging directory before packaging')
    stage.mkdir()
    try:
        shutil.copytree(out, stage / out.name)
        shutil.copy2(readme, stage / readme.name)
        dmg = out.parent / 'ChatGPT-主题-macOS-0.1.0.dmg'
        subprocess.run(['/usr/bin/hdiutil', 'create', '-volname', 'ChatGPT 主题', '-srcfolder', str(stage), '-ov', '-format', 'UDZO', str(dmg)], check=True)
    finally:
        shutil.rmtree(stage)
print(json.dumps({'app': str(out)}, ensure_ascii=False))

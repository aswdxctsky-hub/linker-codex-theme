from pathlib import Path
import re,json,base64
root=Path(__file__).resolve().parent
source=root.parent/'concept-v4'
out=root/'bundle';out.mkdir(exist_ok=True)
app=(source/'app.js').read_text(encoding='utf-8')
stages=app[app.index('const stages=['):app.index('const ENTRY=')]
permissions=re.search(r'const permissions=.*?;\n',app).group(0)
drawing=app[app.index('function text('):app.index('function roundRect(')]
template=(root/'runtime.template.js').read_text(encoding='utf-8')
surfaces=(root/'shell-surfaces.css').read_text(encoding='utf-8')
for marker,code in [('/*__STAGES__*/',stages),('/*__PERMISSIONS__*/',permissions),('/*__DRAWING__*/',drawing),('/*__SHELL_SURFACES__*/',surfaces)]:
    assert template.count(marker)==1
    template=template.replace(marker,code)
assert 'function drawChat' not in template and 'composer' not in template.split('function startIntro')[1]
(out/'runtime.js').write_text(template,encoding='utf-8')
def data(name,mime):return 'data:'+mime+';base64,'+base64.b64encode((source/name).read_bytes()).decode()
images={k:data(name,mime) for k,name,mime in [('background','assets/pearl-space.png','image/png'),('portrait','assets/dragon-greeting.png','image/png'),('logo','assets/gpt-official-light.png','image/png'),('video','assets/dragon-greeting.mp4','video/mp4'),('videoEn','assets/dragon-greeting-en.mp4','video/mp4')]}
cues=json.loads((source/'audio/cues.json').read_text(encoding='utf-8'))
voices={c['language']+'_'+c['id']:data(c['file'],'audio/wav') for c in cues}
for lang in ['zh','en']:voices[lang+'_performance']=data(f'audio/{lang}/dragon-performance.wav','audio/wav')
(out/'media.json').write_text(json.dumps({'images':images,'voices':voices}),encoding='utf-8')
print(json.dumps({'runtime_bytes':(out/'runtime.js').stat().st_size,'media_bytes':(out/'media.json').stat().st_size}))

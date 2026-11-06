"""Build an offline preview with both voice packs and both character performances."""
from pathlib import Path
import json,base64
root=Path(__file__).resolve().parent
def data(path,mime):
    return 'data:'+mime+';base64,'+base64.b64encode((root/path).read_bytes()).decode()
images={
 'background':data('assets/pearl-space.png','image/png'),
 'portrait':data('assets/dragon-greeting.png','image/png'),
 'logo':data('assets/gpt-official-light.png','image/png'),
 'video':data('assets/dragon-greeting.mp4','video/mp4'),
 'videoEn':data('assets/dragon-greeting-en.mp4','video/mp4'),
}
cues=json.loads((root/'audio/cues.json').read_text(encoding='utf-8'))
voices={c['language']+'_'+c['id']:data(c['file'],'audio/wav') for c in cues}
for language in ['zh','en']:
    voices[language+'_performance']=data(f'audio/{language}/dragon-performance.wav','audio/wav')
page=(root/'preview.template.html').read_text(encoding='utf-8')
page=page.replace('/*__MEDIA__*/','window.MEDIA='+json.dumps({'images':images,'voices':voices,'cues':cues})+';')
page=page.replace('/*__APP__*/',(root/'app.js').read_text(encoding='utf-8'))
(root/'preview.html').write_text(page,encoding='utf-8')
print(json.dumps({'bytes':(root/'preview.html').stat().st_size,'voice_cues':len(voices),'character_languages':['zh','en']}))

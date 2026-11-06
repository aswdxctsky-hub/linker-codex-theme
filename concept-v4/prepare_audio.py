"""Rebuild bilingual voice packs, retaining the untouched synthesis originals."""
from pathlib import Path
import argparse, json, shutil, subprocess, wave

root=Path(__file__).resolve().parent
parser=argparse.ArgumentParser()
parser.add_argument('--ffmpeg',default=shutil.which('ffmpeg'))
args=parser.parse_args()
if not args.ffmpeg: parser.error('Supply --ffmpeg PATH')

clips={
'zh':[
 ('access',0,2.91,'连接已建立。等待访问许可。'),
 ('iris',2.94,4.43,'启动虹膜扫描。'),
 ('identity',4.58,7.62,'身份匹配，Skyler。请确认登录。'),
 ('request',7.79,9.48,'访问请求已接收。'),
 ('permissions',9.97,11.90,'正在读取会话权限。'),
 ('verified',12,14.62,'核验完成。访问权限已解锁。'),
 ('session',14.66,16.22,'会话已建立。'),
],
'en':[
 ('access',0,3.78,'Connection established. Awaiting access clearance.'),
 ('iris',3.80,5.90,'Initiating iris scan.'),
 ('identity',5.96,9.77,'Identity matched. Skyler. Confirm login.'),
 ('request',9.78,11.55,'Access request received.'),
 ('permissions',11.57,13.34,'Reading session permissions.'),
 ('verified',13.35,16.40,'Verification complete. Access unlocked.'),
 ('session',16.41,18.29,'Session established.'),
 ('greeting',18.48,21.368163265306123,'Welcome back, Skyler. Good to see you again.'),
]}
manifest=[]
for language,parts in clips.items():
    source=root/'audio'/language/('speech-original.wav' if language=='zh' else 'speech-original.mp3')
    for name,start,end,spoken in parts:
        output=root/'audio'/language/(name+'.wav')
        base=['-y','-v','error','-ss',str(start),'-t',str(end-start),'-i',str(source)]
        if name=='greeting':
            effects=['-af',f'afade=t=in:d=0.005,afade=t=out:st={end-start-.025}:d=0.025,alimiter=limit=0.9:level=0']
        else:
            # A parallel dry path retains consonants; the ring/chorus path supplies the unmistakable machine timbre.
            filters=(
              '[0:a]highpass=f=170,lowpass=f=5700,equalizer=f=2100:t=q:w=0.9:g=2,asplit=2[dry][wet];'
              '[dry]volume=0.58[d];'
              '[wet]aeval=val(0)*(0.28+0.72*sin(2*PI*74*t)),'
              'chorus=0.6:0.75:7|11:0.24|0.16:0.15|0.19:1.2|1.5,volume=0.82[w];'
              '[d][w]amix=inputs=2:normalize=0,aecho=0.8:0.88:23|47:0.23|0.10,'
              'apad=pad_dur=0.045,loudnorm=I=-17:TP=-2.8:LRA=7,'
              f'afade=t=in:d=0.005,afade=t=out:st={end-start+.045}:d=0.035[out]')
            effects=['-filter_complex',filters,'-map','[out]']
        subprocess.run([args.ffmpeg,*base,*effects,'-ar','48000','-ac','1','-c:a','pcm_s16le',str(output)],check=True)
        with wave.open(str(output)) as f: duration=f.getnframes()/f.getframerate()
        manifest.append({'id':name,'language':language,'text':spoken,'source_start':start,'source_end':end,'duration':duration,'file':f'audio/{language}/{name}.wav','effect':'original' if name=='greeting' else 'ring-74hz-chorus-dual-delay','speed':1.0})

subprocess.run([args.ffmpeg,'-y','-v','error','-i',str(root/'audio/en/greeting.wav'),'-af','adelay=2500,apad=whole_dur=8','-t','8','-ar','48000','-ac','1',str(root/'audio/en/dragon-performance.wav')],check=True)
english_video=root/'assets/dragon-greeting-en.mp4'
if english_video.exists():
    subprocess.run([args.ffmpeg,'-y','-v','error','-i',str(english_video),'-vn','-ar','48000','-ac','1','-c:a','pcm_s16le',str(root/'audio/en/dragon-performance.wav')],check=True)
(root/'audio/cues.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'cues':len(manifest),'english_greeting_bytes':(root/'audio/en/dragon-performance.wav').stat().st_size}))

(function mountLinker(payload){
'use strict';
if(location.protocol!=='app:'||location.hostname!=='-'||location.pathname!=='/index.html'||window.top!==window)return {ignored:true};
if(window.__linkerThemeV4)return window.__linkerThemeV4.status();
const MEDIA=payload.media,doc=document,token=payload.binding;
const isMac=payload.platform==='darwin';
const uiFont=isMac?'-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif':'"Segoe UI","Microsoft YaHei",sans-serif';
let config={language:'zh',sound:true,...payload.config},disposed=false,introCleanup=null,lastIntroResult=null;
const waiters=new Map();
function asset(group,key){
 if(MEDIA[group]?.[key])return Promise.resolve(MEDIA[group][key]);
 if(!payload.streaming||disposed)return Promise.reject(Error('Media unavailable'));
 const id=group+'.'+key;
 if(!waiters.has(id)){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});const timer=setTimeout(()=>{waiters.delete(id);reject(Error('Media delivery timeout'));},20000);waiters.set(id,{promise,resolve,reject,timer});}
 return waiters.get(id).promise;
}
function loadMedia(pack){if(disposed)return false;for(const group of ['images','voices'])for(const [key,value] of Object.entries(pack[group]||{})){MEDIA[group][key]=value;const id=group+'.'+key,w=waiters.get(id);if(w){clearTimeout(w.timer);w.resolve(value);waiters.delete(id);}}return true;}
function failMedia(){for(const w of waiters.values()){clearTimeout(w.timer);w.reject(Error('Media delivery stopped'));}waiters.clear();introCleanup?.('media-error');}
const oldAttribute=doc.documentElement.getAttribute('data-linker-pearl');
function send(action,value){try{window[token]?.(JSON.stringify({action,value}));}catch{}}
const theme=doc.createElement('style');theme.id='linker-pearl-v4-style';
theme.textContent=`
html[data-linker-pearl="v4"]{color-scheme:light!important;--color-text-primary:#263440!important;--color-text-secondary:#647c8c!important;--color-text-tertiary:#7b929f!important;--color-text-foreground:#263440!important;--app-color-text-foreground:#263440!important;--app-color-text-foreground-secondary:#647c8c!important;--color-token-text-primary:#263440!important;--color-token-text-secondary:#647c8c!important;--app-color-background-shell:transparent!important;--app-color-background-surface:transparent!important;--app-color-background-surface-under:rgba(245,248,251,.58)!important;--color-token-main-surface-primary:transparent!important;--color-token-main-surface-secondary:rgba(244,248,252,.76)!important;--color-token-bg-primary:transparent!important;--color-token-side-bar-background:rgba(242,247,251,.72)!important;--chat-background-color:transparent!important;--color-background-composer-surface:rgba(255,255,255,.83)!important;--color-background-composer-action-bar:rgba(244,248,252,.9)!important;--color-background-elevated-primary:#f9fbfd!important;--color-background-elevated-secondary:#f4f8fc!important;--color-surface:#f8fbfd!important;--color-surface-card:#f8fbfd!important;--color-surface-elevated:rgba(252,254,255,.98)!important;--color-surface-elevated-secondary:#f5f9fc!important;--app-color-background-application-menu:#f7fafc!important;--app-color-foreground-application-menu:#263440!important;--color-token-input-border:rgba(153,180,197,.45)!important;--color-border:rgba(137,164,180,.22)!important;--color-border-strong:rgba(137,164,180,.38)!important;--color-token-border-default:rgba(137,164,180,.22)!important;--app-shell-sidebar-divider:rgba(137,164,180,.2)!important;--color-codex-terminal-background:#f5f9fc!important;--color-codex-terminal-foreground:#263440!important;--codeblock-background-color:#f2f7fb!important;--color-codex-editor-inline-code-background:#edf4f9!important;--color-background-user-message:rgba(218,233,243,.65)!important;--user-message-background-color:rgba(218,233,243,.65)!important;}
html[data-linker-pearl="v4"] body{background-color:#f5f8fb!important;background-image:url("${MEDIA.images.background}")!important;background-position:center!important;background-size:cover!important;background-repeat:no-repeat!important;background-attachment:fixed!important;}
html[data-linker-pearl="v4"] #root{background:transparent!important;}
html[data-linker-pearl="v4"] #root .bg-surface.h-full{background-color:transparent!important;}
/*__SHELL_SURFACES__*/
`;
doc.head.append(theme);doc.documentElement.setAttribute('data-linker-pearl','v4');
const host=doc.createElement('div');host.id='linker-pearl-v4-controls';host.style.cssText='position:fixed;right:14px;bottom:14px;z-index:2147483000;-webkit-app-region:no-drag;';
const panel=host.attachShadow({mode:'closed'});
panel.innerHTML=`<style>:host{font:12px ${uiFont};color:#35505f}*{box-sizing:border-box}button{font:inherit;color:inherit;cursor:pointer;border:0;background:transparent}button:focus-visible{outline:2px solid #77aec1;outline-offset:3px}[hidden]{display:none!important}.toggle{padding:7px 12px;border:1px solid #b9cbd76b;border-radius:5px;background:#f7fbfdde;backdrop-filter:blur(12px)}small{font-size:9px;color:#7c929f;margin-left:6px}.menu{position:absolute;bottom:41px;right:0;width:182px;padding:8px;border:1px solid #c8d7e2;border-radius:7px;background:#f9fcff;box-shadow:0 10px 35px #243f5814}.menu button{display:block;width:100%;padding:10px;text-align:left;border-radius:3px}.menu button:hover{background:#e7f0f6}.lang{display:flex;justify-content:space-between;padding:6px 9px;align-items:center}.lang button{width:auto;padding:6px 9px}.lang button[aria-pressed=true]{background:#e0edf4}.rule{border-top:1px solid #dde7ed;margin:5px 0}</style><div class="menu" id="menu" hidden><div class="lang"><span>音声<small>Voice</small></span><button id="zh" aria-pressed="true">中</button><button id="en" aria-pressed="false">EN</button></div><button id="sound">声音：开<small>Sound on</small></button><button id="replay">重播开场<small>Replay</small></button><div class="rule"></div><button id="restore">恢复原界面<small>Restore</small></button></div><button class="toggle" id="toggle" aria-expanded="false">主题<small>Theme</small></button>`;
doc.body.append(host);
function sync(){for(const lang of ['zh','en'])panel.getElementById(lang).setAttribute('aria-pressed',String(config.language===lang));panel.getElementById('sound').innerHTML=(config.sound?'声音：开':'声音：关')+'<small>'+(config.sound?'Sound on':'Sound off')+'</small>';}
function setLanguage(lang){config.language=lang;sync();send('language',lang);}
panel.getElementById('toggle').onclick=()=>{const m=panel.getElementById('menu');m.hidden=!m.hidden;panel.getElementById('toggle').setAttribute('aria-expanded',String(!m.hidden));};
for(const lang of ['zh','en'])panel.getElementById(lang).onclick=()=>setLanguage(lang);
panel.getElementById('sound').onclick=()=>{config.sound=!config.sound;sync();send('sound',config.sound);};
panel.getElementById('replay').onclick=()=>{panel.getElementById('menu').hidden=true;startIntro();};
panel.getElementById('restore').onclick=()=>{send('enabled',false);controller.dispose();};
const emergency=e=>{if((isMac?e.metaKey:e.ctrlKey)&&e.altKey&&e.shiftKey&&e.code==='KeyL'){e.preventDefault();send('enabled',false);controller.dispose();}};
doc.addEventListener('keydown',emergency,true);
const controller={loadMedia,failMedia,status:()=>({installed:!disposed,version:4,intro:!!introCleanup,introStage:doc.getElementById('linker-pearl-v4-intro')?.dataset.stage||null,lastIntroResult,language:config.language}),update(next){config={...config,...next};sync();},replay:()=>startIntro(),dispose(){if(disposed)return;disposed=true;introCleanup?.();failMedia();theme.remove();host.remove();doc.removeEventListener('keydown',emergency,true);if(oldAttribute===null)doc.documentElement.removeAttribute('data-linker-pearl');else doc.documentElement.setAttribute('data-linker-pearl',oldAttribute);delete window.__linkerThemeV4;}};
window.__linkerThemeV4=controller;sync();
async function startIntro(){
 if(disposed)return;introCleanup?.();panel.getElementById('menu').hidden=true;host.hidden=true;
 const previouslyFocused=doc.activeElement,overlay=doc.createElement('div');overlay.id='linker-pearl-v4-intro';overlay.style.cssText='position:fixed;inset:40px 0 0;z-index:2147482999;overflow:hidden;background:#f5f8fb;-webkit-app-region:no-drag;';doc.body.append(overlay);
 const shadow=overlay.attachShadow({mode:'closed'}),$=id=>shadow.getElementById(id);
 shadow.innerHTML=`<style>:host{font-family:${uiFont};color:#263440}*{box-sizing:border-box}[hidden]{display:none!important}button{font:inherit;color:inherit;cursor:pointer}button:focus-visible{outline:2px solid #77aec1;outline-offset:3px}#viewport{position:absolute;left:50%;top:50%;width:1920px;height:1080px;transform:translate(-50%,-50%) scale(var(--scale));transform-origin:center}canvas{display:block;width:1920px;height:1080px}.hit{position:absolute;left:784px;top:752px;width:352px;height:82px;opacity:0;border:0}.language-controls{position:absolute;right:27px;top:23px;display:flex;align-items:center;gap:12px;transition:opacity .4s}.voice-label{display:flex;flex-direction:column;gap:2px;font-size:11px;color:#6c8492}.voice-label small{font-size:9px;color:#8ba0ac}.language-switch{display:flex;border:1px solid #b9c9d369;border-radius:5px;padding:3px;background:#ffffff7a;backdrop-filter:blur(12px)}.language-switch button{border:0;background:none;min-width:35px;height:29px;border-radius:3px;font-size:11px;color:#8196a3}.language-switch button[aria-pressed=true]{color:#334e5e;background:#e0edf3a1;box-shadow:inset 0 -1px #83aebb}.language-note{position:absolute;right:0;top:43px;white-space:nowrap;font-size:10px;color:#67808e}.utility{position:absolute;bottom:18px;border:1px solid #b9cbd76b;border-radius:5px;background:#f7fbfdc9;padding:7px 12px;font-size:12px}.utility small{font-size:9px;color:#7d939f;margin-left:6px}#skip{right:24px}#sound{left:24px}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}</style><div id="viewport"><canvas id="screen" width="1920" height="1080" aria-label="连接 / Connect"></canvas><button class="hit" id="action" aria-label="连接 / Connect"></button></div><div class="language-controls" id="languages"><span class="voice-label">音声<small>Voice</small></span><div class="language-switch"><button id="lang-zh" aria-pressed="true">中</button><button id="lang-en" aria-pressed="false">EN</button></div><span class="language-note" id="language-note"></span></div><button class="utility" id="skip">跳过<small>Skip · Esc</small></button><button class="utility" id="sound">声音：开<small>Sound on</small></button><span id="status" class="sr" aria-live="polite">等待连接</span>`;
 const restore=doc.createElement('button');restore.id='restore-original';restore.className='utility';restore.style.cssText='right:158px;border:0;background:transparent;color:#708996;font-size:11px;padding:8px 2px';restore.innerHTML='原版<small>Original</small>';restore.title='恢复原版界面并停用主题';restore.setAttribute('aria-label','恢复原版并停用主题 / Restore original');restore.onclick=()=>{send('enabled',false);controller.dispose();};shadow.append(restore);
 const canvas=$('screen'),ctx=canvas.getContext('2d',{alpha:true}),action=$('action');
 const P={ink:'#263440',muted:'#778d9b',line:'#beced8',blue:'#77aec1',white:'#f5f8fb'};
 const clamp=v=>Math.max(0,Math.min(1,v)),ease=v=>{v=clamp(v);return v*v*(3-2*v);},between=(v,a,b)=>ease((v-a)/(b-a));
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 /*__STAGES__*/
 const ENTRY=8,GREETING=9,HANDOFF=10,CHAT=11;
 /*__PERMISSIONS__*/
 let images={},buffers={},videos={},visualReady={},visualError={},ac,master,sound=config.sound,language=config.language,stageLanguage=language,pendingLanguage=null;
 let stage=-1,age=0,flowTime=0,stageStart=0,flowStart=0,stageDuration=0,running=false,queued=false,hover=false,focused=false,lastClick=-99,permissionPings=0,raf=0,alive=true,ready=false,audioReady,activeSources=new Set();
 function resize(){
  if(isMac){
   const titlebar=doc.querySelector('[data-app-shell-main-titlebar]');
   const bottom=titlebar?.getBoundingClientRect().bottom;
   const nativeHeight=parseFloat(getComputedStyle(doc.documentElement).getPropertyValue('--height-titlebar'));
   const inset=bottom>0&&bottom<=100?bottom:(nativeHeight>=0&&nativeHeight<=100?nativeHeight:40);
   overlay.style.top=inset+'px';
  }
  overlay.style.setProperty('--scale',Math.min(overlay.clientWidth/1920,overlay.clientHeight/1080));
 }
 resize();window.addEventListener('resize',resize);
 const chromeObserver=isMac?new ResizeObserver(resize):null;
 if(chromeObserver){chromeObserver.observe(doc.documentElement);const bar=doc.querySelector('[data-app-shell-main-titlebar]');if(bar)chromeObserver.observe(bar);}
 function currentVideo(){return videos[stageLanguage]||videos.zh;}
 function stopAudio(){for(const s of activeSources){try{s.stop();}catch{}}activeSources.clear();}
 function finish(reason='skipped'){if(!alive)return;alive=false;lastIntroResult=typeof reason==='string'?reason:'skipped';cancelAnimationFrame(raf);stopAudio();ac?.close().catch(()=>{});Object.values(videos).forEach(v=>{v.pause();v.removeAttribute('src');v.load();});window.removeEventListener('resize',resize);chromeObserver?.disconnect();doc.removeEventListener('keydown',keys,true);overlay.remove();host.hidden=false;introCleanup=null;if(previouslyFocused?.isConnected&&previouslyFocused!==doc.body)previouslyFocused.focus({preventScroll:true});send('introComplete',lastIntroResult);}
 introCleanup=finish;
 function bytes(data){const s=atob(data.slice(data.indexOf(',')+1)),a=new Uint8Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return a.buffer;}
 async function ensureAudio(){if(!ac){ac=new AudioContext();master=ac.createGain();master.gain.value=sound?.84:0;master.connect(ac.destination);audioReady=Promise.all(['zh','en'].flatMap(l=>['access','iris','identity','request','permissions','verified','session','performance'].map(async key=>{const k=l+'_'+key;buffers[k]=await ac.decodeAudioData(bytes(await asset('voices',k)));})));}await ac.resume();await audioReady;}
 function playVoice(key,delay=.18){const b=buffers[stageLanguage+'_'+key];if(!b||!ac)return;const s=ac.createBufferSource();s.buffer=b;s.connect(master);activeSources.add(s);s.onended=()=>activeSources.delete(s);s.start(ac.currentTime+delay);}
 function cue(success=false){if(!ac)return;const t=ac.currentTime;[success?783.99:1046.5,success?1174.66:1568].forEach((f,i)=>{const o=ac.createOscillator(),g=ac.createGain();o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(0,t+i*.075);g.gain.linearRampToValueAtTime(.025,t+i*.075+.006);g.gain.exponentialRampToValueAtTime(.0001,t+i*.075+.19);o.connect(g);g.connect(master);o.start(t+i*.075);o.stop(t+i*.075+.2);activeSources.add(o);o.onended=()=>activeSources.delete(o);});}
 function spokenEnd(s){return s.voice?(buffers[stageLanguage+'_'+s.voice]?.duration||0)+.42:0;}
 function updateLanguage(){for(const l of ['zh','en'])$('lang-'+l).setAttribute('aria-pressed',String((pendingLanguage||language)===l));$('language-note').textContent=pendingLanguage?'下一环节切换 / Applies next step':'';}
 function enter(n,now){if(!alive)return;if(n===CHAT){finish('complete');return;}if(pendingLanguage&&n<=ENTRY){language=pendingLanguage;pendingLanguage=null;updateLanguage();}stageLanguage=language;stage=n;stageStart=now;age=0;queued=false;permissionPings=0;const s=stages[n];overlay.dataset.stage=s.id;$('status').textContent=s.label;stageDuration=Math.max(s.duration,spokenEnd(s));action.hidden=!s.button;action.disabled=false;if(s.button)action.setAttribute('aria-label',s.button+' / '+s.buttonEn);if(s.voice){cue(n>=6);playVoice(s.voice);}if(n===ENTRY){Object.values(videos).forEach(v=>{v.pause();v.currentTime=0;});transitionSound();}if(n===GREETING){const v=currentVideo();v.currentTime=0;v.play().catch(()=>finish('media-error'));stageDuration=Math.max(v.duration,buffers[stageLanguage+'_performance']?.duration||8);playVoice('performance',0);}if(n===HANDOFF){Object.values(videos).forEach(v=>v.pause());overlay.style.background='transparent';}$('languages').style.opacity=n>=ENTRY?'0':'1';$('languages').style.pointerEvents=n>=ENTRY?'none':'auto';$('sound').style.opacity=n>=ENTRY?'0':'1';$('sound').style.pointerEvents=n>=ENTRY?'none':'auto';}
 async function advance(){if(!ready||!alive)return;lastClick=performance.now();if(!running){action.disabled=true;try{await ensureAudio();if(!alive)return;running=true;flowStart=performance.now();enter(0,flowStart);}catch{finish();}return;}if(stages[stage].button){if(age<spokenEnd(stages[stage])){queued=true;action.disabled=true;action.setAttribute('aria-label','正在确认 / Confirming');}else enter(stage+1,performance.now());}}
 action.onclick=advance;action.onmouseenter=()=>hover=true;action.onmouseleave=()=>hover=false;action.onfocus=()=>focused=true;action.onblur=()=>focused=false;$('skip').onclick=finish;
 for(const l of ['zh','en'])$('lang-'+l).onclick=()=>{setLanguage(l);if(running&&stage<ENTRY){pendingLanguage=l===language?null:l;}else{language=l;stageLanguage=l;}updateLanguage();};updateLanguage();
 function updateSound(){$('sound').innerHTML=(sound?'声音：开':'声音：关')+'<small>'+(sound?'Sound on':'Sound off')+'</small>';}
 $('sound').onclick=()=>{sound=!sound;config.sound=sound;if(ac)master.gain.setTargetAtTime(sound?.84:0,ac.currentTime,.025);updateSound();sync();send('sound',sound);};updateSound();
 function keys(e){if(!alive)return;if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finish();return;}if(e.key==='Tab'){const all=Array.from(shadow.querySelectorAll('button')).filter(b=>!b.hidden&&!b.disabled&&(b===action||getComputedStyle(b).opacity!=='0'));let at=all.indexOf(shadow.activeElement),next=e.shiftKey?(at<=0?all.length-1:at-1):(at+1)%all.length;e.preventDefault();all[next]?.focus();return;}if((e.key==='Enter'||e.key===' ')&&shadow.activeElement?.tagName!=='BUTTON'){e.preventDefault();advance();}}
 doc.addEventListener('keydown',keys,true);
 /*__DRAWING__*/
 function draw(now){if(!alive)return;try{if(running){age=Math.max(0,(now-stageStart)/1000);flowTime=Math.max(0,(now-flowStart)/1000);if((queued&&age>=spokenEnd(stages[stage]))||age>=stageDuration){if(stage+1===ENTRY&&!visualReady[pendingLanguage||language]){if(visualError[pendingLanguage||language]){finish('media-error');return;}}else{enter(stage+1,now);age=0;if(!alive)return;}}}if(stage<=7)renderLogin(now);else if(stage===ENTRY)drawMaterialize();else if(stage===GREETING)drawGreeting();else if(stage===HANDOFF){ctx.clearRect(0,0,1920,1080);drawPerformance(1-between(age,0,stages[HANDOFF].duration));}raf=requestAnimationFrame(draw);}catch(error){console.warn('Linker render failed',String(error));finish('render-error');}}
 overlay.dataset.stage='loading-images';
 try{
  async function loadImage(k){const src=await asset('images',k);if(!alive)return;return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{if(alive)images[k]=im;resolve();};im.onerror=reject;im.src=src;});}
  const portraitReady=loadImage('portrait');portraitReady.catch(()=>{});
  for(const l of ['zh','en']){
   const videoReady=(async()=>{const src=await asset('images',l==='zh'?'video':'videoEn');if(!alive)return;await new Promise((resolve,reject)=>{const v=doc.createElement('video');videos[l]=v;v.muted=true;v.playsInline=true;v.preload='auto';v.style.cssText='position:absolute;width:1px;height:1px;opacity:0;pointer-events:none';shadow.append(v);const timeout=setTimeout(()=>{if(alive)reject(Error('Video load timeout'));else resolve();},15000);v.onloadeddata=()=>{clearTimeout(timeout);resolve();};v.onerror=()=>{clearTimeout(timeout);if(alive)reject(Error('Video load failed'));else resolve();};v.src=src;v.load();});})();
   Promise.all([portraitReady,videoReady]).then(()=>{visualReady[l]=true;},error=>{visualError[l]=error;});
  }
  await Promise.all(['background','logo'].map(loadImage));
  if(!alive)return;ready=true;overlay.dataset.stage='ready';raf=requestAnimationFrame(draw);action.focus({preventScroll:true});
 }catch(error){console.warn('Linker intro media failed',String(error));finish('media-error');}
}
if(payload.playIntro)startIntro();return controller.status();
})

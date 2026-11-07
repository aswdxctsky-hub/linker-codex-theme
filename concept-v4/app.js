/* Independent visual preview. Flow and audio-completion handoff inspired by
   dsh-boot-suite (MIT). See THIRD-PARTY-NOTICES.md. */
(async function(){
"use strict";
const $=id=>document.getElementById(id),canvas=$("screen"),ctx=canvas.getContext("2d",{alpha:true});
const action=$("action"),video=$("dragon-video"),chat=$("chat");
const P={ink:"#263440",muted:"#778d9b",line:"#beced8",blue:"#77aec1",white:"#f5f8fb"};
const clamp=v=>Math.max(0,Math.min(1,v)),ease=v=>{v=clamp(v);return v*v*(3-2*v);};
const between=(v,a,b)=>ease((v-a)/(b-a));
const reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
const stages=[
 {id:"boot",label:"连接",duration:1.5},
 {id:"access",label:"访问许可",duration:3.9,button:"申请访问",buttonEn:"Request access",voice:"access"},
 {id:"iris",label:"虹膜识别",duration:4.4,voice:"iris"},
 {id:"identity",label:"身份确认",duration:3.9,button:"确认登录",buttonEn:"Confirm login",voice:"identity"},
 {id:"request",label:"请求已接收",duration:2.4,voice:"request"},
 {id:"permissions",label:"读取权限",duration:6.0,voice:"permissions"},
 {id:"verified",label:"核验通过",duration:3.3,voice:"verified"},
 {id:"session",label:"会话已建立",duration:2.2,voice:"session"},
 {id:"materialize",label:"映像构建",duration:4.2},
 {id:"greeting",label:"欢迎回来，Skyler。",duration:8},
 {id:"handoff",label:"进入聊天",duration:1.5},
 {id:"chat",label:"聊天",duration:3.5}
];
const ENTRY=8,GREETING=9,HANDOFF=10,CHAT=11;
const permissions=[['语义感知','Semantic perception'],['视觉解析','Visual analysis'],['上下文回溯','Context recall'],['代码构筑','Code synthesis'],['知识索引','Knowledge index'],['想象空间','Imagination space'],['推演模拟','Scenario simulation'],['协同链路','Collaborative link']];
let images={},buffers={},videos={},ac,master,recordBus,silentClock,language='zh',pendingLanguage=null,stageLanguage='zh';
let stageDuration=0,permissionPings=0;
let stage=-1,stageStart=0,flowStart=0,flowTime=0,age=0,running=false,autoMode=true,queued=false;
let activeSources=new Set(),hover=false,focused=false,sound=true,recording=false,recorder,chunks=[],recordStream;
let lastClick=-99,exportBusy=false,audioReady,frame=0,mediaReady=false,performanceAudio=false;
function resize(){document.documentElement.style.setProperty("--scale",Math.min(innerWidth/1920,innerHeight/1080));}
resize();addEventListener("resize",resize);
function imageLoad(src){return new Promise((resolve,reject)=>{let im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(new Error("画面素材载入失败"));im.src=src;});}
await Promise.all(["background","portrait","logo"].map(async key=>images[key]=await imageLoad(MEDIA.images[key])));
$("side-logo").src=MEDIA.images.logo;
document.documentElement.style.setProperty("--chat-bg",'url("'+MEDIA.images.background+'")');
if(MEDIA.images.video){
  await new Promise((resolve,reject)=>{
    video.onloadeddata=resolve;video.onerror=()=>reject(new Error("角色短片载入失败"));
    video.src=MEDIA.images.video;video.load();videos.zh=video;
  });
  stages[GREETING].duration=video.duration;
}
if(MEDIA.images.videoEn){
 const enVideo=document.createElement('video');enVideo.muted=true;enVideo.playsInline=true;enVideo.preload='auto';
 await new Promise((resolve,reject)=>{enVideo.onloadeddata=resolve;enVideo.onerror=()=>reject(new Error('英文角色短片载入失败'));enVideo.src=MEDIA.images.videoEn;enVideo.load();});videos.en=enVideo;
}
performanceAudio=true;mediaReady=true;
function bytes(data){let s=atob(data.slice(data.indexOf(",")+1)),a=new Uint8Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return a.buffer;}
async function ensureAudio(){
  if(!ac){
    ac=new AudioContext();master=ac.createGain();master.gain.value=sound?.84:0;
    master.connect(ac.destination);recordBus=ac.createMediaStreamDestination();master.connect(recordBus);
    // A silent clock keeps the exported audio timeline continuous between spoken cues.
    silentClock=ac.createConstantSource();silentClock.offset.value=0;
    silentClock.connect(recordBus);silentClock.start();
    audioReady=Promise.all(Object.entries(MEDIA.voices).map(async([key,src])=>buffers[key]=await ac.decodeAudioData(bytes(src))));
  }
  await ac.resume();await audioReady;
}
function stopAudio(){
  for(const s of activeSources){try{s.stop();}catch(_){}}activeSources.clear();
}
function playVoice(key,delay=.18){
  key=stageLanguage+'_'+key;
  if(!buffers[key]||!ac)return;
  const s=ac.createBufferSource();s.buffer=buffers[key];s.connect(master);
  activeSources.add(s);s.onended=()=>activeSources.delete(s);s.start(ac.currentTime+delay);
}
function cue(success=false){
  if(!ac)return;
  const t=ac.currentTime;
  [success?783.99:1046.5,success?1174.66:1568].forEach((f,i)=>{
    const o=ac.createOscillator(),g=ac.createGain();o.type="sine";o.frequency.value=f;
    g.gain.setValueAtTime(0,t+i*.075);g.gain.linearRampToValueAtTime(.025,t+i*.075+.006);
    g.gain.exponentialRampToValueAtTime(.0001,t+i*.075+.19);
    o.connect(g);g.connect(master);o.start(t+i*.075);o.stop(t+i*.075+.20);
  });
}
function enter(n,now){
  if(pendingLanguage&&n<=ENTRY){language=pendingLanguage;pendingLanguage=null;updateLanguage();}
  stageLanguage=language;stage=n;stageStart=now;age=0;queued=false;permissionPings=0;
  const s=stages[n];document.body.dataset.stage=s.id;$("status").textContent=s.label;
  stageDuration=Math.max(s.duration,spokenEnd(s));
  action.hidden=!s.button;action.disabled=recording;
  if(s.button)action.setAttribute("aria-label",s.button);
  if(s.voice){cue(n>=6);playVoice(s.voice);}
  if(n===ENTRY){
    Object.values(videos).forEach(v=>{v.pause();v.currentTime=0;});transitionSound();
  }
  if(n===GREETING){
    action.hidden=true;
    const v=currentVideo();
    if(v){v.currentTime=0;v.play().catch(()=>{$("export-status").textContent="点击重新播放以启动角色短片";});}
    stageDuration=Math.max(v?.duration||8,buffers[stageLanguage+'_performance']?.duration||8);
    playVoice("performance",0);
  }
  if(n===HANDOFF)Object.values(videos).forEach(v=>v.pause());
  chat.hidden=n<HANDOFF||recording;
  $("viewport").style.zIndex=n===HANDOFF?"4":"1";
  $("viewport").style.pointerEvents=n>=HANDOFF?"none":"auto";
  document.body.classList.toggle('character-visible',n===ENTRY||n===GREETING||n===HANDOFF);
}
async function startFlow(forceAuto){
  if(!mediaReady)return;
  action.disabled=true;$("export-status").textContent="准备连接…";
  await ensureAudio();stopAudio();Object.values(videos).forEach(v=>v.pause());
  autoMode=forceAuto===undefined?$("auto").checked:forceAuto;
  const now=performance.now();flowStart=now;flowTime=0;running=true;chat.hidden=true;
  enter(0,now);$("export-status").textContent="";$("preview-menu").hidden=true;$("menu-toggle").setAttribute("aria-expanded","false");
}
function spokenEnd(s){return s.voice&&buffers[stageLanguage+'_'+s.voice]?.duration?buffers[stageLanguage+'_'+s.voice].duration+.42:0;}
function currentVideo(){return videos[stageLanguage]||videos.zh;}
function updateLanguage(){
 const selected=pendingLanguage||language;
 ['zh','en'].forEach(lang=>{$('lang-'+lang).setAttribute('aria-pressed',String(selected===lang));});
 $('language-note').textContent=pendingLanguage?(stage>=ENTRY?'下次播放切换 / Applies on replay':'下一环节切换 / Applies next step'):'';
}
['zh','en'].forEach(lang=>$('lang-'+lang).onclick=async()=>{
 if(recording||lang===(pendingLanguage||language))return;
 if(running&&stage<CHAT){pendingLanguage=lang;updateLanguage();}
 else{language=lang;stageLanguage=lang;pendingLanguage=null;updateLanguage();}
});
async function advance(){
  if(recording||exportBusy)return;
  lastClick=performance.now();
  if(!running){await startFlow();return;}
  if(stages[stage].button){
    if(age<spokenEnd(stages[stage])){queued=true;action.disabled=true;action.setAttribute("aria-label","正在确认");}
    else enter(stage+1,performance.now());
  }
}
action.onclick=advance;action.onmouseenter=()=>hover=true;action.onmouseleave=()=>hover=false;
action.onfocus=()=>focused=true;action.onblur=()=>focused=false;
addEventListener("keydown",e=>{
  if(e.key==="Escape"&&!recording){skip();return;}
  if((e.key==="Enter"||e.key===" ")&&!(e.target instanceof HTMLInputElement)&&!(e.target instanceof HTMLTextAreaElement)&&!(e.target instanceof HTMLButtonElement)){
    e.preventDefault();advance();
  }
});
function skip(){
  if(recording)return;stopAudio();Object.values(videos).forEach(v=>v.pause());running=true;
  enter(CHAT,performance.now());$("preview-menu").hidden=true;$("menu-toggle").setAttribute("aria-expanded","false");
}
function text(s,x,y,size=24,color=P.ink,opts={}){
  const font=/Mac/.test(navigator.platform)?(opts.font?'-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif':'"PingFang SC",-apple-system,sans-serif'):(opts.font||'"Microsoft YaHei","Segoe UI",sans-serif');
  ctx.save();ctx.font=(opts.weight||400)+" "+size+'px '+font;
  ctx.textBaseline="alphabetic";ctx.textAlign=opts.align||"center";ctx.fillStyle=color;
  ctx.globalAlpha*=opts.alpha===undefined?1:opts.alpha;ctx.fillText(s,x,y);ctx.restore();
}
function pair(zh,en,x,y,size=44,opts={}){
  text(zh,x,y,size,opts.color||P.ink,opts);
  text(en,x,y+(opts.gap||34),opts.enSize||20,opts.enColor||'#65808f',{...opts,font:'"Segoe UI",sans-serif',weight:400});
}
function brackets(x,y,w,h,alpha=.5){
 const d=26;
 [[[x,y+d],[x,y],[x+d,y]],[[x+w-d,y],[x+w,y],[x+w,y+d]],[[x,y+h-d],[x,y+h],[x+d,y+h]],[[x+w-d,y+h],[x+w,y+h],[x+w,y+h-d]]].forEach(p=>stroke(p,P.blue,1.25,alpha));
}
function signalPath(points,p,alpha=1){
 stroke(points,P.line,1,alpha*.42);
 const lengths=points.slice(1).map((b,i)=>Math.hypot(b[0]-points[i][0],b[1]-points[i][1]));
 let remaining=clamp(p)*lengths.reduce((a,b)=>a+b,0),partial=[points[0]],end=points[0];
 for(let i=0;i<lengths.length;i++){
  if(remaining>=lengths[i]){remaining-=lengths[i];partial.push(points[i+1]);end=points[i+1];}
  else{let f=remaining/lengths[i];end=[points[i][0]+(points[i+1][0]-points[i][0])*f,points[i][1]+(points[i+1][1]-points[i][1])*f];partial.push(end);break;}
 }
 stroke(partial,P.blue,1.5,alpha*.8);
 if(p>0&&p<1){ctx.save();ctx.shadowColor='#7dc4df';ctx.shadowBlur=14;fillCircle(end[0],end[1],3.1,'#e4fbff',alpha);fillCircle(end[0],end[1],1.8,P.blue,alpha);ctx.restore();}
}
function orbital(x,y,r,t,alpha=.7){
 circle(x,y,r,P.line,1,alpha*.45);circle(x,y,r+17,P.line,.7,alpha*.25);
 for(let i=0;i<48;i++){
  const a=i*Math.PI/24,rr=r+(i%4===0?9:4);
  stroke([[x+(r+2)*Math.cos(a),y+(r+2)*Math.sin(a)],[x+rr*Math.cos(a),y+rr*Math.sin(a)]],P.blue,.8,alpha*(i%4===0?.45:.22));
 }
 const theta=reduced?-.8:t*.35;
 circle(x,y,r+17,P.blue,1.8,alpha*.8,theta,theta+.65);
 circle(x,y,r+17,P.blue,1,alpha*.45,theta+Math.PI,theta+Math.PI+.4);
}
function chip(x,y,r=64,alpha=1){
 ctx.save();ctx.globalAlpha*=alpha;glass(x-r,y-r,r*2,r*2,.65);logo(x,y,r*.9,.9);
 for(let i=0;i<7;i++){let offset=(i-3)*r*.22;
  stroke([[x-r-11,y+offset],[x-r,y+offset]],P.blue,1.25,.6);stroke([[x+r,y+offset],[x+r+11,y+offset]],P.blue,1.25,.6);
  stroke([[x+offset,y-r-11],[x+offset,y-r]],P.blue,1.25,.6);stroke([[x+offset,y+r],[x+offset,y+r+11]],P.blue,1.25,.6);
 }ctx.restore();
}
function electronicPing(index=0){
 if(!ac)return;const t=ac.currentTime;
 const o=ac.createOscillator(),g=ac.createGain();o.type='sine';o.frequency.setValueAtTime(740+index*83,t);o.frequency.exponentialRampToValueAtTime(620+index*57,t+.075);
 g.gain.setValueAtTime(.018,t);g.gain.exponentialRampToValueAtTime(.0001,t+.14);o.connect(g);g.connect(master);o.start(t);o.stop(t+.15);
}
function transitionSound(){
 if(!ac)return;const t=ac.currentTime;
 for(let i=0;i<14;i++){
  const o=ac.createOscillator(),g=ac.createGain(),start=t+.1+i*.09;
  o.type=i%3===0?'triangle':'sine';o.frequency.setValueAtTime(290*Math.pow(1.085,i),start);
  g.gain.setValueAtTime(0,start);g.gain.linearRampToValueAtTime(.026,start+.01);g.gain.exponentialRampToValueAtTime(.0001,start+.24);
  o.connect(g);g.connect(master);o.start(start);o.stop(start+.25);activeSources.add(o);o.onended=()=>activeSources.delete(o);
 }
 const b=ac.createBuffer(1,ac.sampleRate*3,ac.sampleRate),d=b.getChannelData(0);
 let seed=371;for(let i=0;i<d.length;i++){seed=(seed*16807)%2147483647;d[i]=(seed/2147483647-.5)*2;}
 const s=ac.createBufferSource(),f=ac.createBiquadFilter(),g=ac.createGain();s.buffer=b;f.type='bandpass';f.Q.value=.65;
 f.frequency.setValueAtTime(180,t);f.frequency.exponentialRampToValueAtTime(4200,t+1.7);f.frequency.exponentialRampToValueAtTime(700,t+3);
 g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.048,t+1.5);g.gain.exponentialRampToValueAtTime(.0001,t+3);
 s.connect(f);f.connect(g);g.connect(master);s.start(t);activeSources.add(s);s.onended=()=>activeSources.delete(s);
}
function stroke(points,color=P.line,width=1,alpha=1){
  ctx.save();ctx.globalAlpha*=alpha;ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap="round";ctx.lineJoin="round";
  ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.stroke();ctx.restore();
}
function circle(x,y,r,color=P.line,width=1,alpha=1,start=0,end=Math.PI*2){
  ctx.save();ctx.globalAlpha*=alpha;ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap="round";
  ctx.beginPath();ctx.arc(x,y,r,start,end);ctx.stroke();ctx.restore();
}
function fillCircle(x,y,r,color,alpha=1){
  ctx.save();ctx.globalAlpha*=alpha;ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.restore();
}
function logo(x,y,size,alpha=1){ctx.save();ctx.globalAlpha*=alpha;ctx.drawImage(images.logo,x-size/2,y-size/2,size,size);ctx.restore();}
function background(opacity=1){
  ctx.fillStyle=P.white;ctx.fillRect(0,0,1920,1080);
  ctx.save();ctx.globalAlpha=opacity;ctx.drawImage(images.background,0,0,1920,1080);ctx.restore();
}
function glass(x,y,w,h,alpha=1){
  const bevel=11;ctx.save();ctx.globalAlpha*=alpha;
  ctx.beginPath();ctx.moveTo(x+bevel,y);ctx.lineTo(x+w,y);ctx.lineTo(x+w,y+h-bevel);ctx.lineTo(x+w-bevel,y+h);ctx.lineTo(x,y+h);ctx.lineTo(x,y+bevel);ctx.closePath();
  ctx.fillStyle="rgba(255,255,255,.62)";ctx.fill();
  ctx.strokeStyle="rgba(155,181,197,.48)";ctx.lineWidth=1;ctx.stroke();
  stroke([[x+bevel+1,y+1],[x+w-1,y+1]],"#fff",2,.9);ctx.restore();
}
function button(label,now,en='Connect'){
  const x=784,y=752,w=352,h=82,on=hover||focused;
  glass(x,y,w,h,on?1:.9);
  ctx.save();ctx.fillStyle=on?"rgba(110,165,186,.12)":"rgba(233,242,247,.25)";ctx.fillRect(x+1,y+1,w-2,h-2);ctx.restore();
  pair(queued?"正在确认":label,queued?'Confirming':en,960,786,25,{color:on?'#2b5e74':P.ink,enSize:15,gap:25});
  stroke([[1104,786],[1111,793],[1104,800]],P.blue,1.3);
  if(focused){stroke([[x-6,y+12],[x-6,y-6],[x+12,y-6]],P.blue,2);stroke([[x+w-12,y+h+6],[x+w+6,y+h+6],[x+w+6,y+h-12]],P.blue,2);}
  const pulse=(now-lastClick)/1000;if(pulse>=0&&pulse<.7)circle(960,793,16+pulse*110,P.blue,1,1-pulse/.7);
}
function progress(n){
  const start=798;stroke([[start,964],[start+324,964]],P.line,.8,.4);
  for(let i=0;i<7;i++){const x=start+i*54,active=i===n-1;
    fillCircle(x,964,active?4:2.5, i<=n-1?P.blue:"#c6d3dc",active?1:.7);
    if(active)circle(x,964,10,P.blue,.9,.5);
  }
  text(String(n).padStart(2,'0')+' / 07',1182,969,15,P.muted,{font:'"Segoe UI",sans-serif'});
}
function check(x,y,size,alpha=1){
  stroke([[x-size*.42,y],[x-size*.09,y+size*.28],[x+size*.46,y-size*.3]],P.blue,2.5,alpha);
}
function lock(x,y,open,alpha=1){
  ctx.save();ctx.globalAlpha*=alpha;ctx.strokeStyle=open?P.blue:P.muted;ctx.lineWidth=1.6;
  ctx.strokeRect(x-9,y,18,15);ctx.beginPath();ctx.arc(x+(open?8:0),y,7,Math.PI,Math.PI*2);ctx.stroke();
  ctx.restore();
}
function iris(t,a){
  const x=960,y=430,p=between(a,.35,3.4),r=170;
  const rad=ctx.createRadialGradient(x,y,41,x,y,r);rad.addColorStop(0,"#7296a8");rad.addColorStop(.34,"#c4dce8");rad.addColorStop(.7,"#9ab9cc");rad.addColorStop(1,"#d6e6ee");
  ctx.save();ctx.globalAlpha*=.85;ctx.fillStyle=rad;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
  for(let i=0;i<180;i++){
    const an=i*Math.PI*2/180,ir=59+7*Math.sin(i*2.39),out=151+18*Math.sin(i*4.7),mid=(ir+out)/2;
    stroke([[x+ir*Math.cos(an),y+ir*Math.sin(an)],[x+mid*Math.cos(an+.009*Math.sin(i)),y+mid*Math.sin(an+.009*Math.sin(i))],[x+out*Math.cos(an+.012),y+out*Math.sin(an+.012)]],i%3?"#628ca1":"#eff8fc",i%3?.65:1.2,.30+.1*Math.sin(i*2));
  }
  const pupil=54+(reduced?0:2*Math.sin(t*1.2));fillCircle(x,y,pupil,"#375466",.9);
  circle(x,y,pupil+8,"#f3fbff",.8,.7);circle(x,y,r,"#789fb3",1,.7);
  circle(x,y,190,P.blue,.7,.4);orbital(x,y,218,t,.75);
  const angle=-Math.PI/2+p*Math.PI*2;
  circle(x,y,204,P.blue,2.2,.9,-Math.PI/2,angle);
  fillCircle(x+204*Math.cos(angle),y+204*Math.sin(angle),3,P.blue);
  for(let k=0;k<4;k++){
    const an=k*Math.PI/2;circle(x,y,252,P.blue,1.4,.5,an-.065,an+.065);
  }
  ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.clip();
  if(a<3.6){
    const yy=y-r+2*r*clamp(a/3.5),grad=ctx.createLinearGradient(0,yy-45,0,yy+1);
    grad.addColorStop(0,"rgba(255,255,255,0)");grad.addColorStop(1,"rgba(255,255,255,.7)");
    ctx.fillStyle=grad;ctx.fillRect(x-r,yy-45,2*r,45);stroke([[x-r,yy],[x+r,yy]],"#f8feff",1.5,.9);
  }
  ctx.restore();circle(x-20,y-23,21,"#f7fcff",2,.72,-2.2,-.2);
  pair(a<3.5?"虹膜识别":"匹配完成",a<3.5?'Iris recognition':'Identity matched',960,745,44,{alpha:between(a,0,.5)});
  if(a>3.5)check(960,838,25,between(a,3.5,3.9));
}
function renderLogin(now){
  background(.55);
  if(stage<0){
    orbital(960,398,159,now/1000,.5);logo(960,398,100);text("ChatGPT",960,648,46,P.ink,{font:'"Segoe UI",sans-serif'});
    button("连接",now,'Connect');return;
  }
  if(stage===0){
    const a=between(age,0,.65);orbital(960,398,159,flowTime,.55);logo(960,398,100,a);text("ChatGPT",960,648,46,P.ink,{font:'"Segoe UI",sans-serif',alpha:a});
    const q=between(age,.25,1.3);stroke([[870,709],[1050,709]],P.line,1,.4);stroke([[870,709],[870+180*q,709]],P.blue,1.8,a);return;
  }
  logo(960,129,48,.82);
  ctx.save();ctx.globalAlpha*=between(age,0,.38);
  if(!reduced)ctx.translate(0,8*(1-between(age,0,.7)));
  if(stage===1){
    orbital(960,450,222,flowTime,.7);brackets(650,254,620,396,.36);
    pair('访问许可','Access clearance',960,428,48);
    pair('准备建立连接','Ready to establish connection',960,528,24,{enSize:16,gap:29,color:P.muted});
    const p=reduced?.6:(flowTime*.45)%1;
    signalPath([[880,612],[1040,612]],p,.7);circle(880,612,6,P.blue,1,.7);circle(1040,612,6,P.blue,1,.7);
    button(stages[stage].button,now,stages[stage].buttonEn);
  }else if(stage===2){iris(flowTime,age);
  }else if(stage===3){
    glass(620,307,680,318,.78);brackets(608,295,704,342,.7);
    text("Skyler",960,443,78,P.ink,{font:'"Segoe UI",sans-serif',weight:300});
    stroke([[895,480],[1025,480]],P.blue,1.1,.55);
    pair('身份已确认','Identity verified',960,539,28,{gap:31,enSize:18});check(838,532,18);
    for(let i=0;i<4;i++)fillCircle(1267,337+i*13,2,P.blue,between(age,.2+i*.2,.5+i*.2));
    button(stages[stage].button,now,stages[stage].buttonEn);
  }else if(stage===4){
    logo(960,433,83,.95);orbital(960,433,151,flowTime,.8);
    for(let i=0;i<4;i++){
      const a=i*Math.PI/2,from=[960+Math.cos(a)*300,433+Math.sin(a)*196],to=[960+Math.cos(a)*190,433+Math.sin(a)*185];
      signalPath([from,to],reduced?1:(age*.8+i*.2)%1,.6);
    }
    const p=between(age,.2,2);circle(960,433,130,P.blue,1.5,.8,-Math.PI/2,-Math.PI/2+p*Math.PI*2);
    pair('请求已接收','Access request received',960,699,46);
  }else if(stage===5){
    pair('读取权限','Reading permissions',960,244,44);chip(960,506,67);orbital(960,506,111,flowTime,.4);
    brackets(428,307,1064,454,.3);
    let online=0;
    permissions.forEach(([zh,en],i)=>{
      const right=i%2===1,row=Math.floor(i/2),y=350+row*111,p=between(age,.35+i*.53,.9+i*.53),done=p>.99;
      const direction=right?1:-1,edge=960+direction*100,target=right?1180:790;
      signalPath([[960+direction*84,506],[edge,506],[edge+direction*49,y+7],[target,y+7]],p,done?.9:.45);
      const x=right?1210:470;
      pair(zh,en,x,y+8,30,{align:'left',enSize:17,gap:28,color:done?P.ink:'#91a3ae',enColor:done?'#65808f':'#9eafb9'});
      const end=right?1466:756;
      if(done){check(end,y,17);online++;}else{circle(end,y,7,P.line,1,.65,age*2+i,age*2+i+Math.PI);}
      stroke([[x,y+54],[end+9,y+54]],P.line,.8,.4);
    });
    if(online>permissionPings){permissionPings=online;electronicPing(online);}
    pair(online===8?'全部通路就绪':'能力通路接入中',online===8?'All channels online':'Connecting capability channels',960,838,25,{enSize:17,gap:28});
    text(String(online).padStart(2,'0')+' / 08',960,609,16,P.muted,{font:'"Segoe UI",sans-serif'});
  }else if(stage===6){
    orbital(960,435,151,flowTime,.65);check(960,433,78,between(age,.3,.7));
    for(let i=0;i<8;i++)circle(960,435,132,P.blue,2,between(age,i*.06,.5+i*.06),i*Math.PI/4+.08,(i+1)*Math.PI/4-.08);
    pair('核验通过','Verification complete',960,697,46);
    pair('身份已确认','Identity verified',799,808,24,{enSize:15,gap:27});check(696,799,16);
    pair('权限已解锁','Access unlocked',1167,808,24,{enSize:15,gap:27});check(1064,799,16);
  }else if(stage===7){
    chip(960,450,76);orbital(960,450,168,flowTime,.6);pair('会话已建立','Session established',960,697,46);
    if(!reduced){const p=between(age,0,stageDuration);circle(960,450,140+p*180,P.blue,1,.45*(1-p));}
  }
  ctx.restore();progress(stage);
}
function drawPerformance(alpha=1){
  ctx.save();ctx.globalAlpha=alpha;
  const v=currentVideo();
  if(v&&v.readyState>=2)ctx.drawImage(v,0,0,1920,1080);
  else ctx.drawImage(images.portrait,0,0,1920,1080);
  ctx.restore();
}
function drawMaterialize(){
 background(.55);const t=age,vanish=1-between(t,2.35,3.55);
 if(reduced){drawPerformance(between(t,0,3.7));return;}
 for(let side of [-1,1])for(let vertical of [-1,1])for(let i=0;i<6;i++){
   const y=450+vertical*(10+i*14),dx=side;
   const path=[[960+side*88,y],[960+side*(145+i*15),y],[960+side*(225+i*24),y+vertical*(79+i*22)],[960+side*(330+i*25),y+vertical*(79+i*22)],[960+side*(470+i*64),y+vertical*(190+i*31)]];
   signalPath(path,between(t,.06+i*.055,1.15+i*.075),vanish*.85);
 }
 for(let i=0;i<3;i++){
   const p=between(t,.7+i*.22,2.55+i*.22);circle(960,450,96+920*p,P.blue,1.1,(1-p)*vanish*.58);
 }
 chip(960,450,76,1-between(t,.95,1.85));
 const presence=between(t,1.15,2.15),scan=between(t,1.6,3.85),source=currentVideo()||images.portrait;
 ctx.save();ctx.filter='grayscale(1) contrast(1.65)';ctx.globalAlpha=presence*.24;ctx.drawImage(source,0,0,1920,1080);ctx.restore();
 const yy=1080*scan;
 ctx.save();ctx.beginPath();ctx.rect(0,0,1920,yy);ctx.clip();drawPerformance(between(t,1.65,2.65));ctx.restore();
 if(t>1.6&&t<3.85){
   const g=ctx.createLinearGradient(0,yy-68,0,yy+15);g.addColorStop(0,'rgba(130,204,229,0)');g.addColorStop(.8,'rgba(173,229,246,.18)');g.addColorStop(1,'rgba(255,255,255,0)');
   ctx.fillStyle=g;ctx.fillRect(0,yy-68,1920,83);stroke([[130,yy],[1790,yy]],'#92cadb',1.3,.6);
 }
 if(t<3.05)pair('映像构建','Rendering presence',960,948,25,{enSize:16,gap:28,alpha:1-between(t,2.5,3.05)});
}
function drawGreeting(){
  background(.6);drawPerformance(1);
  const subtitle=between(age,2.1,2.6)*(1-between(age,6.8,7.4));
  if(subtitle>0){
    ctx.save();ctx.globalAlpha=subtitle;
    const g=ctx.createLinearGradient(0,872,0,1080);g.addColorStop(0,'rgba(245,248,251,0)');g.addColorStop(1,'rgba(245,248,251,.83)');ctx.fillStyle=g;ctx.fillRect(0,872,1920,208);
    pair('欢迎回来，Skyler。','Welcome back, Skyler.',960,971,31,{enSize:19,gap:31});ctx.restore();
  }
}
function roundRect(x,y,w,h,r,fill,strokeColor){
  ctx.save();ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(strokeColor){ctx.strokeStyle=strokeColor;ctx.lineWidth=1;ctx.stroke();}ctx.restore();
}
function drawChat(){
  background(1);
  ctx.fillStyle="rgba(245,248,251,.72)";ctx.fillRect(0,0,270,1080);stroke([[270,0],[270,1080]],"#d4dfe6",1,.5);
  logo(53,58,34);pair('新聊天','New chat',72,142,21,{align:'left',enSize:13,gap:23});
  stroke([[33,135],[47,121],[50,124],[36,138],[32,139],[33,135]],"#647d8a",1.4);
  pair('搜索聊天','Search chats',72,211,21,{align:'left',enSize:13,gap:23});circle(39,203,7,"#647d8a",1.4);stroke([[44,209],[49,214]],"#647d8a",1.4);
  pair('项目','Projects',72,280,21,{align:'left',enSize:13,gap:23});stroke([[31,270],[38,270],[41,273],[49,273],[49,285],[31,285],[31,270]],"#647d8a",1.4);
  pair('聊天','Chats',36,369,17,{align:'left',enSize:12,gap:23,color:P.muted});pair('新的聊天','New conversation',36,442,20,{align:'left',enSize:13,gap:24});
  fillCircle(46,1020,17,"#e3ebf0");text("S",46,1026,17);text("Skyler",76,1027,19,P.ink,{align:"left",font:'"Segoe UI",sans-serif'});
  text("ChatGPT",308,60,25,"#4c6270",{align:"left",font:'"Segoe UI",sans-serif'});stroke([[419,49],[425,55],[431,49]],"#81929b",1.3);
  pair('有什么新想法？',"What's on your mind?",1095,418,38,{enSize:20,gap:34});
  roundRect(665,492,860,180,24,"rgba(255,255,255,.76)","rgba(184,204,216,.65)");
  pair('想到什么，就从这里开始。','Start with whatever is on your mind.',692,537,22,{align:'left',enSize:14,gap:29,color:'#899ba7'});
  text('＋',704,638,30,'#78919f');pair('Shift + Enter 换行','New line',1413,626,16,{align:'right',enSize:11,gap:22,color:'#8b9da7'});
  fillCircle(1483,631,23,"#334d5d");stroke([[1483,642],[1483,620],[1475,628]],"#fff",2);stroke([[1483,620],[1491,628]],"#fff",2);
  pair('ChatGPT 也可能会犯错。请核查重要信息。','ChatGPT can make mistakes. Check important information.',1095,1019,15,{enSize:11,gap:24,color:'#8ba0ad'});
}
function draw(now){
  frame++;
  if(running){
    age=Math.max(0,(now-stageStart)/1000);flowTime=Math.max(0,(now-flowStart)/1000);
    if(stage<CHAT){
      const s=stages[stage],blocked=!autoMode&&!!s.button;
      if((queued&&age>=spokenEnd(s))||(!blocked&&age>=stageDuration)){enter(stage+1,now);age=0;}
    }
  }
  if(stage<=7)renderLogin(now);
  else if(stage===ENTRY)drawMaterialize();
  else if(stage===GREETING)drawGreeting();
  else if(stage===HANDOFF){
    if(recording)drawChat();else ctx.clearRect(0,0,1920,1080);
    drawPerformance(1-between(age,0,stages[HANDOFF].duration));
  }
  else drawChat();
  if(recording&&stage===CHAT&&age>=stages[CHAT].duration){recording=false;recorder.stop();}
  requestAnimationFrame(draw);
}
function download(blob,name){
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
$("menu-toggle").onclick=()=>{const shown=$("preview-menu").hidden;$("preview-menu").hidden=!shown;$("menu-toggle").setAttribute("aria-expanded",String(shown));};
$("preview-settings").onclick=()=>{$("preview-menu").hidden=false;$("menu-toggle").setAttribute("aria-expanded","true");};
$("sound").onclick=async()=>{
  await ensureAudio();sound=!sound;master.gain.setTargetAtTime(sound?.84:0,ac.currentTime,.025);
  $("sound").innerHTML='<span>声音：'+(sound?'开':'关')+'<small>Sound '+(sound?'on':'off')+'</small></span>';$("sound").setAttribute("aria-pressed",String(sound));
};
$("replay").onclick=()=>{if(!recording)startFlow();};$("skip").onclick=skip;
$("save").onclick=()=>canvas.toBlob(b=>download(b,"chatgpt-v4-"+(stage<0?"connection":stages[stage].id)+".png"));
function controlsDisabled(v){["auto","replay","skip","record","sound","lang-zh","lang-en"].forEach(id=>$(id).disabled=v);}
$("record").onclick=async()=>{
  if(exportBusy||recording)return;
  if(!window.MediaRecorder||!canvas.captureStream){$("export-status").textContent="当前浏览器不支持视频导出";return;}
  exportBusy=true;controlsDisabled(true);
  try{
    await ensureAudio();await startFlow(true);
    const mime=["video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"].find(t=>MediaRecorder.isTypeSupported(t));
    if(!mime)throw new Error("当前浏览器不支持视频编码");
    renderLogin(performance.now());recordStream=canvas.captureStream(30);
    recordBus.stream.getAudioTracks().forEach(t=>recordStream.addTrack(t));
    recorder=new MediaRecorder(recordStream,{mimeType:mime,videoBitsPerSecond:12000000,audioBitsPerSecond:192000});
    chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    recorder.onstop=()=>{
      download(new Blob(chunks,{type:mime}),"chatgpt-startup-v4-"+stageLanguage+".webm");
      recordStream.getVideoTracks().forEach(t=>t.stop());controlsDisabled(false);exportBusy=false;recording=false;
      $("export-status").textContent="完整样片已导出 / Export complete";chat.hidden=stage!==CHAT;action.disabled=false;
    };
    recorder.onerror=()=>{$("export-status").textContent="导出中断，请重新播放后重试";controlsDisabled(false);exportBusy=false;recording=false;};
    recording=true;action.disabled=true;recorder.start(1000);$("export-status").textContent="正在导出完整样片…";
  }catch(e){controlsDisabled(false);exportBusy=false;recording=false;$("export-status").textContent=e.message;}
};
function notice(zh,en){
 const extra=document.createElement('small');extra.textContent=en;$("draft-notice").replaceChildren(document.createTextNode(zh),extra);
}
function newChat(){
  $("conversation").replaceChildren();$("welcome").hidden=false;$("message").value="";$("draft-entry").innerHTML='<span class="dual">新的聊天<small>New conversation</small></span>';$("draft-notice").textContent="";$("composer-sub").hidden=false;$("draft-entry").hidden=false;$("search-field").value='';$("message").focus();
}
$("new-chat").onclick=newChat;$("brand-home").onclick=newChat;$("draft-entry").onclick=()=>$("message").focus();
$("search-chat").onclick=()=>{$("search-field").hidden=!$("search-field").hidden;if(!$("search-field").hidden)$("search-field").focus();};
$("search-field").oninput=()=>{$("draft-entry").hidden=!$("draft-entry").textContent.includes($("search-field").value);};
$("projects").onclick=()=>notice('离线预览中没有连接项目。','Projects are not connected in this local preview.');
$("attach").onclick=()=>notice('离线预览不读取附件。','Attachments are not read in this local preview.');
$("composer").onsubmit=e=>{
  e.preventDefault();const value=$("message").value.trim();if(!value)return;
  const bubble=document.createElement("div");bubble.className="user-draft";bubble.textContent=value;
  $("conversation").replaceChildren(bubble);$("welcome").hidden=true;$("message").value="";
  $("draft-entry").textContent=value;$("composer-sub").hidden=false;notice('离线预览：这条消息仅保留在当前页面，未发送。','Local preview: this draft stays on this page and has not been sent.');
};
$("message").oninput=()=>$("composer-sub").hidden=!!$("message").value;
$("message").onkeydown=e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing){e.preventDefault();$("composer").requestSubmit();}};
document.body.dataset.stage="idle";requestAnimationFrame(draw);
})().catch(e=>{console.error(e);const f=document.getElementById("fatal");f.hidden=false;f.textContent="预览无法载入："+e.message;});

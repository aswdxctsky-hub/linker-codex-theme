// Candidate validation uses a newly created profile, never a signed-in one.
// Passing this script is evidence for isolated-native compatibility only.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {discoverApp,isolatedProfile,appProcesses,run} from './context.mjs';
import {sha256} from '../compatibility.mjs';
import {launchPipe} from '../pipe-client.mjs';
import {mountTheme} from '../media-delivery.mjs';

const integration=resolve(fileURLToPath(new URL('..',import.meta.url)));
export async function until(fn,message,timeout=45000){
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){const value=await fn();if(value)return value;await delay(100);}
  throw Error(message);
}
export async function closeOwned(client){
  const pid=client.child.pid;
  await client.call('Browser.close',{},undefined,3000).catch(()=>{});
  for(let i=0;i<80&&client.child.exitCode===null&&client.child.signalCode===null;i++)await delay(100);
  if(client.child.exitCode===null&&client.child.signalCode===null){
    client.child.kill('SIGTERM');
    for(let i=0;i<50&&client.child.exitCode===null&&client.child.signalCode===null;i++)await delay(100);
  }
  client.disconnect();
  assert.ok(client.child.exitCode!==null||client.child.signalCode!==null,'Owned app did not exit: '+pid);
}
const measure=`(()=>({attribute:document.documentElement.getAttribute('data-linker-pearl'),background:getComputedStyle(document.body).backgroundImage==='none'?'none':'image',nodes:document.querySelectorAll('[id^="linker-pearl-v4-"]').length,theme:window.__linkerThemeV4?.status()||null}))()`;

async function verify(){
  const app=await discoverApp(process.argv[2]);
  const profile=await isolatedProfile(join(integration,'verification'));
  const output=profile.root;
  const officialBefore=(await appProcesses(app.executable)).filter(p=>!p.isolated).map(p=>p.pid);
  const result={scope:'isolated-native; no signed-in account',app,passed:false,flows:{},officialBefore};
  const client=launchPipe(app.executable,profile.args,profile.env);
  let session;
  const evaluate=expression=>client.evaluate(session,expression);
  const screenshot=async name=>writeFile(join(output,name+'.png'),Buffer.from((await client.call('Page.captureScreenshot',{format:'png'},session)).data,'base64'));
  async function click(id,rootIndex=-1){
    const point=await evaluate(`(()=>{const b=window.__linkerTest.shadows.at(${rootIndex})?.getElementById(${JSON.stringify(id)});if(!b||b.hidden||b.disabled)return null;const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    assert.ok(point,'Missing button '+id);
    await client.call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1},session);
    await client.call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1},session);
  }
  try{
    await run('/usr/bin/codesign',['--verify','--strict',app.app]);
    result.appAsarSha256=await sha256(app.archive);
    result.browser=await client.call('Browser.getVersion');
    const target=await until(async()=>(await client.call('Target.getTargets')).targetInfos.find(t=>t.type==='page'&&t.url==='app://-/index.html'),'Main app page missing');
    session=(await client.call('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
    await until(()=>evaluate("document.readyState==='complete'&&!!document.getElementById('root')"),'Native root not ready');
    // Wait for real native content, not just an empty root or splash.
    result.nativeControlsReady=!!await until(()=>evaluate("Array.from(document.querySelectorAll('#root button')).some(b=>b.getBoundingClientRect().width>0)"),'Native controls not ready',60000);
    result.native=await evaluate("({url:location.href,os:document.documentElement.dataset.codexOs,width:innerWidth,height:innerHeight,dpr:devicePixelRatio,rootChildren:document.getElementById('root').children.length,titlebar:document.querySelector('[data-app-shell-main-titlebar]')?.getBoundingClientRect().toJSON()||null})");
    await screenshot('native-before');
    result.before=await evaluate(measure);
    // The first mutation is a tiny reversible style probe in the isolated app.
    await evaluate("window.__probe=document.createElement('style');__probe.textContent='body{outline:1px solid rgb(119,174,193)!important}';document.head.append(__probe);true");
    assert.equal(await evaluate('getComputedStyle(document.body).outlineColor'),'rgb(119, 174, 193)');
    await evaluate('window.__probe.remove();delete window.__probe;true');
    assert.deepEqual(await evaluate(measure),result.before);
    result.reversibleProbe=true;
    // Test-owned instrumentation is never shipped or installed in the runtime.
    await evaluate(`window.__linkerTest={shadows:[],bindings:[],audio:[],attach:Element.prototype.attachShadow,decode:AudioContext.prototype.decodeAudioData,start:AudioBufferSourceNode.prototype.start};
      Element.prototype.attachShadow=function(o){const s=__linkerTest.attach.call(this,o);if(this.id.startsWith('linker-pearl-v4-'))__linkerTest.shadows.push(s);return s;};
      AudioContext.prototype.decodeAudioData=async function(...args){const b=await __linkerTest.decode.apply(this,args);__linkerTest.audio.push({duration:b.duration,sampleRate:b.sampleRate});return b;};
      window.__linker_verify=s=>__linkerTest.bindings.push(JSON.parse(s));true`);
    const runtime=await readFile(join(integration,'bundle/runtime.js'),'utf8');
    const media=JSON.parse(await readFile(join(integration,'bundle/media.json'),'utf8'));
    const mounted=await mountTheme(client,session,runtime,media,{config:{language:'zh',sound:false},binding:'__linker_verify',platform:'darwin',playIntro:true});
    assert.equal(mounted.mounted.installed,true);await mounted.delivery;
    for(const lang of ['zh','en']){
      if(lang==='en')await evaluate("window.__linkerThemeV4.update({language:'en'});window.__linkerThemeV4.replay();true");
      await until(async()=>(await evaluate('window.__linkerThemeV4.status()')).introStage==='ready','Intro not ready');
      await screenshot(lang+'-ready');
      const geometry=await evaluate("({top:document.getElementById('linker-pearl-v4-intro').getBoundingClientRect().top,font:getComputedStyle(__linkerTest.shadows.at(-1).getElementById('sound')).fontFamily})");
      assert.ok(geometry.top>=0&&geometry.top<=100);assert.match(geometry.font,/PingFang SC/);
      const flow={stages:[],geometry};result.flows[lang]=flow;let greeted=false;
      const deadline=Date.now()+120000;
      while(Date.now()<deadline){
        const status=await evaluate('window.__linkerThemeV4.status()');
        if(flow.stages.at(-1)!==status.introStage){flow.stages.push(status.introStage);console.log(JSON.stringify({language:lang,stage:status.introStage}));}
        if(!status.intro){assert.equal(status.lastIntroResult,'complete');flow.complete=true;break;}
        if(status.introStage==='identity'&&!flow.identity){await delay(800);await screenshot(lang+'-identity');flow.identity=true;}
        if(status.introStage==='greeting'&&!greeted){
          await delay(900);flow.video=await evaluate("Array.from(__linkerTest.shadows.at(-1).querySelectorAll('video')).map(v=>({width:v.videoWidth,height:v.videoHeight,time:v.currentTime,ready:v.readyState,paused:v.paused,error:v.error?.code||null}))");
          await screenshot(lang+'-greeting');flow.greetingStatus=await evaluate('window.__linkerThemeV4.status()');
          console.log(JSON.stringify({language:lang,video:flow.video,status:flow.greetingStatus}));
          assert.ok(flow.video.some(v=>v.time>0&&v.width>0&&!v.paused&&!v.error));greeted=true;
        }
        if(await evaluate("(()=>{const b=__linkerTest.shadows.at(-1).getElementById('action');return !!b&&!b.hidden&&!b.disabled;})()"))await click('action');
        await delay(150);
      }
      assert.ok(flow.complete,'Flow did not complete');
      for(const stage of ['access','iris','identity','permissions','materialize','greeting','handoff'])assert.ok(flow.stages.includes(stage));
      result.flows[lang]=flow;
    }
    result.audio=await evaluate('__linkerTest.audio');assert.equal(result.audio.length,32);
    assert.ok(result.audio.every(a=>a.duration>0&&a.sampleRate>=22050));
    await screenshot('native-themed');
    await evaluate('window.__linkerThemeV4.replay();true');
    await until(async()=>(await evaluate('window.__linkerThemeV4.status()')).introStage==='ready','Replay not ready');
    await click('lang-zh');assert.equal((await evaluate('window.__linkerThemeV4.status()')).language,'zh');
    await click('sound');assert.ok(await evaluate('__linkerTest.bindings.some(m=>m.action==="sound"&&m.value===true)'));
    await click('sound');
    // This Mac host is an Electron window, not a Chromium Browser window.
    // Emulation tests renderer resize only; native fullscreen is reported separately.
    try{result.nativeWindow=await client.call('Browser.getWindowForTarget',{targetId:target.targetId});}
    catch(error){result.nativeFullscreen={tested:false,reason:error.message};}
    await client.call('Emulation.setDeviceMetricsOverride',{width:900,height:680,deviceScaleFactor:2,mobile:false},session);await delay(300);
    await screenshot('compact-ready');
    result.compact=await evaluate("({width:innerWidth,height:innerHeight,scale:document.getElementById('linker-pearl-v4-intro').style.getPropertyValue('--scale')})");
    await client.call('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:2,mobile:false},session);await delay(300);
    result.largeViewport=await evaluate('({width:innerWidth,height:innerHeight})');await screenshot('large-viewport-ready');
    await client.call('Emulation.clearDeviceMetricsOverride',{},session);
    await client.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},session);
    assert.equal((await evaluate('window.__linkerThemeV4.status()')).lastIntroResult,'skipped');
    await evaluate('window.__linkerThemeV4.replay();true');
    await until(async()=>(await evaluate('window.__linkerThemeV4.status()')).introStage==='ready','Restore replay not ready');
    await click('restore-original');assert.deepEqual(await evaluate(measure),result.before);
    assert.ok(await evaluate('__linkerTest.bindings.some(m=>m.action==="enabled"&&m.value===false)'));
    result.restore=true;
    await evaluate('Element.prototype.attachShadow=__linkerTest.attach;AudioContext.prototype.decodeAudioData=__linkerTest.decode;delete window.__linkerTest;delete window.__linker_verify;true');
    await screenshot('native-restored');
    result.preview={tested:false,reason:'Validate separately in a browser; Owl cannot create CDP targets'};result.passed=true;
  }catch(error){result.error=error.stack;process.exitCode=1;}
  finally{
    await closeOwned(client).catch(error=>{result.cleanupError=error.message;result.passed=false;process.exitCode=1;});
    result.officialAfter=(await appProcesses(app.executable)).filter(p=>!p.isolated).map(p=>p.pid);
    result.noOwnedProcess=!(await appProcesses(app.executable)).some(p=>p.pid===client.child.pid||p.command.includes(profile.browser));
    if(!result.noOwnedProcess||JSON.stringify(result.officialBefore)!==JSON.stringify(result.officialAfter)){result.passed=false;process.exitCode=1;}
    await writeFile(join(output,'result.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify({output,passed:result.passed,error:result.error,cleanupError:result.cleanupError,noOwnedProcess:result.noOwnedProcess}));
  }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await verify();

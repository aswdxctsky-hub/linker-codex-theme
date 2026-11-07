import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {MacLauncher} from './launcher.mjs';
import {discoverApp,appProcesses} from './context.mjs';
import {until,closeOwned} from './verify.mjs';

const integration=resolve(fileURLToPath(new URL('..',import.meta.url)));
await mkdir(join(integration,'verification'),{recursive:true});
const stateRoot=await mkdtemp(join(integration,'verification/mac-launcher-'));
const app=await discoverApp();
const officialBefore=(await appProcesses(app.executable)).filter(p=>!p.isolated).map(p=>p.pid);
const result={passed:false,scope:'real launcher; isolated native profile',officialBefore};
let launcher;
try{
  // A real running official process must remain untouched; this uses separate
  // launcher state but deliberately exercises the production process check.
  if(officialBefore.length){
    const busy=new MacLauncher({stateRoot:join(stateRoot,'busy'),quiet:true});
    result.busy=await busy.start();assert.equal(result.busy.reason,'restart-required');assert.equal(busy.client,undefined);
  }
  launcher=new MacLauncher({stateRoot,testProfile:true,quiet:true});
  result.cold=await launcher.start();assert.equal(result.cold.reason,'running');
  await until(async()=>(JSON.parse(await readFile(launcher.statePath,'utf8'))).mounted,'Launcher did not mount');
  const entry=[...launcher.sessions.values()][0],session=entry.sessionId,client=launcher.client;
  const evaluate=s=>client.evaluate(session,s);
  await until(async()=>(await evaluate('window.__linkerThemeV4?.status()')).introStage==='ready','Intro not ready');
  const duplicate=new MacLauncher({stateRoot,testProfile:true,quiet:true});
  result.duplicate=await duplicate.start();assert.equal(result.duplicate.reason,'already-running');assert.equal(duplicate.client,undefined);
  assert.equal((await appProcesses(app.executable)).filter(p=>p.command.includes(launcher.profile.browser)).length,1);
  // Use actual UI buttons inside the closed shadow root, found through CDP.
  const find=(node,id)=>{
    if(node.attributes?.some((v,i,a)=>i%2===0&&v==='id'&&a[i+1]===id))return node;
    for(const child of [...(node.children||[]),...(node.shadowRoots||[])]){const found=find(child,id);if(found)return found;}
    return null;
  };
  async function click(id){
    const tree=await client.call('DOM.getDocument',{depth:-1,pierce:true},session);
    const intro=find(tree.root,'linker-pearl-v4-intro'),node=find(intro||tree.root,id);
    assert.ok(node,'Missing UI control '+id);
    const {model}=await client.call('DOM.getBoxModel',{backendNodeId:node.backendNodeId},session),b=model.border;
    const point={x:(b[0]+b[2]+b[4]+b[6])/4,y:(b[1]+b[3]+b[5]+b[7])/4};
    await client.call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1},session);
    await client.call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1},session);
  }
  await click('lang-en');await click('sound');
  await until(async()=>{const c=JSON.parse(await readFile(launcher.configPath,'utf8'));return c.language==='en'&&c.sound===false;},'UI preferences were not persisted');
  await client.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},session);
  assert.equal((await evaluate('window.__linkerThemeV4.status()')).lastIntroResult,'skipped');
  await client.call('Page.reload',{},session);
  await until(async()=>{try{return (await evaluate('window.__linkerThemeV4?.status()'))?.installed;}catch{return false;}},'Theme did not remount after reload');
  result.reloaded=await evaluate('window.__linkerThemeV4.status()');
  assert.equal(result.reloaded.intro,false);assert.equal(result.reloaded.language,'en');
  // Replay then use the in-intro Original control, including the real binding.
  await evaluate('window.__linkerThemeV4.replay();true');
  await until(async()=>(await evaluate('window.__linkerThemeV4?.status()')).introStage==='ready','Replay not ready');
  await click('restore-original');
  await until(async()=>JSON.parse(await readFile(launcher.configPath,'utf8')).enabled===false,'Restore was not persisted');
  await delay(900);
  assert.equal(await evaluate("document.querySelectorAll('[id^=linker-pearl-v4-]').length"),0);
  assert.equal(await evaluate('window.__linkerThemeV4===undefined'),true);
  result.restoredConfig=JSON.parse(await readFile(launcher.configPath,'utf8'));
  await closeOwned(client);await launcher.cleanup();
  const disabled=new MacLauncher({stateRoot,testProfile:true,quiet:true});
  result.disabled=await disabled.start();assert.equal(result.disabled.reason,'disabled');assert.equal(disabled.client,undefined);
  // Explicit re-enable remains available, and a new app process may play once.
  launcher=new MacLauncher({stateRoot,testProfile:true,quiet:true,enable:true});
  result.reenabled=await launcher.start();assert.equal(result.reenabled.reason,'running');
  await until(async()=>(JSON.parse(await readFile(launcher.statePath,'utf8'))).mounted,'Re-enabled launcher did not mount');
  const s=[...launcher.sessions.values()][0].sessionId;
  await until(async()=>(await launcher.client.evaluate(s,'window.__linkerThemeV4?.status()')).introStage==='ready','Re-enabled intro not ready');
  result.reenabledStatus=await launcher.client.evaluate(s,'window.__linkerThemeV4.status()');
  assert.equal(result.reenabledStatus.intro,true);assert.equal(result.reenabledStatus.language,'en');
  // Command + Option + Shift + L is the Mac emergency restore chord.
  await launcher.client.call('Input.dispatchKeyEvent',{type:'keyDown',key:'L',code:'KeyL',modifiers:13,windowsVirtualKeyCode:76},s);
  await until(async()=>JSON.parse(await readFile(launcher.configPath,'utf8')).enabled===false,'Mac emergency restore did not persist');
  result.passed=true;
}catch(error){result.error=error.stack;process.exitCode=1;}
finally{
  if(launcher?.client&&launcher.client.child.exitCode===null&&launcher.client.child.signalCode===null)await closeOwned(launcher.client).catch(e=>{result.cleanupError=e.message;result.passed=false;process.exitCode=1;});
  await launcher?.cleanup();
  result.officialAfter=(await appProcesses(app.executable)).filter(p=>!p.isolated).map(p=>p.pid);
  result.noOwnedProcess=!(await appProcesses(app.executable)).some(p=>p.command.includes(stateRoot));
  if(!result.noOwnedProcess||JSON.stringify(officialBefore)!==JSON.stringify(result.officialAfter)){result.passed=false;process.exitCode=1;}
  await writeFile(join(stateRoot,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({stateRoot,...result}));
}

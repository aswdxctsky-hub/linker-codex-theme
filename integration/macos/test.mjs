import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseProcesses,processIdentity,BUNDLE_ID} from './context.mjs';
import {selectBuild,validateCatalog,verifyTheme} from './compatibility.mjs';
import {MacLauncher,cleanConfig,parseArgs} from './launcher.mjs';
import {launchPipe} from '../pipe-client.mjs';

const executable='/Applications/ChatGPT.app/Contents/MacOS/ChatGPT';
const build={version:'26.1103.32239',build:'25471',platform:'darwin-arm64',appAsarSha256:'a'.repeat(64),runtimeRevision:1,validation:'isolated-native'};
const catalog={schema:1,bundleIdentifier:BUNDLE_ID,builds:[build]};
test('cold start, running app, helpers, isolated profiles, spaced app paths',()=>{
  assert.deepEqual(parseProcesses('',executable),[]);
  const rows=parseProcesses(`101 1 ${executable}\n102 101 ${executable} Helper\n103 1 /bin/sh\n104 1 ${executable}\n105 1 /Applications/ChatGPT.app/Contents/Frameworks/Helper`,executable,`101 ${executable}\n103 /bin/sh -c ${executable}\n104 ${executable} --user-data-dir=/tmp/linker/browser`);
  assert.equal(rows[0].pid,101);assert.equal(rows[0].isolated,false);
  assert.equal(rows.find(x=>x.pid===104).isolated,true);
  assert.ok(!rows.some(x=>[102,103,105].includes(x.pid)));
  const spaced='/Users/Test/Applications/Chat GPT.app/Contents/MacOS/ChatGPT';
  assert.equal(parseProcesses(`77 1 ${spaced}`,spaced)[0].pid,77);
});
test('Mac records cannot accept Windows, a different app, architecture, build or runtime',()=>{
  const app={bundleIdentifier:BUNDLE_ID,...build};assert.equal(selectBuild(catalog,app),build);
  for(const change of [{version:'26.1104.1'},{build:'25472'},{platform:'darwin-x64'},{bundleIdentifier:'com.other.app'}])assert.equal(selectBuild(catalog,{...app,...change}),null);
  assert.equal(selectBuild({...catalog,builds:[{...build,runtimeRevision:2}]},app),null);
  for(const change of [{platform:'win32-x64'},{appAsarSha256:'invalid'},{validation:'guessed'}])assert.throws(()=>validateCatalog({...catalog,builds:[{...build,...change}]}));
});
test('arguments and isolated storage requirements are enforced',()=>{
  assert.throws(()=>parseArgs(['--test-profile']));assert.throws(()=>parseArgs(['--app']));
  assert.throws(()=>parseArgs(['--enable','--restore']));assert.throws(()=>parseArgs(['--unknown']));
  assert.equal(parseArgs(['--diagnose','--quiet']).diagnose,true);
  assert.deepEqual(cleanConfig({enabled:false,language:'en',sound:false,unexpected:'x'}),{enabled:false,language:'en',sound:false});
});
test('lock ownership, stale PID recovery and restore survive a new launcher',async()=>{
  const root=await mkdtemp(join(tmpdir(),'linker-mac-test-'));
  try{
    const first=new MacLauncher({stateRoot:root,testProfile:true,quiet:true});
    assert.equal(await first.acquire(),true);
    const second=new MacLauncher({stateRoot:root,testProfile:true,quiet:true});
    assert.equal(await second.acquire(),false);
    await first.saveConfig({enabled:false,language:'en',sound:false});await first.cleanup();
    assert.equal(await second.acquire(),true);await second.cleanup();
    await writeFile(join(root,'launcher.lock'),JSON.stringify({pid:process.pid,identity:'stale identity',nonce:'old'}));
    const third=new MacLauncher({stateRoot:root,testProfile:true,quiet:true});
    assert.equal(await third.acquire(),true);await third.restore();await third.cleanup();
    const next=new MacLauncher({stateRoot:root,testProfile:true,quiet:true});
    assert.deepEqual(JSON.parse(await readFile(next.configPath,'utf8')),{enabled:false,language:'en',sound:false});
    assert.ok(await processIdentity(process.pid));assert.equal(await processIdentity(-1),null);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('missing or changed theme artifacts fail closed',async()=>{
  const root=await mkdtemp(join(tmpdir(),'linker-integrity-'));
  try{
    await assert.rejects(()=>verifyTheme(root));await mkdir(join(root,'macos'));
    await writeFile(join(root,'sample.js'),'changed');
    await writeFile(join(root,'macos/manifest.json'),JSON.stringify({schema:1,files:{'sample.js':'a'.repeat(64)}}));
    await assert.rejects(()=>verifyTheme(root),/校验失败/);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('pipe spawn failure rejects pending commands immediately',async()=>{
  const client=launchPipe('/nonexistent/linker-test-binary');
  client.events.on('launchError',()=>{});
  await assert.rejects(()=>client.call('Browser.getVersion'),/ENOENT/);client.disconnect();
});

// Check the extracted native shell CSS against the installed theme in a local fixture.
// This does not read a logged-in page or control the user's running app.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {launchPipe} from './pipe-client.mjs';

const output=resolve('integration/verification/background');
await mkdir(output,{recursive:true});
const cssRoot=process.argv[2];
if(!cssRoot)throw Error('Supply a directory containing CSS extracted from the current official application.');
const runtime=await readFile('integration/bundle/runtime.js','utf8');
const media=JSON.parse(await readFile('integration/bundle/media.json','utf8'));
const themeCss=runtime.match(/theme\.textContent=`([\s\S]*?)`;/)[1].replace('${MEDIA.images.background}',media.images.background);
const nativeCss=(await Promise.all((await readdir(cssRoot)).filter(n=>n.endsWith('.css')).map(n=>readFile(join(cssRoot,n),'utf8')))).join('\n');
const html=`<!doctype html><html data-codex-os="win32" data-codex-window-type="electron"><head><style>
:root{--color-surface:#fff;--color-surface-secondary:#f7f7f7;--color-surface-elevated-secondary:#f5f5f5;--color-surface-elevated:#fff;--color-text:#263440;--color-border:#d8e1e7;--app-shell-titlebar-height:0px;--inset-toolbar:0px;--radius-xl-base:12px;--spacing:4px}
*{box-sizing:border-box}body{margin:0;font:15px 'Segoe UI','Microsoft YaHei',sans-serif;color:#263440}#root{height:900px;display:grid;grid-template-columns:250px 1fr 260px;gap:14px;padding:40px 16px 16px}.MainContentSurface-EnuIYE{position:relative;border-radius:12px}.WorkspaceContent-dnr6uY{position:relative;isolation:isolate;height:100%;padding:36px}header{padding:20px}aside{padding:25px;border-radius:12px}.sidebar-navigation{height:100%}.message{line-height:1.9;margin:38px 0}.ComposerLayoutRoot-XCKS7O{position:absolute;bottom:30px;left:35px;right:35px;padding:24px;border-radius:20px}.native-code{padding:20px;background:var(--codeblock-background-color,#f4f4f4);border-radius:8px}.native-menu{padding:24px;background:var(--color-surface-elevated);border-radius:12px}
${nativeCss}</style></head><body><div id="root"><aside class="LeftPanel-e8ghK3"><nav class="sidebar-navigation">ChatGPT<br><br>新聊天<br><br>设计 GPT 应用启动动画</nav></aside><main data-app-shell-unified-tab-strip="true" class="PageSurfaceLayout-oqnRfB"><section data-app-shell-main-surface="default" class="MainContentSurface-EnuIYE" style="height:100%"><div class="WorkspaceContent-dnr6uY"><header data-app-shell-main-titlebar>对话背景预览</header><div class="message">同一张背景延续到对话区域。<br>文字保持原有清晰度，输入区域保留适当遮罩。</div><pre class="native-code">const theme = 'pearl';</pre><div class="ComposerLayoutRoot-XCKS7O" data-composer-surface-variant="default">输入消息…</div></div></section></main><aside data-app-shell-focus-area="right-panel"><div class="native-menu">来源与菜单</div></aside></div></body></html>`;
const browser=launchPipe('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless=new','--no-first-run','--no-default-browser-check','--disable-extensions','--user-data-dir='+join(output,'browser')]);
let result;
try{
 await browser.call('Browser.getVersion');
 const {targetId}=await browser.call('Target.createTarget',{url:'about:blank'});
 const {sessionId}=await browser.call('Target.attachToTarget',{targetId,flatten:true});
 await browser.call('Emulation.setDeviceMetricsOverride',{width:1500,height:900,deviceScaleFactor:1,mobile:false},sessionId);
 const {frameTree}=await browser.call('Page.getFrameTree',{},sessionId);
 await browser.call('Page.setDocumentContent',{frameId:frameTree.frame.id,html},sessionId);
 const measure=`(()=>{const css=(q,p)=>getComputedStyle(document.querySelector(q),p);return {main:css('[data-app-shell-main-surface]').backgroundColor,underlay:css('.WorkspaceContent-dnr6uY','::before').backgroundColor,sidebar:css('.LeftPanel-e8ghK3').backgroundColor,right:css('[data-app-shell-focus-area]').backgroundColor,composer:css('.ComposerLayoutRoot-XCKS7O').backgroundColor,menu:css('.native-menu').backgroundColor,code:css('.native-code').backgroundColor,textOpacity:css('.message').opacity,background:css('body').backgroundImage==='none'?'none':'image',bounds:document.querySelector('.message').getBoundingClientRect().toJSON()}})()`;
 const before=await browser.evaluate(sessionId,measure);
 await browser.evaluate(sessionId,`document.documentElement.dataset.linkerPearl='v4';var patch=document.createElement('style');patch.id='theme-test';patch.textContent=${JSON.stringify(themeCss)};document.head.append(patch);true`);
 const after=await browser.evaluate(sessionId,measure);
 assert.equal(before.main,'rgb(255, 255, 255)');
 assert.equal(before.underlay,'rgb(255, 255, 255)');
 assert.equal(after.main,'rgba(0, 0, 0, 0)');
 assert.equal(after.underlay,'rgba(0, 0, 0, 0)');
 assert.equal(after.sidebar,'rgba(247, 250, 253, 0.26)');
 assert.equal(after.right,'rgba(247, 250, 253, 0.34)');
 assert.equal(after.composer,'rgba(250, 252, 255, 0.84)');
 assert.equal(after.menu,'rgba(252, 254, 255, 0.98)');
 assert.equal(after.code,'rgb(242, 247, 251)');
 assert.equal(after.textOpacity,'1');assert.equal(after.background,'image');assert.deepEqual(after.bounds,before.bounds);
 await browser.evaluate(sessionId,`new Promise(resolve=>{var img=new Image();img.onload=resolve;img.src=${JSON.stringify(media.images.background)};})`);
 const shot=await browser.call('Page.captureScreenshot',{format:'png'},sessionId);
 await writeFile(join(output,'fixture-after.png'),Buffer.from(shot.data,'base64'));
 await browser.evaluate(sessionId,"document.getElementById('theme-test').remove();delete document.documentElement.dataset.linkerPearl;true");
 const restored=await browser.evaluate(sessionId,measure);assert.deepEqual(restored,before);
 result={passed:true,scope:'Extracted native CSS fixture, not the logged-in app',before,after,restored};
 await writeFile(join(output,'css-check.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify({passed:true,mainAndUnderlayTransparent:true,controlsReadable:true,layoutUnchanged:true,restorationPassed:true}));
}finally{await browser.call('Browser.close').catch(()=>{});browser.disconnect();}

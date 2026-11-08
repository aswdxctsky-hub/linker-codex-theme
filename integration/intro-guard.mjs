// Installed before subsequent documents load; never depends on the native app's DOM.
export const INTRO_GUARD_SOURCE='('+function(){
 if(window.top!==window||location.protocol!=='app:'||location.hostname!=='-'||location.pathname!=='/index.html')return;
 if(window.__linkerIntroGuard||window.__linkerSkipIntro)return;
 const style=document.createElement('style');style.id='linker-pearl-v4-reload-guard';
 style.textContent='html::after{content:""!important;display:block!important;opacity:1!important;visibility:visible!important;position:fixed!important;inset:40px 0 0!important;z-index:2147483647!important;background:#f5f8fb!important;pointer-events:auto!important;}';
 let timer,observer,closed=false;
 const remove=()=>{if(closed)return;closed=true;clearTimeout(timer);observer?.disconnect();style.remove();document.removeEventListener('keydown',escape,true);delete window.__linkerIntroGuard;};
 const escape=event=>{if(event.key==='Escape'){window.__linkerSkipIntro=true;remove();window.__linkerThemeV4?.skipIntro();}};
 window.__linkerIntroGuard={remove};document.addEventListener('keydown',escape,true);
 const attach=()=>{if(document.documentElement){document.documentElement.append(style);observer?.disconnect();}};
 if(document.documentElement)attach();else{observer=new MutationObserver(attach);observer.observe(document,{childList:true,subtree:true});}
 timer=setTimeout(remove,45000);
}.toString()+')();';

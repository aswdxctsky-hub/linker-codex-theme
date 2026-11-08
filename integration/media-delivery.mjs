// Put the first frame on screen before transporting videos and both audio packs.
import {randomUUID} from 'node:crypto';
export async function mountTheme(client,sessionId,runtime,media,settings){
 const mountId=settings.mountId||randomUUID(),matches='window.__linkerThemeV4?.status().mountId==='+JSON.stringify(mountId);
 const initial={images:{background:media.images.background,logo:media.images.logo},voices:{}};
 const mounted=await client.evaluate(sessionId,runtime+'('+JSON.stringify({...settings,mountId,media:initial,streaming:true})+')');
 const language=settings.config?.language==='en'?'en':'zh';
 const delivery=(async()=>{
  for(const lang of [language,language==='zh'?'en':'zh']){
   const pack={images:{},voices:Object.fromEntries(Object.entries(media.voices).filter(([k])=>k.startsWith(lang+'_')))};
   pack.images[lang==='zh'?'video':'videoEn']=media.images[lang==='zh'?'video':'videoEn'];
   if(lang===language)pack.images.portrait=media.images.portrait;
   const accepted=await client.evaluate(sessionId,'('+matches+')?window.__linkerThemeV4.loadMedia('+JSON.stringify(pack)+'):false');
   if(!accepted)return;
  }
 })();
 delivery.catch(async error=>{await client.evaluate(sessionId,'if('+matches+')window.__linkerThemeV4.failMedia();true').catch(()=>{});});
 return {mounted,delivery};
}

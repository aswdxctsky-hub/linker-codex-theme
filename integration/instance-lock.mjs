import net from 'node:net';
import {createHash,randomUUID} from 'node:crypto';
import {realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';

// An OS-owned endpoint, not a persisted PID, is the authority for a live instance.
export async function acquireInstance(root,onActivate=async()=>{}){
 const canonical=await realpath(root),key=createHash('sha256').update(process.platform==='win32'?canonical.toLowerCase():canonical).digest('hex').slice(0,32);
 const endpoint=process.platform==='win32'?'\\\\.\\pipe\\Linker.CodexTheme.'+key:join(tmpdir(),'linker-'+key+'.sock');
 const sessionId=randomUUID();
 for(let attempt=0;attempt<8;attempt++){
  const sockets=new Set();
  const server=net.createServer(socket=>{
   sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});socket.setTimeout(2500,()=>socket.destroy());
   let data='';socket.on('data',async chunk=>{data+=chunk;if(data.length>2048){socket.destroy();return;}if(!data.includes('\n'))return;socket.removeAllListeners('data');
    try{const request=JSON.parse(data.trim());if(request.protocol!==1||typeof request.nonce!=='string'||request.nonce.length>80)throw Error('Invalid request');await onActivate(request.action);socket.end(JSON.stringify({protocol:1,nonce:request.nonce,pid:process.pid,sessionId})+'\n');}catch{socket.destroy();}
   });
  });
  try{
   await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(endpoint,()=>{server.removeListener('error',reject);resolve();});});
   return {owned:true,sessionId,endpoint,close:()=>new Promise(resolve=>{for(const socket of sockets)socket.destroy();server.close(resolve);})};
  }catch(error){
   server.close();if(error.code!=='EADDRINUSE')throw error;
   try{
    const owner=await new Promise((resolve,reject)=>{
     const socket=net.createConnection(endpoint),nonce=randomUUID();let data='';
     socket.on('error',reject);socket.setTimeout(2500,()=>{socket.destroy();reject(Error('Instance handshake timeout'));});
     socket.on('connect',()=>socket.write(JSON.stringify({protocol:1,nonce,action:'activate'})+'\n'));
     socket.on('data',chunk=>{data+=chunk;if(data.length>2048){socket.destroy();reject(Error('Invalid instance reply'));return;}if(!data.includes('\n'))return;try{const reply=JSON.parse(data.trim());if(reply.protocol!==1||reply.nonce!==nonce||typeof reply.sessionId!=='string')throw Error('Invalid instance identity');socket.destroy();resolve(reply);}catch(error){socket.destroy();reject(error);}});
     socket.on('end',()=>reject(Error('Instance closed during handshake')));
    });
    return {owned:false,owner};
   }catch(error){if(attempt===7)throw error;await delay(100);}
  }
 }
}

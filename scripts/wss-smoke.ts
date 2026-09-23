import {Browser} from '../src/browser/Browser.js';

const origin='https://ws.postman-echo.com',payload='FreeComputerUse TLS/WSS check';
const browser=await new Browser({allowedOrigins:[origin]}).launch();
try{
  const echoed=await browser.page.evaluate(({origin,payload})=>new Promise<string>((resolve,reject)=>{
    const socket=new WebSocket(origin.replace(/^https:/,'wss:')+'/raw');
    const timer=setTimeout(()=>{socket.close();reject(new Error('WSS echo timed out'));},10000);
    socket.addEventListener('open',()=>socket.send(payload),{once:true});
    socket.addEventListener('message',event=>{clearTimeout(timer);socket.close();resolve(String(event.data));},{once:true});
    socket.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('WSS connection failed'));},{once:true});
  }),{origin,payload});
  if(echoed!==payload)throw new Error(`Unexpected WSS echo: ${echoed}`);
  console.log('Trusted WSS smoke passed: Chrome validated TLS and echoed the synthetic message.');
}finally{await browser.close();}

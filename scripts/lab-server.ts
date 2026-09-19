import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function startLab(port=0){
  const root=resolve('docs');
  const server=createServer(async(req,res)=>{
    try{
      const pathname=decodeURIComponent(new URL(req.url??'/','http://127.0.0.1').pathname),file=resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
      if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
      const content=await readFile(file);res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.csv':'text/csv','.txt':'text/plain','.mp4':'video/mp4','.jpg':'image/jpeg'} as Record<string,string>)[extname(file)]??'application/octet-stream','Cache-Control':'no-store'});res.end(content);
    }catch{res.writeHead(404);res.end('Not found');}
  });
  await new Promise<void>(resolve=>server.listen(port,'127.0.0.1',resolve));
  const address=server.address();if(!address||typeof address==='string')throw new Error('Lab server failed');
  return {url:`http://127.0.0.1:${address.port}/lab/`,close:()=>new Promise<void>(resolve=>server.close(()=>resolve()))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const lab=await startLab(Number(process.env.PORT??4319));console.log(`Styled lab: ${lab.url}`);}

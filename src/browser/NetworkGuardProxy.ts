import { lookup } from 'node:dns/promises';
import type { LookupOptions } from 'node:dns';
import { Agent, createServer, request as requestHttp, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { BlockList, isIP, createConnection, type LookupFunction } from 'node:net';
import type { Duplex } from 'node:stream';

type Address={address:string;family:number};
export type HostResolver=(hostname:string)=>Promise<Address[]>;
const systemLookup:HostResolver=hostname=>lookup(hostname,{all:true,order:'verbatim'});
const restrictedIPv4=new BlockList(),restrictedIPv6=new BlockList();
for(const range of ['0.0.0.0/8','10.0.0.0/8','100.64.0.0/10','127.0.0.0/8','169.254.0.0/16','172.16.0.0/12','192.0.0.0/24','192.0.2.0/24','192.88.99.0/24','192.168.0.0/16','198.18.0.0/15','198.51.100.0/24','203.0.113.0/24','224.0.0.0/4','240.0.0.0/4'])restrictedIPv4.addSubnet(range.split('/')[0]!,Number(range.split('/')[1]),'ipv4');
for(const range of ['::/96','::ffff:0:0/96','64:ff9b:1::/48','100::/64','100:0:0:1::/64','2001::/23','2001:db8::/32','2002::/16','3fff::/20','5f00::/16','fc00::/7','fe80::/10','fec0::/10','ff00::/8'])restrictedIPv6.addSubnet(range.split('/')[0]!,Number(range.split('/')[1]),'ipv6');
const nat64WellKnown=new BlockList();nat64WellKnown.addSubnet('64:ff9b::',96,'ipv6');
function embeddedIPv4(address:string){
  let value=address.toLowerCase();
  const dotted=value.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if(dotted){const octets=dotted[1]!.split('.').map(Number);value=value.replace(dotted[1]!,`${((octets[0]!<<8)|octets[1]!).toString(16)}:${((octets[2]!<<8)|octets[3]!).toString(16)}`);}
  const [leftRaw,rightRaw='']=value.split('::'),left=leftRaw?leftRaw.split(':'):[],right=rightRaw?rightRaw.split(':'):[];
  const words=value.includes('::')?[...left,...Array(8-left.length-right.length).fill('0'),...right]:value.split(':');
  const high=parseInt(words[6]!,16),low=parseInt(words[7]!,16);
  return`${high>>8}.${high&255}.${low>>8}.${low&255}`;
}
const isRestricted=(address:Address)=>address.family===4?restrictedIPv4.check(address.address,'ipv4'):address.family===6?restrictedIPv6.check(address.address,'ipv6')||(nat64WellKnown.check(address.address,'ipv6')&&restrictedIPv4.check(embeddedIPv4(address.address),'ipv4')):true;
function pinnedLookup(addresses:Address[]):LookupFunction{
  return (_hostname:string,options:LookupOptions,callback)=>{
    const available=options.family?addresses.filter(item=>item.family===options.family):addresses;
    if(options.all){callback(null,available);return;}
    const first=available[0];
    if(first){callback(null,first.address,first.family);return;}
    callback(Object.assign(new Error('No vetted address for requested family'),{code:'ENOTFOUND'}),'',0);
  };
}

export async function resolveAddresses(hostname:string,resolver:HostResolver=systemLookup,allowPrivate=false){
  let timer:NodeJS.Timeout|undefined;
  try{
    const addresses=await Promise.race([
      resolver(hostname),
      new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('DNS lookup timed out')),2500);}),
    ]);
    if(!addresses.length||(!allowPrivate&&addresses.some(isRestricted)))throw new Error('Destination resolves to a private or reserved address');
    return addresses;
  }catch{throw new Error('Destination DNS lookup failed or resolved to a private or reserved address');}
  finally{if(timer)clearTimeout(timer);}
}
export const resolvePublicAddresses=(hostname:string,resolver:HostResolver=systemLookup)=>resolveAddresses(hostname,resolver);

export class NetworkGuardProxy {
  private server?:Server;
  private readonly sockets=new Set<Duplex>();
  private readonly agent=new Agent({keepAlive:true,maxSockets:32});
  constructor(private readonly options:{allowPrivate?:boolean;resolver?:HostResolver;permits?:(url:string)=>boolean}={}){}

  async start(){
    const server=createServer((request,response)=>void this.forward(request,response));
    server.on('connection',socket=>this.track(socket));
    server.on('connect',(request,socket,head)=>void this.tunnel(request,socket,head));
    server.on('upgrade',(request,socket,head)=>void this.upgrade(request,socket,head));
    this.server=server;
    await new Promise<void>((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>{server.off('error',reject);resolve();});
    });
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('The local network guard proxy did not bind');
    return `http://127.0.0.1:${address.port}`;
  }

  async close(){
    const server=this.server;this.server=undefined;
    for(const socket of this.sockets)socket.destroy();
    this.sockets.clear();this.agent.destroy();
    if(server?.listening)await new Promise<void>(resolve=>server.close(()=>resolve()));
  }

  private track(socket:Duplex){
    this.sockets.add(socket);
    socket.once('close',()=>this.sockets.delete(socket));
    socket.on('error',()=>{});
    return socket;
  }

  private async destinations(hostname:string):Promise<Address[]>{
    const normalized=hostname.replace(/^\[|\]$/g,'');
    const family=isIP(normalized);
    if(family)return[{address:normalized,family}];
    return resolveAddresses(normalized,this.options.resolver,this.options.allowPrivate===true);
  }

  private connectionOptions(hostname:string,addresses:Address[]){
    const normalized=hostname.replace(/^\[|\]$/g,''),family=isIP(normalized);
    return family?{host:normalized,family}:{host:normalized,lookup:pinnedLookup(addresses),autoSelectFamily:true};
  }

  private parseHttpURL(request:IncomingMessage){
    const raw=request.url??'';
    const parsed=raw.startsWith('ws://')?new URL(raw.replace(/^ws:/,'http:')):raw.startsWith('wss://')?new URL(raw.replace(/^wss:/,'https:')):new URL(raw,`http://${request.headers.host??''}`);
    if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)throw new Error('Unsupported proxy destination');
    return parsed;
  }

  private permitted(url:URL){return !this.options.permits||this.options.permits(url.href);}

  private deny(response:ServerResponse,status=403){
    if(response.headersSent){response.destroy();return;}
    response.writeHead(status,{'content-type':'text/plain; charset=utf-8','connection':'close'});
    response.end(status===403?'Destination blocked by local browser policy':'Destination connection failed');
  }

  private async forward(request:IncomingMessage,response:ServerResponse){
    try{
      const url=this.parseHttpURL(request);
      if(url.protocol!=='http:')throw new Error('HTTPS requests require a tunnel');
      if(!this.permitted(url))throw new Error('Origin blocked by local browser policy');
      const addresses=await this.destinations(url.hostname);
      const headers:Record<string,string|string[]|undefined>={...request.headers,host:url.host};
      delete headers['proxy-authorization'];delete headers['proxy-connection'];
      const upstream=requestHttp({hostname:url.hostname.replace(/^\[|\]$/g,''),...this.connectionOptions(url.hostname,addresses),port:Number(url.port)||80,method:request.method,path:`${url.pathname}${url.search}`,headers,agent:this.agent},incoming=>{
        response.writeHead(incoming.statusCode??502,incoming.statusMessage,incoming.headers);
        incoming.pipe(response);
      });
      upstream.on('error',()=>this.deny(response,502));
      request.pipe(upstream);
    }catch{this.deny(response);}
  }

  private async tunnel(request:IncomingMessage,client:Duplex,head:Buffer){
    try{
      const url=new URL(`https://${request.url??''}`);
      if(url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Invalid tunnel destination');
      const port=Number(url.port)||443;
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      const first=head.length?head:await this.readTunnelPreface(client);
      const tls=first[0]===0x16,plainWebSocket=first.subarray(0,4).toString('ascii')==='GET ';
      if(!tls&&!plainWebSocket){client.destroy();return;}
      const origin=new URL(`${tls?'https:':'http:'}//${url.host}`);
      if(!this.permitted(origin)){
        if(plainWebSocket)client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');else client.destroy();
        return;
      }
      const addresses=await this.destinations(url.hostname);
      const upstream=this.track(createConnection({...this.connectionOptions(url.hostname,addresses),port}));
      upstream.once('connect',()=>{
        if(client.destroyed){upstream.destroy();return;}
        upstream.write(first);
        client.pipe(upstream);upstream.pipe(client);
      });
      upstream.once('error',()=>{if(!client.destroyed){if(plainWebSocket)client.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');else client.destroy();}});
      client.once('close',()=>upstream.destroy());
    }catch{if(!client.destroyed)client.destroy();}
  }

  private readTunnelPreface(client:Duplex){
    return new Promise<Buffer>((resolve,reject)=>{
      const done=(error:Error|undefined,value?:Buffer)=>{
        clearTimeout(timer);client.off('data',onData);client.off('error',onError);client.off('close',onClose);
        if(error)reject(error);else resolve(value!);
      };
      const onData=(value:Buffer|string)=>{
        client.pause();const first=Buffer.isBuffer(value)?value:Buffer.from(value);
        if(first.length>65536)done(new Error('Tunnel preface is too large'));else done(undefined,first);
      };
      const onError=()=>done(new Error('Tunnel closed before protocol negotiation'));
      const onClose=()=>done(new Error('Tunnel closed before protocol negotiation'));
      const timer=setTimeout(()=>done(new Error('Tunnel protocol negotiation timed out')),5000);
      client.once('data',onData);client.once('error',onError);client.once('close',onClose);client.resume();
    });
  }

  private async upgrade(request:IncomingMessage,client:Duplex,head:Buffer){
    try{
      const url=this.parseHttpURL(request);
      if(url.protocol!=='http:')throw new Error('Unsupported upgrade destination');
      if(!this.permitted(url))throw new Error('Origin blocked by local browser policy');
      const addresses=await this.destinations(url.hostname),headers:Record<string,string|string[]|undefined>={...request.headers,host:url.host};
      delete headers['proxy-authorization'];delete headers['proxy-connection'];
      const upstreamRequest=requestHttp({hostname:url.hostname.replace(/^\[|\]$/g,''),...this.connectionOptions(url.hostname,addresses),port:Number(url.port)||80,method:request.method,path:`${url.pathname}${url.search}`,headers,agent:this.agent});
      upstreamRequest.on('upgrade',(response,socket,upstreamHead)=>{
        this.track(socket);
        client.write(`HTTP/${response.httpVersion} ${response.statusCode} ${response.statusMessage}\r\n`);
        for(let i=0;i<response.rawHeaders.length;i+=2)client.write(`${response.rawHeaders[i]}: ${response.rawHeaders[i+1]}\r\n`);
        client.write('\r\n');
        if(upstreamHead.length)client.write(upstreamHead);
        if(head.length)socket.write(head);
        client.pipe(socket);socket.pipe(client);
        client.once('close',()=>socket.destroy());
      });
      upstreamRequest.on('response',response=>{
        client.write(`HTTP/${response.httpVersion} ${response.statusCode} ${response.statusMessage}\r\n`);
        for(let i=0;i<response.rawHeaders.length;i+=2)client.write(`${response.rawHeaders[i]}: ${response.rawHeaders[i+1]}\r\n`);
        client.write('\r\n');response.pipe(client);
      });
      upstreamRequest.on('error',()=>{if(!client.destroyed)client.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');});
      request.pipe(upstreamRequest);
    }catch{if(!client.destroyed)client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');}
  }
}

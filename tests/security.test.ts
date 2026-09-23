import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createSocket} from 'node:dgram';
import {createServer,request as httpRequest} from 'node:http';
import {createServer as createHTTPSServer} from 'node:https';
import {connect as connectTLS} from 'node:tls';
import {chmod,mkdir,mkdtemp,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Agent} from '../src/agent/Agent.js';
import {TraceStore} from '../src/history/TraceStore.js';
import {PlanSchema} from '../src/actions/schema.js';
import {TokenBudget} from '../src/agent/TokenBudget.js';
import {goalCriteria} from '../src/agent/goalCriteria.js';

test('normal mode rejects website access before any site request; Ultra mode bypasses the gate',async()=>{
  let visits=0;const server=createServer((_req,res)=>{visits++;res.end('<h1>Free test site</h1><p>Ready</p>');});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address() as {port:number},url=`http://localhost:${address.port}`;
  const store=new TraceStore(':memory:'),plan=PlanSchema.parse({goal:'Read',steps:['Read'],actions:[{type:'extract',format:'text',key:'text'}],completion:[{type:'text_exists',value:'Ready'}],continue:false});
  const normal=new Agent({store,browser:{allowedOrigins:[url]}});normal.control.on('approval',()=>normal.control.reject());
  const ultra=new Agent({store,mode:'ultra'});let gates=0;ultra.control.on('approval',()=>{gates++;});
  try{
    const rejected=await normal.run('Read the page',url,plan);assert.equal(rejected.status,'failed');assert.equal(visits,0);
    const accepted=await ultra.run('Read the page',url,plan);assert.equal(accepted.status,'completed',accepted.error??'Task failed');assert(visits>0);assert.equal(gates,0);
  }finally{await normal.close();await ultra.close();store.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test('concurrent token reservations cannot oversubscribe the input/output budget',()=>{
  const budget=new TokenBudget({maxLLMCalls:3,maxInputTokens:100,maxOutputTokens:300});
  const first=budget.reserve(60,200);assert.throws(()=>budget.reserve(50,100),/input budget/);
  const second=budget.reserve(20,200);assert.equal(second.maxOutput,100);assert.throws(()=>budget.reserve(1,100),/output budget/);
  budget.record({input:15,output:80},second.id);assert.equal(budget.pendingInput,60);
  budget.record({input:50,output:180},first.id);assert.equal(budget.pendingInput,0);
  assert.throws(()=>budget.record({input:-1,output:0}),/Invalid/);
});
test('trusted extraction criteria derive from the original goal',()=>{
  assert.deepEqual(goalCriteria('Extract the first five stories'),[{type:'extraction_created'},{type:'extraction_count',min:5,max:5}]);
  assert.deepEqual(goalCriteria('Fill the form using my profile'),[]);
});

import {once} from 'node:events';
import {Control} from '../src/agent/Control.js';
import {Browser,assertNoPrivateDNSResolution} from '../src/browser/Browser.js';
import {NetworkGuardProxy,resolvePublicAddresses} from '../src/browser/NetworkGuardProxy.js';
import {Observer} from '../src/browser/Observer.js';
import {Executor} from '../src/actions/executor.js';
import {VariableResolver} from '../src/profile/VariableResolver.js';

function requestThroughProxy(proxyURL:string,destination:string){
  const proxy=new URL(proxyURL),url=new URL(destination);
  return new Promise<{status:number;body:string}>((resolve,reject)=>{
    const request=httpRequest({hostname:proxy.hostname,port:Number(proxy.port),path:url.href,headers:{host:url.host},agent:false},response=>{
      const chunks:Buffer[]=[];response.on('data',chunk=>chunks.push(Buffer.from(chunk)));
      response.on('end',()=>resolve({status:response.statusCode??0,body:Buffer.concat(chunks).toString('utf8')}));
    });
    request.on('error',reject);request.end();
  });
}

test('credentialed initial URLs are rejected before agent traces persist them',async()=>{
  const store=new TraceStore(':memory:'),agent=new Agent({store,mode:'ultra'});
  try{
    await assert.rejects(agent.run('Open this page','https://user:private-token@example.test/'),/without embedded credentials/);
    assert.equal(agent.active,false);assert.equal(store.history().length,0);
  }finally{await agent.close();store.close();}
});

test('DNS guard rejects a hostname resolving to loopback but leaves explicit IPs to the origin policy',async()=>{
  await assert.rejects(assertNoPrivateDNSResolution('http://localhost:8123'),/private or reserved address/);
  await assert.doesNotReject(assertNoPrivateDNSResolution('http://127.0.0.1:8123'));
  assert.equal(new Browser({allowedOrigins:['http://127.0.0.1:8123']}).permits('http://127.0.0.1:8123/'),true);
  assert.equal(new Browser().permits('http://127.0.0.1:8123/'),false);
  for(const address of ['0.1.2.3','10.0.0.1','100.64.0.1','127.0.0.1','169.254.1.1','172.16.0.1','192.0.0.1','192.0.2.1','192.88.99.1','192.168.0.1','198.18.0.1','198.51.100.1','203.0.113.1','224.0.0.1','240.0.0.1']){
    await assert.rejects(resolvePublicAddresses('private-ipv4.test',async()=>[{address,family:4}]),/private or reserved address/,address);
  }
  await assert.doesNotReject(resolvePublicAddresses('public-ipv4.test',async()=>[{address:'8.8.8.8',family:4}]));
  for(const address of ['::1','::ffff:127.0.0.1','::7f00:1','fc00::1','fe80::1','ff02::1','2001:db8::1','64:ff9b::a00:1']){
    await assert.rejects(resolvePublicAddresses('private-ipv6.test',async()=>[{address,family:6}]),/private or reserved address/,address);
  }
  await assert.doesNotReject(resolvePublicAddresses('public-ipv6.test',async()=>[{address:'2606:4700:4700::1111',family:6}]));
  await assert.doesNotReject(resolvePublicAddresses('public-nat64.test',async()=>[{address:'64:ff9b::808:808',family:6}]));
});

test('DNS64 discovery blocks private IPv4 embedded in every RFC 6052 prefix length',async()=>{
  const cases=[
    {length:32,pair:['2606:4700:c000:aa::','2606:4700:c000:ab::'],private:'2606:4700:c0a8:1::',public:'2606:4700:808:808::'},
    {length:40,pair:['2606:4700:abc0:0:aa::','2606:4700:abc0:0:ab::'],private:'2606:4700:abc0:a800:1::',public:'2606:4700:ab08:808:8::'},
    {length:48,pair:['2606:4700:abcd:c000:0:aa00::','2606:4700:abcd:c000:0:ab00::'],private:'2606:4700:abcd:c0a8:0:100::',public:'2606:4700:abcd:808:8:800::'},
    {length:56,pair:['2606:4700:abcd:12c0:0:aa::','2606:4700:abcd:12c0:0:ab::'],private:'2606:4700:abcd:12c0:a8:1::',public:'2606:4700:abcd:1208:8:808::'},
    {length:64,pair:['2606:4700:abcd:1234:c0:0:aa00:0','2606:4700:abcd:1234:c0:0:ab00:0'],private:'2606:4700:abcd:1234:c0:a800:100:0',public:'2606:4700:abcd:1234:8:808:800:0'},
    {length:96,pair:['2606:4700:abcd:1234:5678:9abc:c000:aa','2606:4700:abcd:1234:5678:9abc:c000:ab'],private:'2606:4700:abcd:1234:5678:9abc:c0a8:1',public:'2606:4700:abcd:1234:5678:9abc:808:808'},
  ];
  for(const item of cases){
    let destination=item.private;
    const resolver=async(hostname:string)=>hostname==='ipv4only.arpa'?item.pair.map(address=>({address,family:6})): [{address:destination,family:6}];
    await assert.rejects(resolvePublicAddresses(`private-nat64-${item.length}.test`,resolver),/private or reserved address/,`/${item.length}`);
    destination=item.public;
    await assert.doesNotReject(resolvePublicAddresses(`public-nat64-${item.length}.test`,resolver),`/${item.length}`);
  }
});

test('connection-time DNS rebinding to loopback is blocked before the target receives a request',{timeout:10000},async()=>{
  let visits=0,resolutions=0;
  const target=createServer((_req,res)=>{visits++;res.end('Private fixture');});
  await new Promise<void>(resolve=>target.listen(0,'127.0.0.1',resolve));
  const targetURL=`http://rebind.test:${(target.address() as {port:number}).port}`;
  const resolver=async()=>[{address:++resolutions===1?'8.8.8.8':'127.0.0.1',family:4}];
  const before=await resolvePublicAddresses('rebind.test',resolver);assert.equal(before[0]!.address,'8.8.8.8');
  const proxy=new NetworkGuardProxy({resolver});
  try{
    const proxyURL=await proxy.start(),response=await requestThroughProxy(proxyURL,targetURL);
    assert.equal(response.status,403,JSON.stringify({response,resolutions,visits}));assert.equal(resolutions,2);assert.equal(visits,0);
  }finally{await proxy.close();await new Promise<void>(resolve=>target.close(()=>resolve()));}
});

test('connection-time DNS rebinding is blocked inside HTTPS and secure WebSocket tunnels',{timeout:10000},async()=>{
  let connections=0,resolutions=0;
  const target=createServer();target.on('connection',()=>{connections++;});
  await new Promise<void>(resolve=>target.listen(0,'127.0.0.1',resolve));
  const port=(target.address() as {port:number}).port,resolver=async()=>[{address:++resolutions===1?'8.8.8.8':'127.0.0.1',family:4}];
  assert.equal((await resolvePublicAddresses('rebind.test',resolver))[0]!.address,'8.8.8.8');
  const proxy=new NetworkGuardProxy({resolver,permits:url=>url===`https://rebind.test:${port}/`});
  try{
    const proxyURL=new URL(await proxy.start());
    await new Promise<void>((resolve,reject)=>{
      const request=httpRequest({hostname:proxyURL.hostname,port:Number(proxyURL.port),method:'CONNECT',path:`rebind.test:${port}`,agent:false});
      const timer=setTimeout(()=>reject(new Error('The rebinding tunnel was not closed')),3000);
      request.once('connect',(response,socket)=>{
        socket.on('error',()=>{});socket.once('close',()=>{clearTimeout(timer);resolve();});socket.write(Buffer.from([0x16,0x03,0x01,0,0]));
      });
      request.once('error',reject);request.end();
    });
    assert.equal(resolutions,2);assert.equal(connections,0);
  }finally{await proxy.close();await new Promise<void>(resolve=>target.close(()=>resolve()));}
});

test('the proxy rejects a cleartext non-HTTP CONNECT protocol before dialing the target',{timeout:10000},async()=>{
  let connections=0;
  const target=createServer();target.on('connection',()=>{connections++;});
  await new Promise<void>(resolve=>target.listen(0,'127.0.0.1',resolve));
  const port=(target.address() as {port:number}).port,proxy=new NetworkGuardProxy({allowPrivate:true,resolver:async()=>[{address:'127.0.0.1',family:4}],permits:url=>url===`https://non-http.test:${port}/`});
  try{
    const address=new URL(await proxy.start());
    await new Promise<void>((resolve,reject)=>{
      const request=httpRequest({hostname:address.hostname,port:Number(address.port),method:'CONNECT',path:`non-http.test:${port}`,agent:false});
      const timer=setTimeout(()=>reject(new Error('The unsupported tunnel stayed open')),3000);
      request.once('connect',(response,socket)=>{
        socket.on('error',()=>{});
        if(response.statusCode!==200){clearTimeout(timer);reject(new Error(`CONNECT returned ${response.statusCode}`));return;}
        socket.once('close',()=>{clearTimeout(timer);resolve();});socket.write('SSH-2.0-test-client\r\n');
      });
      request.once('error',error=>{clearTimeout(timer);reject(error);});request.end();
    });
    assert.equal(connections,0);
  }finally{await proxy.close();await new Promise<void>(resolve=>target.close(()=>resolve()));}
});

test('Chrome does not send WebRTC STUN packets outside the configured proxy',{timeout:15000},async()=>{
  const stun=createSocket('udp4');let packets=0;stun.on('message',()=>packets++);
  await new Promise<void>(resolve=>stun.bind(0,'127.0.0.1',resolve));
  const stunPort=(stun.address() as {port:number}).port,site=createServer((_req,res)=>res.end('<h1>Guarded browser</h1>'));
  await new Promise<void>(resolve=>site.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${(site.address() as {port:number}).port}`,profile=await mkdtemp(join(tmpdir(),'fcu-webrtc-profile-'));
  await mkdir(join(profile,'Default'));await writeFile(join(profile,'Default','Preferences'),JSON.stringify({profile:{default_content_setting_values:{notifications:2}},webrtc:{ip_handling_policy:'default'}}));
  await chmod(profile,0o755);await chmod(join(profile,'Default'),0o755);
  const browser=new Browser({profileDir:profile,allowedOrigins:[url]});
  try{
    await browser.launch();
    await browser.navigate(url);
    await browser.page.evaluate(async port=>{
      const connection=new RTCPeerConnection({iceServers:[{urls:`stun:127.0.0.1:${port}`} ]});connection.createDataChannel('probe');
      try{
        await connection.setLocalDescription(await connection.createOffer());
        await new Promise<void>(resolve=>{
          if(connection.iceGatheringState==='complete'){resolve();return;}
          const timer=setTimeout(resolve,4000);
          connection.addEventListener('icegatheringstatechange',()=>{if(connection.iceGatheringState==='complete'){clearTimeout(timer);resolve();}});
        });
      }finally{connection.close();}
    },stunPort);
    await browser.page.waitForTimeout(100);assert.equal(packets,0);assert.equal(await browser.page.locator('h1').innerText(),'Guarded browser');
    const preferences=JSON.parse(await readFile(join(profile,'Default','Preferences'),'utf8')) as {profile:{default_content_setting_values:{notifications:number}};webrtc:{ip_handling_policy:string}};
    assert.equal(preferences.webrtc.ip_handling_policy,'disable_non_proxied_udp');assert.equal(preferences.profile.default_content_setting_values.notifications,2);
    if(process.platform!=='win32'){assert.equal((await stat(profile)).mode&0o777,0o700);assert.equal((await stat(join(profile,'Default'))).mode&0o777,0o700);assert.equal((await stat(join(profile,'Default','Preferences'))).mode&0o777,0o600);}
  }finally{await browser.close();await new Promise<void>(resolve=>site.close(()=>resolve()));await new Promise<void>(resolve=>stun.close(()=>resolve()));await rm(profile,{recursive:true,force:true});}
});

test('the proxy connects to its single vetted address without resolving the hostname again',{timeout:10000},async()=>{
  let visits=0,resolutions=0;
  const target=createServer((_req,res)=>{visits++;res.end('Pinned destination');});
  await new Promise<void>(resolve=>target.listen(0,'127.0.0.1',resolve));
  const targetURL=`http://pinned.test:${(target.address() as {port:number}).port}`;
  const resolver=async()=>[{address:++resolutions===1?'127.0.0.1':'127.0.0.2',family:4}];
  const proxy=new NetworkGuardProxy({allowPrivate:true,resolver});
  try{
    const proxyURL=await proxy.start(),response=await requestThroughProxy(proxyURL,targetURL);
    assert.deepEqual(response,{status:200,body:'Pinned destination'});assert.equal(resolutions,1);assert.equal(visits,1);
  }finally{await proxy.close();await new Promise<void>(resolve=>target.close(()=>resolve()));}
});

test('concurrent permissions remain distinct and stopping rejects queued approvals',async()=>{
  const control=new Control(),seen:unknown[]=[];control.on('approval',p=>seen.push(p.action));
  const firstVisible=once(control,'approval');
  const first=control.confirm('First',{origin:'https://one.test'}),second=control.confirm('Second',{origin:'https://two.test'});
  await firstVisible;assert.deepEqual(seen,[{origin:'https://one.test'}]);
  const secondVisible=once(control,'approval');control.approve();await first;await secondVisible;
  assert.deepEqual(seen,[{origin:'https://one.test'},{origin:'https://two.test'}]);
  const denied=assert.rejects(second,/rejected/);control.reject();await denied;
  const third=control.confirm('Third',{}),fourth=control.confirm('Fourth',{});
  const settled=Promise.allSettled([third,fourth]);await Promise.resolve();control.stop();
  assert((await settled).every(result=>result.status==='rejected'));
});

test('replaced sensitive target cannot inherit an earlier human approval',async()=>{
  const browser=await new Browser().launch();
  try{
    await browser.page.setContent('<button id="delete" onclick="document.body.dataset.deleted=\'yes\'">Delete record</button>');
    const control=new Control(),executor=new Executor(browser,new Observer(),new VariableResolver(),control);
    const visible=once(control,'approval'),execution=executor.run({type:'click',target:{id:'delete'}});
    await visible;
    await browser.page.locator('#delete').evaluate(el=>{el.outerHTML='<button id="delete" onclick="document.body.dataset.deleted=\'yes\'">Delete record</button>';});
    control.approve();const result=await execution;
    assert.equal(result.success,false);assert.match(result.error??'',/target changed/);assert.equal(result.uncertain,false);
    assert.equal(await browser.page.locator('body').getAttribute('data-deleted'),null);
  }finally{await browser.close();}
});

test('unapproved cross-origin fetches are blocked before receiving a request',async()=>{
  let leaked=0;
  const receiver=createServer((_req,res)=>{leaked++;res.end('Forbidden');});
  await new Promise<void>(resolve=>receiver.listen(0,'127.0.0.1',resolve));
  const receiverURL=`http://127.0.0.1:${(receiver.address() as {port:number}).port}`;
  const source=createServer((_req,res)=>res.end(`<h1>Safe sandbox</h1><script>fetch('${receiverURL}/collect').catch(()=>{});</script>`));
  await new Promise<void>(resolve=>source.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${(source.address() as {port:number}).port}`,store=new TraceStore(':memory:');
  const agent=new Agent({store,browser:{allowedOrigins:[url]}});agent.control.on('approval',()=>agent.control.approve());
  try{
    const plan=PlanSchema.parse({goal:'Read',steps:['Read'],actions:[{type:'extract',key:'text',format:'text'}],completion:[{type:'extraction_created'}],continue:false});
    assert.equal((await agent.run('Read this sandbox',url,plan)).status,'completed');assert.equal(leaked,0);
  }finally{await agent.close();store.close();await Promise.all([new Promise<void>(resolve=>source.close(()=>resolve())),new Promise<void>(resolve=>receiver.close(()=>resolve()))]);}
});

test('an allowlisted hostname resolving to loopback is blocked before its server receives a request',{timeout:15000},async()=>{
  let visits=0;
  const target=createServer((_req,res)=>{visits++;res.end('Private fixture');});
  await new Promise<void>(resolve=>target.listen(0,'127.0.0.1',resolve));const targetURL=`http://localhost:${(target.address() as {port:number}).port}`;
  const source=createServer((_req,res)=>res.end(`<script>fetch('${targetURL}/internal').catch(()=>{});</script>`));
  await new Promise<void>(resolve=>source.listen(0,'127.0.0.1',resolve));const sourceURL=`http://127.0.0.1:${(source.address() as {port:number}).port}`;
  const browser=await new Browser({allowedOrigins:[sourceURL,targetURL]}).launch();
  try{
    await browser.navigate(sourceURL);await browser.page.waitForTimeout(150);assert.equal(visits,0);
  }finally{await browser.close();await Promise.all([new Promise<void>(resolve=>source.close(()=>resolve())),new Promise<void>(resolve=>target.close(()=>resolve()))]);}
});

test('unapproved WebSocket origins are blocked before receiving an upgrade',{timeout:15000},async()=>{
  let upgrades=0;
  const target=createServer();target.on('upgrade',(_request,socket)=>{upgrades++;socket.destroy();});
  const source=createServer((_req,res)=>res.end('<h1>Approved origin</h1>'));
  await new Promise<void>(resolve=>target.listen(0,'127.0.0.1',resolve));const targetURL=`ws://127.0.0.1:${(target.address() as {port:number}).port}`;
  await new Promise<void>(resolve=>source.listen(0,'127.0.0.1',resolve));const sourceURL=`http://127.0.0.1:${(source.address() as {port:number}).port}`;
  const browser=await new Browser({allowedOrigins:[sourceURL]}).launch();
  try{
    await browser.navigate(sourceURL);
    await browser.page.evaluate(url=>{const socket=new WebSocket(url);socket.onerror=()=>{};},`${targetURL}/blocked`);
    await browser.page.waitForTimeout(100);assert.equal(upgrades,0);
  }finally{
    await browser.close();await Promise.all([new Promise<void>(resolve=>source.close(()=>resolve())),new Promise<void>(resolve=>target.close(()=>resolve()))]);
  }
});

test('approved WebSocket traffic works through the local network guard proxy',{timeout:15000},async()=>{
  let upgrades=0;
  const target=createServer();
  target.on('upgrade',(request,socket)=>{
    upgrades++;
    const key=request.headers['sec-websocket-key']??'',accept=createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    socket.write(Buffer.from([0x81,0x02,0x6f,0x6b]));
    socket.once('data',()=>socket.end(Buffer.from([0x88,0x00])));
  });
  await new Promise<void>(resolve=>target.listen(0,'127.0.0.1',resolve));
  const targetURL=`ws://127.0.0.1:${(target.address() as {port:number}).port}`,browser=await new Browser({allowedOrigins:[targetURL.replace(/^ws:/,'http:')]}).launch();
  try{
    const message=await browser.page.evaluate(url=>new Promise<string>((resolve,reject)=>{
      const socket=new WebSocket(url),timer=setTimeout(()=>reject(new Error('WebSocket fixture timed out')),5000);
      let received='';socket.onmessage=event=>{received=String(event.data);socket.close();};
      socket.onclose=()=>{clearTimeout(timer);resolve(received);};
      socket.onerror=()=>{clearTimeout(timer);reject(new Error('Approved WebSocket connection failed'));};
    }),targetURL);
    assert.equal(message,'ok');assert.equal(upgrades,1);
  }finally{await browser.close();await new Promise<void>(resolve=>target.close(()=>resolve()));}
});

test('Chrome completes a secure WebSocket handshake through the local proxy',{timeout:25000},async t=>{
  try{execFileSync('openssl',['version'],{stdio:'ignore'});}catch{t.skip('OpenSSL is unavailable for a temporary local certificate');return;}
  const dir=await mkdtemp(join(tmpdir(),'fcu-wss-')),keyPath=join(dir,'key.pem'),certPath=join(dir,'cert.pem');
  let browser:Browser|undefined,target:ReturnType<typeof createHTTPSServer>|undefined,deniedTarget:ReturnType<typeof createHTTPSServer>|undefined,upgrades=0,deniedConnections=0;
  try{
    execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyPath,'-out',certPath,'-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],{stdio:'ignore'});
    const credentials={key:await readFile(keyPath),cert:await readFile(certPath)};
    const server=createHTTPSServer(credentials,(_request,response)=>response.end('<h1>Local secure WebSocket fixture</h1>'));target=server;
    server.on('upgrade',(request,socket)=>{
      upgrades++;
      const key=request.headers['sec-websocket-key']??'',accept=createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
      socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
      socket.write(Buffer.from([0x81,0x02,0x6f,0x6b]));
      socket.once('data',()=>socket.end(Buffer.from([0x88,0x00])));
    });
    const denied=createHTTPSServer(credentials);deniedTarget=denied;denied.on('connection',()=>deniedConnections++);
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    await new Promise<void>(resolve=>denied.listen(0,'127.0.0.1',resolve));
    const port=(server.address() as {port:number}).port;
    const deniedPort=(denied.address() as {port:number}).port;
    const origin=`https://127.0.0.1:${port}`;
    browser=await new Browser({allowedOrigins:[origin]}).launch();
    const cdp=await browser.context.newCDPSession(browser.page);
    await cdp.send('Security.enable');await cdp.send('Security.setIgnoreCertificateErrors',{ignore:true});
    await browser.navigate(origin);
    const message=await browser.page.evaluate(url=>new Promise<string>((resolve,reject)=>{
      const socket=new WebSocket(url),timer=setTimeout(()=>reject(new Error('Secure WebSocket fixture timed out')),5000);
      socket.onmessage=event=>{clearTimeout(timer);resolve(String(event.data));socket.close();};
      socket.onerror=()=>{clearTimeout(timer);reject(new Error('Secure WebSocket connection failed'));};
    }),`wss://127.0.0.1:${port}/events`);
    const deniedResult=await browser.page.evaluate(url=>new Promise<string>((resolve,reject)=>{
      const socket=new WebSocket(url),timer=setTimeout(()=>reject(new Error('Blocked secure WebSocket fixture timed out')),5000);
      socket.onerror=()=>{clearTimeout(timer);resolve('blocked');};socket.onopen=()=>{clearTimeout(timer);socket.close();resolve('open');};
    }),`wss://127.0.0.1:${deniedPort}/events`);
    assert.equal(message,'ok');assert.equal(upgrades,1);assert.equal(deniedResult,'blocked');assert.equal(deniedConnections,0);
  }finally{
    await browser?.close();
    if(target?.listening)await new Promise<void>(resolve=>target!.close(()=>resolve()));
    if(deniedTarget?.listening)await new Promise<void>(resolve=>deniedTarget!.close(()=>resolve()));
    await rm(dir,{recursive:true,force:true});
  }
});

test('a bare Browser denies navigation and page requests without an explicit origin policy',async()=>{
  let visits=0;
  const server=createServer((_req,res)=>{visits++;res.end('Unexpected request');});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${(server.address() as {port:number}).port}`,browser=await new Browser().launch();
  try{
    await assert.rejects(browser.navigate(url),/outside the local origin policy/);
    const blocked=browser.page.waitForEvent('requestfailed');
    await browser.page.setContent(`<img src="${url}/pixel">`);
    assert.equal((await blocked).url(),`${url}/pixel`);assert.equal(visits,0);
  }finally{await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('origin matching canonicalizes IPv6 literals but keeps port and origin boundaries exact',()=>{
  const browser=new Browser({allowedOrigins:['http://[0:0:0:0:0:0:0:1]:8123']});
  assert.equal(browser.permits('http://[::1]:8123/path'),true);
  assert.equal(browser.permits('http://[::1]:8124/path'),false);
  assert.equal(new Browser({allowedOrigins:['http://[::1]:8123/private']}).permits('http://[::1]:8123/public'),false);
});

test('a redirected navigation is stopped before an unapproved origin receives it',async()=>{
  let sourceVisits=0,targetVisits=0,targetPrompted=false;
  const target=createServer((_req,res)=>{targetVisits++;res.end('<h1>Unapproved target</h1>');});
  await new Promise<void>(resolve=>target.listen(0,'127.0.0.1',resolve));
  const targetURL=`http://127.0.0.1:${(target.address() as {port:number}).port}`;
  const source=createServer((_req,res)=>{sourceVisits++;res.writeHead(302,{Location:targetURL+'/private'});res.end();});
  await new Promise<void>(resolve=>source.listen(0,'127.0.0.1',resolve));
  const sourceURL=`http://127.0.0.1:${(source.address() as {port:number}).port}`,store=new TraceStore(':memory:');
  const agent=new Agent({store,browser:{allowedOrigins:[sourceURL]}});
  agent.control.on('approval',pending=>{
    if((pending.action as {origin?:string}).origin===sourceURL)agent.control.approve();
    else{targetPrompted=true;agent.control.reject();}
  });
  const plan=PlanSchema.parse({goal:'Read the page',steps:['Read'],actions:[{type:'extract',format:'text',key:'text'}],completion:[{type:'extraction_created'}],continue:false});
  try{
    const trace=await agent.run('Read the page',sourceURL,plan);
    assert.equal(trace.status,'failed');assert.equal(sourceVisits,1);assert.equal(targetPrompted,true);assert.equal(targetVisits,0);
  }finally{
    await agent.close();store.close();
    await Promise.all([new Promise<void>(resolve=>source.close(()=>resolve())),new Promise<void>(resolve=>target.close(()=>resolve()))]);
  }
});

test('a redirected navigation reaches a second origin after explicit approval',async()=>{
  let targetVisits=0,targetApprovals=0;
  const target=createServer((_req,res)=>{targetVisits++;res.end('<h1>Approved target</h1>');});
  await new Promise<void>(resolve=>target.listen(0,'127.0.0.1',resolve));
  const targetURL=`http://127.0.0.1:${(target.address() as {port:number}).port}`;
  const source=createServer((_req,res)=>{res.writeHead(302,{Location:targetURL+'/private'});res.end();});
  await new Promise<void>(resolve=>source.listen(0,'127.0.0.1',resolve));
  const sourceURL=`http://127.0.0.1:${(source.address() as {port:number}).port}`,store=new TraceStore(':memory:');
  const agent=new Agent({store,browser:{allowedOrigins:[sourceURL]}});
  agent.control.on('approval',pending=>{
    if((pending.action as {origin?:string}).origin===targetURL)targetApprovals++;
    agent.control.approve();
  });
  const plan=PlanSchema.parse({goal:'Read the approved page',steps:['Read'],actions:[{type:'extract',format:'text',key:'text'}],completion:[{type:'extraction_created'}],continue:false});
  try{
    const trace=await agent.run('Read the approved page',sourceURL,plan);
    assert.equal(trace.status,'completed',trace.error??'Task failed');assert.equal(targetApprovals,1);assert.equal(targetVisits,1);
  }finally{
    await agent.close();store.close();
    await Promise.all([new Promise<void>(resolve=>source.close(()=>resolve())),new Promise<void>(resolve=>target.close(()=>resolve()))]);
  }
});

test('a fast popup redirect is blocked before an unapproved target receives it',async()=>{
  let targetVisits=0,targetApprovals=0,approved=false;
  const target=createServer((_req,res)=>{targetVisits++;res.end('<h1>Popup target</h1>');});
  await new Promise<void>(resolve=>target.listen(0,'127.0.0.1',resolve));
  const targetURL=`http://127.0.0.1:${(target.address() as {port:number}).port}`;
  const source=createServer((req,res)=>{
    if(req.url==='/jump'){res.writeHead(302,{Location:targetURL+'/private'});res.end();return;}
    res.end('<a href="/jump" target="_blank">Open popup</a>');
  });
  await new Promise<void>(resolve=>source.listen(0,'127.0.0.1',resolve));
  const sourceURL=`http://127.0.0.1:${(source.address() as {port:number}).port}`;
  const browser=new Browser({allowedOrigins:[sourceURL],beforeNavigate:async value=>{
    if(new URL(value).origin!==targetURL)return;
    targetApprovals++;
    if(!approved)throw new Error('Origin denied');
    browser.options.allowedOrigins?.push(targetURL);
  }});
  try{
    await browser.launch();await browser.navigate(sourceURL);
    const deniedEvent=browser.context.waitForEvent('page');
    await browser.page.getByRole('link',{name:'Open popup'}).click();
    const deniedPopup=await deniedEvent;await deniedPopup.waitForTimeout(100);
    assert.equal(targetApprovals,1);assert.equal(targetVisits,0);

    approved=true;
    const approvedEvent=browser.context.waitForEvent('page');
    await browser.context.pages()[0]!.getByRole('link',{name:'Open popup'}).click();
    const approvedPopup=await approvedEvent;
    await approvedPopup.waitForURL(`${targetURL}/private`);
    assert.equal(targetApprovals,2);assert.equal(targetVisits,1);
  }finally{
    await browser.close();
    await Promise.all([new Promise<void>(resolve=>source.close(()=>resolve())),new Promise<void>(resolve=>target.close(()=>resolve()))]);
  }
});

test('a prior download cannot satisfy a new task and a repair cannot weaken trusted criteria',async()=>{
  const store=new TraceStore(':memory:');
  const agent=new Agent({store,mode:'ultra',completionCriteria:[{type:'download_created',value:'old.txt'}],provider:{name:'fixture',plan:async()=>{throw new Error('unexpected');},repair:async()=>({actions:[],replace:0,completion:[{type:'extraction_created'}]})}});
  try{
    await agent.browser.launch();await agent.browser.page.setContent('<h1>Read only</h1>');agent.browser.downloads.push({filename:'old.txt',path:'/not-used'});
    const plan=PlanSchema.parse({goal:'Read',steps:['Read'],actions:[{type:'extract',key:'text',format:'text'}],completion:[{type:'extraction_created'}],continue:false});
    const trace=await agent.run('Read this page',undefined,plan);
    assert.equal(trace.status,'failed');assert.equal(agent.browser.downloads.length,0);assert.match(trace.error??'',/completion could not be verified/);
  }finally{await agent.close();store.close();}
});

test('closing a page cancels its pending frame grant and cannot make a later request',{timeout:15000},async()=>{
  let visits=0;
  const child=createServer((_req,res)=>{visits++;res.end('<h1>Child</h1>');});
  await new Promise<void>(resolve=>child.listen(0,'127.0.0.1',resolve));const childURL=`http://127.0.0.1:${(child.address() as {port:number}).port}`;
  const parent=createServer((_req,res)=>res.end(`<h1>Parent</h1><iframe src="${childURL}"></iframe>`));
  await new Promise<void>(resolve=>parent.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${(parent.address() as {port:number}).port}`;
  const store=new TraceStore(':memory:'),agent=new Agent({store,browser:{allowedOrigins:[url]}});let childPrompt=false;let signalChild!:()=>void;const pendingChild=new Promise<void>(resolve=>{signalChild=resolve;});
  agent.control.on('approval',pending=>{if((pending.action as {origin:string}).origin===url)agent.control.approve();else{childPrompt=true;signalChild();}});
  try{
    // Keep the task alive until the child permission arrives. With no provider
    // or plan, a fast main-frame observation could fail before that request.
    const plan=PlanSchema.parse({goal:'Read the parent page',steps:['Wait for the child frame'],actions:[{type:'wait',condition:{type:'text_exists',value:'Child'},timeoutMs:30000}],completion:[{type:'text_exists',value:'Parent'}]});
    const running=agent.run('Read the parent page',url,plan);
    let timer:NodeJS.Timeout|undefined;
    try{await Promise.race([pendingChild,running.then(()=>{throw new Error('Task ended before requesting the child permission');}),new Promise<void>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Timed out waiting for the child-origin permission')),5000);})]);}
    finally{if(timer)clearTimeout(timer);}
    await agent.browser.page.close();const trace=await running;
    assert(childPrompt);assert.equal(trace.status,'stopped');assert.equal(agent.control.pending,undefined);assert.equal(visits,0);
    assert.throws(()=>agent.control.approve(),/No action/);
  }finally{await agent.close();store.close();await Promise.all([new Promise<void>(resolve=>parent.close(()=>resolve())),new Promise<void>(resolve=>child.close(()=>resolve()))]);}
});

test('failed tasks reject website requests arriving after completion',async()=>{
  const store=new TraceStore(':memory:'),agent=new Agent({store,browser:{allowedOrigins:['http://127.0.0.1:1']}});
  try{
    await agent.browser.launch();await agent.browser.page.setContent('<h1>No local strategy</h1>');
    const trace=await agent.run('Do an unsupported task');assert.equal(trace.status,'failed');assert.equal(agent.control.stopped,true);
    await assert.rejects(agent.browser.navigate('https://example.test'),/stopped/);
    assert.equal(agent.control.pending,undefined);
  }finally{await agent.close();store.close();}
});

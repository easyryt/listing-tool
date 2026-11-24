/* eslint-disable @typescript-eslint/no-require-imports -- Node verification harness. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),source=name=>fs.readFileSync(path.join(root,'browser-extension',name),'utf8');
for(const name of ['claims-core.js','claims-page.js','claims-runner.js'])vm.runInThisContext(source(name));
const C=globalThis.BrowserTestClaims,origin='https://listing-tool-three.vercel.app';
const png=Buffer.from([137,80,78,71,13,10,26,10,...Array(24).fill(0)]),mp4=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypisom'),Buffer.alloc(32)]);
function draft(){return{id:crypto.randomUUID(),revision:1,claimsUrl:'https://supplier.meesho.com/panel/v3/new/fulfillment/jifdb/claims',issue:'wrong_return',subOrderNumber:'DEMO-SUBORDER-1',awbNumber:'DEMO-AWB-1',packetId:'NA',condition:'Intact',description:'Wrong product received. Please review the attached evidence.',callbackNumber:'9999999999',evidence:['video','product','waybill'].map(role=>{const bytes=role==='video'?mp4:png;return{id:crypto.randomUUID(),role,name:role+(role==='video'?'.mp4':'.png'),type:role==='video'?'video/mp4':'image/png',bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};})};}

test('claims authorize only the exact supplier, supported issues and complete evidence',()=>{
  const valid=draft();assert.equal(C.account(valid.claimsUrl),'jifdb');assert.equal(C.validate(valid).subOrderNumber,valid.subOrderNumber);
  for(const url of [valid.claimsUrl+'?token=x',valid.claimsUrl+'#x',valid.claimsUrl.replace('supplier.meesho.com','evil.test'),valid.claimsUrl.replace('supplier.meesho.com','user:pass@supplier.meesho.com')])assert.equal(C.account(url),null);
  for(const value of [{...valid,revision:0},{...valid,issue:'arbitrary'},{...valid,evidence:valid.evidence.slice(1)},{...valid,evidence:[...valid.evidence,valid.evidence[0]]},{...valid,callbackNumber:'invalid'},{...valid,description:'x'.repeat(1001)},{...valid,evidence:valid.evidence.map(f=>({...f,name:'../secret.mp4'}))}])assert.throws(()=>C.validate(value));
  assert.equal(C.allowedPage('https://supplier.meesho.com/panel/v3/new/experience/jifdb/support/1/1/create','jifdb'),true);
  for(const url of ['https://supplier.meesho.com/panel/v3/new/experience/other/support/1/1/create','https://supplier.meesho.com/panel/v3/new/experience/jifdb/support/2/1/create','https://supplier.meesho.com/panel/v3/new/experience/jifdb/support/1/1/create?x=1'])assert.equal(C.allowedPage(url,'jifdb'),false);
});

function fixture(claim=draft(),options={}){
  let url=claim.claimsUrl,storage={},clock=0,created=0,submitClicks=0,expanded=false,condition='',formReads=0;const clicks=[],events=[];
  class Input {constructor(name,type='text'){this.tagName=type==='textarea'?'TEXTAREA':'INPUT';this.id=name;this.type=type;this._value='';this.files=[];this.isConnected=true;this.disabled=false;this.readOnly=false;}get value(){return this._value;}set value(v){this._value=v;}hasAttribute(){return false;}dispatchEvent(event){events.push({name:this.id,type:event.type});return true;}}
  class Textarea extends Input {get value(){return this._value;}set value(v){this._value=v;}}
  class Transfer {constructor(){this.files=[];this.items={add:file=>this.files.push(file)};}}
  const fields=Object.fromEntries(['Sub Order Number','AWB Number','Packet ID','Description','Callback Number'].map(name=>[name,name==='Description'?new Textarea(name,'textarea'):new Input(name)]));fields['Callback Number'].value='9999999999';
  const inputs=Object.fromEntries(Object.entries({video:'product_openingvideo_link_9',product:'product_image_link_7',waybill:'product_reverse_way_bill_link_8',barcode:'barcode_image_link_6'}).map(([role,id])=>[role,new Input(id,'file')]));
  const node=(text,click)=>({textContent:text,isConnected:true,disabled:false,getClientRects:()=>[{}],click});
  const issueButton=node(C.issues[claim.issue],()=>{}),conditionButton=node('',()=>{expanded=true;});conditionButton.getAttribute=name=>name==='aria-expanded'?String(expanded):null;
  const labels=Object.entries(fields).map(([name,input])=>({textContent:name+' *',htmlFor:input.id}));
  for(const [name,button]of [['Issue',issueButton],['State of the packet',conditionButton]])labels.push({textContent:name+' *',htmlFor:name,parentElement:{querySelectorAll:()=>[button]}});
  const context=vm.createContext({URL,location:{href:url},window:{},File,Blob,DataTransfer:Transfer,Event,atob,crypto:crypto.webcrypto,HTMLInputElement:Input,HTMLTextAreaElement:Textarea,setTimeout});context.window.top=context.window;
  const go=(next,name)=>{url=next;context.location.href=url;context.__listingClaimForm=undefined;clicks.push(name);};
  context.document={getElementById:id=>Object.values(fields).find(el=>el.id===id),querySelectorAll:selector=>{
    if(selector==='label')return url.endsWith('/create')&&formReads++<(options.delayFormReads||0)?[]:labels;
    if(selector==='input[type="file"]')return Object.values(inputs);
    if(selector==='[role="option"]')return expanded?['Intact','Tampered'].map(value=>node(value,()=>{condition=value;conditionButton.textContent=value;expanded=false;})):[];
    if(selector==='h1,h2,h3')return[node(C.issues[claim.issue])];
    if(selector==='button'){
      if(url===claim.claimsUrl)return[node('Raise Claim',()=>go('https://supplier.meesho.com/panel/v3/new/experience/jifdb/support/1','Raise Claim'))];
      if(url.endsWith('/support/1'))return[node(C.issues[claim.issue],()=>go(url+'/1','Issue'))];
      if(url.endsWith('/support/1/1'))return[node('Raise a Ticket',()=>go(url+'/create','Raise a Ticket'))];
      return[node('Submit',()=>{submitClicks++;}),issueButton,conditionButton];
    }
    return[];
  }};
  const storedValue=value=>Array.isArray(value)?value.map(storedValue):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,storedValue(value[key])])):value;
  const chromeApi={storage:{local:{get:async()=>storedValue(storage),set:async data=>{storage={...storage,...structuredClone(data)};}}},tabs:{create:async input=>{created++;url=input.url;context.location.href=url;return{id:8,url,status:'complete'};},get:async()=>({id:8,url,status:'complete'}),update:async()=>{}},scripting:{executeScript:async spec=>{assert.equal(spec.world,'ISOLATED');assert.equal(spec.target.tabId,8);context.args=structuredClone(spec.args);return[{result:await vm.runInContext('('+spec.func.toString()+')(...args)',context)}];}}};
  Object.defineProperty(chromeApi,'downloads',{get(){throw new Error('Claims must not download evidence');}});
  const runner=new globalThis.BrowserTestClaimsRunner({chromeApi,now:()=>clock,delay:async ms=>{clock+=ms;}}),operationId=crypto.randomUUID();
  const prepare=()=>runner.prepare({operationId,claim},origin,7),step=(type,data={})=>runner.step({type,operationId,...data},origin,7);
  return{claim,prepare,step,runner,operationId,fields,inputs,events,clicks,state:()=>storage,created:()=>created,submitClicks:()=>submitClicks,navigate:next=>{url=next;context.location.href=next;},reload:()=>{context.__listingClaimForm=undefined;},setCondition:value=>{condition=value;conditionButton.textContent=value;},condition:()=>condition};
}
async function attach(f,role,bytes=role==='video'?mp4:png){await f.step('claims-file-begin',{role});for(let offset=0,index=0;offset<bytes.length;offset+=16,index++)await f.step('claims-file-chunk',{role,index,base64:bytes.subarray(offset,offset+16).toString('base64')});await f.step('claims-file-finish',{role});}

test('claims wait for asynchronously loaded form fields before autofilling',async()=>{
  const f=fixture(draft(),{delayFormReads:3});const result=await f.prepare();assert.equal(result.phase,'prepared');
  assert.equal(f.fields['Sub Order Number'].value,f.claim.subOrderNumber);assert.equal(f.submitClicks(),0);
});

test('full claims flow fills the exact order, streams matching originals, and stops before Submit',async()=>{
  const f=fixture();const prepared=await f.prepare();assert.equal(prepared.phase,'prepared');assert.deepEqual(f.clicks,['Raise Claim','Issue','Raise a Ticket']);assert.equal(f.condition(),'Intact');
  assert.equal(f.fields['Sub Order Number'].value,f.claim.subOrderNumber);assert.equal(f.fields['Description'].value,f.claim.description);
  for(const role of ['video','product','waybill'])await attach(f,role);
  const result=(await f.step('claims-finish')).result;assert.equal(result.phase,'review');assert.equal(result.submitted,false);assert.equal(result.revision,f.claim.revision);assert.equal(f.submitClicks(),0);
  assert.deepEqual(Buffer.from(await f.inputs.video.files[0].arrayBuffer()),mp4);assert.deepEqual(Buffer.from(await f.inputs.waybill.files[0].arrayBuffer()),png);
  assert.equal(f.events.filter(e=>e.name===f.inputs.video.id&&e.type==='change').length,1);
  assert.equal(JSON.stringify(f.state()).includes(mp4.toString('base64')),false,'Evidence bytes are never written to persistent extension storage');
  await f.prepare();assert.equal(f.created(),1,'The same operation never opens a second claim form');
});

test('manual order edits, wrong-account navigation and reloaded forms stop evidence delivery',async()=>{
  for(const change of [f=>{f.fields['Sub Order Number'].value='OTHER-ORDER';},f=>f.navigate('https://supplier.meesho.com/panel/v3/new/experience/other/support/1/1/create'),f=>f.reload(),f=>f.setCondition('Tampered')]){
    const f=fixture();await f.prepare();change(f);await assert.rejects(f.step('claims-file-begin',{role:'video'}));assert.equal(f.inputs.video.files.length,0);assert.equal(f.submitClicks(),0);
  }
});

test('corrupt, incomplete, replayed and out-of-order evidence cannot be attached',async()=>{
  let f=fixture();await f.prepare();await f.step('claims-file-begin',{role:'video'});await assert.rejects(f.step('claims-file-chunk',{role:'video',index:1,base64:mp4.toString('base64')}));assert.equal(f.inputs.video.files.length,0);
  f=fixture();await f.prepare();await f.step('claims-file-begin',{role:'video'});await assert.rejects(f.step('claims-file-finish',{role:'video'}));assert.equal(f.inputs.video.files.length,0);
  f=fixture();await f.prepare();const corrupt=Buffer.from(mp4);corrupt[corrupt.length-1]=1;await assert.rejects(attach(f,'video',corrupt),/does not match/);assert.equal(f.inputs.video.files.length,0);
  f=fixture();await f.prepare();await attach(f,'video');await assert.rejects(f.step('claims-file-begin',{role:'video'}),/already supplied/);assert.equal(f.events.filter(e=>e.name===f.inputs.video.id&&e.type==='change').length,1);
});

test('one listing tab cannot access another tab’s operation or request automatic submission',async()=>{
  const f=fixture();await f.prepare();await assert.rejects(f.runner.step({type:'claims-focus',operationId:f.operationId},origin,99),/different listing tab/);
  await assert.rejects(f.runner.step({type:'claims-focus',operationId:f.operationId},'https://evil.test',7),/different listing tab/);
  await assert.rejects(f.step('claims-submit'),/Unsupported/);assert.equal(f.submitClicks(),0);
});

test('claims bridge rejects foreign sites, iframes, oversized messages and arbitrary commands',()=>{
  function bridge(site=origin,frame=false){const sent=[],document=new EventTarget(),window={};window.top=frame?{}:window;vm.runInNewContext(source('claims-bridge.js'),{location:{origin:site},window,document,CustomEvent,chrome:{runtime:{sendMessage:(message,respond)=>{sent.push(message);respond({ok:true});}}}});return{sent,send:message=>document.dispatchEvent(new CustomEvent('listing-claims-request',{detail:JSON.stringify({requestId:crypto.randomUUID(),...message})}))};}
  const f=bridge();f.send({type:'claims-hello'});f.send({type:'claims-submit'});f.send({type:'execute-script'});f.send({type:'claims-prepare',value:'x'.repeat(18000)});f.send({type:'claims-file-chunk',base64:'x'.repeat(710000)});assert.equal(f.sent.length,1);
  for(const other of [bridge('https://evil.test'),bridge(origin,true),bridge('http://localhost:3001')]){other.send({type:'claims-hello'});assert.equal(other.sent.length,0);}
});

test('frontend validates evidence signatures, required fields and the 100 MB local video limit',async()=>{
  const testModule={exports:{}},context=vm.createContext({module:testModule,exports:testModule.exports,crypto:crypto.webcrypto,File,URL});
  vm.runInContext(ts.transpileModule(fs.readFileSync(path.join(root,'lib/meesho-claims.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
  const lib=testModule.exports,valid=draft();assert.equal(lib.claimProblems(valid).length,0);
  assert.match(lib.claimProblems({...valid,packetId:''}).join(' '),/Packet ID/);
  assert.match(lib.evidenceProblem({name:'unboxing.mp4',type:'video/mp4',size:104857601},'video'),/100 MB/);
  await assert.rejects(lib.describeEvidence(new File(['fake'],'wrong.mp4',{type:'video/mp4'}),'video'),/contents/);
  const described=await lib.describeEvidence(new File([mp4],'original.mp4',{type:'video/mp4'}),'video');assert.equal(described.sha256,crypto.createHash('sha256').update(mp4).digest('hex'));
});

test('the frontend blocks missing or multiple extension copies before preparing a claim',async()=>{
  async function check(ids){
    const document=new EventTarget(),testModule={exports:{}};
    const context=vm.createContext({module:testModule,exports:testModule.exports,require:()=>({}),document,CustomEvent,crypto:crypto.webcrypto,setTimeout:fn=>setTimeout(fn,5),clearTimeout});
    document.addEventListener('listing-claims-request',event=>{const message=JSON.parse(event.detail);for(const id of ids)document.dispatchEvent(new CustomEvent('listing-claims-response',{detail:JSON.stringify({requestId:message.requestId,ok:true,id,version:'0.11.0',claimsAutofill:true})}));});
    vm.runInContext(ts.transpileModule(fs.readFileSync(path.join(root,'lib/meesho-claims-client.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
    return testModule.exports.checkClaimsExtension();
  }
  assert.equal(await check(['a'.repeat(32),'a'.repeat(32)]),'0.11.0');await assert.rejects(check([]),/Update and reload/);await assert.rejects(check(['a'.repeat(32),'b'.repeat(32)]),/one Browser AI Test/);
});

function videoRecorderFixture() {
  const maxBytes = 100 * 1024 * 1024;
  const instances = [];
  class MediaRecorder {
    state = 'inactive';
    constructor(_stream, options) { this.options = options; instances.push(this); }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; }
  }
  const testModule = { exports: {} };
  const context = vm.createContext({ module: testModule, exports: testModule.exports, File, MediaRecorder, require: () => ({ MAX_VIDEO_BYTES: maxBytes }) });
  const captureCode = fs.readFileSync(path.join(root, 'lib/claim-video-capture.ts'), 'utf8');
  vm.runInContext(ts.transpileModule(captureCode, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  const files = [], errors = [];
  const capture = testModule.exports.captureClaimVideo({}, file => files.push(file), message => errors.push(message));
  return { capture, recorder: instances[0], files, errors, maxBytes };
}

test('claim recording includes the last MP4 chunk after Stop and preserves every byte', async () => {
  const { capture, recorder, files, errors } = videoRecorderFixture();
  assert.equal(recorder.options.mimeType, 'video/mp4;codecs=avc1');
  recorder.ondataavailable({ data: new Blob([mp4.subarray(0, 16)]) });
  assert.equal(capture.stop(), true);
  assert.equal(capture.stop(), false);
  recorder.ondataavailable({ data: new Blob([mp4.subarray(16)]) });
  recorder.onstop();
  assert.deepEqual(errors, []);
  assert.equal(files.length, 1);
  assert.equal(files[0].type, 'video/mp4');
  assert.match(files[0].name, /^unboxing-.*\.mp4$/);
  assert.deepEqual(Buffer.from(await files[0].arrayBuffer()), mp4);
});

test('cancelled, interrupted and oversized recordings produce no evidence file', () => {
  const cancelled = videoRecorderFixture();
  cancelled.capture.cancel();
  cancelled.recorder.ondataavailable({ data: new Blob([mp4]) });
  cancelled.recorder.onstop();
  assert.deepEqual(cancelled.files, []);
  assert.deepEqual(cancelled.errors, []);

  const interrupted = videoRecorderFixture();
  interrupted.recorder.ondataavailable({ data: new Blob([mp4]) });
  interrupted.recorder.stop();
  interrupted.recorder.onstop();
  assert.deepEqual(interrupted.files, []);
  assert.match(interrupted.errors[0], /interrupted/);

  const oversized = videoRecorderFixture();
  oversized.recorder.ondataavailable({ data: { size: oversized.maxBytes + 1 } });
  oversized.recorder.onstop();
  assert.deepEqual(oversized.files, []);
  assert.match(oversized.errors[0], /100 MB/);
});

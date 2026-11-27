/* eslint-disable @typescript-eslint/no-require-imports -- Node verification harness. */
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), fsp = require("node:fs/promises"), path = require("node:path"), os = require("node:os"), vm = require("node:vm"), ts = require("typescript"), crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const oldTs = require.extensions[".ts"];
require.extensions[".ts"] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename,"utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
const contract = require(path.join(root,"lib/meesho-upload-contract.ts"));
const staging = require(path.join(root,"lib/meesho-staging.ts"));
const imageSet = require(path.join(root,"lib/meesho-image-set.ts"));
const variantImages = require(path.join(root,"lib/meesho-variant-images.ts"));
const savedVariantImages = require(path.join(root,"lib/saved-variant-images.ts"));
const makePng = () => Buffer.from([137,80,78,71,13,10,26,10,...Array(24).fill(0)]);
const target = {rowId:"parent-123",field:"image1"};
function expected(){const id=crypto.randomUUID();return{id,target,sha256:"a".repeat(64),filename:`browser-ai-meesho-test-20261102000000-${id.slice(0,8)}.png`};}
test("a link can fill only its exact job, product, image slot, filename and fingerprint",()=>{
  const e=expected(),receipt={...e,url:`https://upload.meeshosupplyassets.com/cataloging/123/${e.filename}`};
  assert.equal(contract.matchingMeeshoReceipt(receipt,e),true);
  for(const r of [{...receipt,id:crypto.randomUUID()},{...receipt,target:{...target,rowId:"other-product"}},{...receipt,target:{...target,field:"image2"}},{...receipt,sha256:"b".repeat(64)},{...receipt,url:receipt.url.replace("123/","123/other-")},{...receipt,url:receipt.url.replace("upload.meeshosupplyassets.com","evil.example")}])assert.equal(contract.matchingMeeshoReceipt(r,e),false);
  assert.equal(contract.canApplyMeeshoReceipt(receipt,e,"manually-edited","old-value"),false,"Never overwrite a newer manual edit");
  assert.equal(contract.canApplyMeeshoReceipt(receipt,e,"old-value","old-value"),true);
  assert.equal(contract.canApplyMeeshoReceipt(receipt,e,receipt.url,"old-value"),true);
});
test("staged images are immutable, operation-authorized, and fingerprint checked before native upload",async t=>{
  const dir=await fsp.mkdtemp(path.join(os.tmpdir(),"listing-meesho-"));
  t.after(async()=>{const resolved=path.resolve(dir);assert.ok(resolved.startsWith(path.resolve(os.tmpdir())+path.sep));await fsp.rm(resolved,{recursive:true,force:true});});
  const jobId=crypto.randomUUID(),file={name:"../../icon.png",type:"image/png",base64:makePng().toString("base64")};
  const prepared=await staging.prepareMeeshoImage({jobId,target,file},dir);
  assert.equal("path" in prepared,false);assert.equal("tokenHash" in prepared,false);
  const resolved=await staging.resolveMeeshoImage({jobId,token:prepared.token},dir);
  assert.deepEqual(await fsp.readFile(resolved.path),makePng());assert.deepEqual(resolved.target,target);assert.equal(resolved.sha256,prepared.sha256);
  await assert.rejects(staging.resolveMeeshoImage({jobId,token:"a".repeat(64)},dir),/authorization/);
  await assert.rejects(staging.prepareMeeshoImage({jobId,target,file},dir),/EEXIST/);
  await assert.rejects(staging.prepareMeeshoImage({jobId:crypto.randomUUID(),target,file:{...file,type:"image/jpeg"}},dir),/contents/);
  await assert.rejects(staging.resolveMeeshoImage({jobId:"../other",token:prepared.token},dir),/authorization/);
  await fsp.writeFile(resolved.path,Buffer.from("changed"));await assert.rejects(staging.resolveMeeshoImage({jobId,token:prepared.token},dir),/changed/);
});
function clientFixture(options={}){
  const doc=new EventTarget(),window=new EventTarget(),storage=new Map(),staged=new Map(),calls=[],waiting=[];let active=0,maxActive=0,helloAttempts=0;
  const session={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
  const context=vm.createContext({module:{exports:{}},exports:{},require:name=>{if(name==="./meesho-upload-contract")return contract;if(name==="./meesho-image-set")return require(path.join(root,"lib/meesho-image-set.ts"));throw new Error(name);},window,document:doc,CustomEvent,File,URL,AbortSignal,crypto:crypto.webcrypto,location:{origin:options.origin||"http://localhost:3000"},localStorage:session,sessionStorage:session,
    setTimeout:(fn,ms)=>setTimeout(fn,ms===1000?5:ms),clearTimeout,setInterval,clearInterval,
    FileReader:class{readAsDataURL(file){file.arrayBuffer().then(bytes=>{this.result="data:"+file.type+";base64,"+Buffer.from(bytes).toString("base64");this.onload();});}},
    fetch:async(url,init)=>{const input=JSON.parse(init.body);calls.push({type:"stage",id:input.jobId,target:input.target});const bytes=Buffer.from(input.file.base64,"base64"),descriptor={id:input.jobId,target:input.target,type:input.file.type,originalName:input.file.name,bytes:bytes.length,token:"c".repeat(64),sha256:crypto.createHash("sha256").update(bytes).digest("hex"),filename:`browser-ai-meesho-test-20261102000000-${input.jobId.slice(0,8)}.png`};staged.set(input.jobId,descriptor);return{ok:true,json:async()=>descriptor};}
  });context.exports=context.module.exports;
  const handleRequest=event=>{
    const m=JSON.parse(event.detail);
    const reply=data=>doc.dispatchEvent(new CustomEvent("listing-meesho-response",{detail:JSON.stringify({ok:true,requestId:m.requestId,extensionId:m.extensionId,...data})}));
    if(m.type==="listing-meesho-hello"){
      helloAttempts++;
      if(options.noExtension||helloAttempts<(options.replyOnHello||1))return;
      if(options.helloError){reply({ok:false,error:options.helloError});return;}
      const hello={id:"a".repeat(32),version:options.routedReplies?"0.12.1":"0.12.0",routedReplies:options.routedReplies,listingUpload:true,sellerAccountDetection:options.sellerAccountDetection!==false,singleTabUploads:!options.oldExtension,browserStaging:true,downloadFreeUploads:options.downloadFreeUploads!==false};
      reply(hello);
      if(options.secondExtension)reply({...hello,id:"b".repeat(32)});
      return;
    }
    if(options.routedReplies){
      assert.equal(event.type,"listing-meesho-routed-request");
      assert.equal(m.extensionId,"a".repeat(32));
      reply({ok:false,extensionId:undefined,error:"Late response from an invalidated bridge."});
    }
    if(m.type==="listing-meesho-account"){calls.push({type:"account"});reply(options.accountError?{ok:false,error:options.accountError}:{sourceUrl:sellerPage("seller-a")});return;}
    if(m.type==="listing-meesho-prepare"){const bytes=Buffer.from(m.file.base64,"base64"),descriptor={id:m.jobId,target:m.target,type:m.file.type,originalName:m.file.name,mode:"browser",bytes:bytes.length,token:"c".repeat(64),sha256:crypto.createHash("sha256").update(bytes).digest("hex"),filename:`browser-ai-meesho-test-20261102000000-${m.jobId.slice(0,8)}.png`};staged.set(m.jobId,descriptor);calls.push({type:"browser-stage",id:m.jobId,target:m.target});reply({staged:descriptor});return;}
    if(m.type==="listing-meesho-status"){reply({job:{id:m.jobId,phase:"finding-file"}});return;}
    if(m.type==="listing-meesho-start"){calls.push({type:"upload",id:m.jobId,sourceUrl:m.sourceUrl,target:m.listing.target,origin:m.listing.origin,mode:m.listing.mode});active++;maxActive=Math.max(maxActive,active);const complete=()=>{active--;const s=staged.get(m.jobId),record={id:m.jobId,filename:s.filename,sha256:s.sha256,target:options.wrongTarget?{...s.target,field:"image4"}:s.target,url:`https://upload.meeshosupplyassets.com/cataloging/123/${s.filename}`};reply({job:{id:m.jobId,phase:"complete",record}});};if(options.hold)waiting.push(complete);else complete();}
  };
  doc.addEventListener("listing-meesho-request",handleRequest);
  doc.addEventListener("listing-meesho-routed-request",handleRequest);
  vm.runInContext(ts.transpileModule(fs.readFileSync(path.join(root,"lib/meesho-upload-client.ts"),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
  return{client:context.module.exports,doc,window,calls,waiting,storage,maxActive:()=>maxActive,helloAttempts:()=>helloAttempts};
}
test("the hosted listing retries extension discovery and reports browser connection failures before staging",async()=>{
  const origin='https://listing-tool-three.vercel.app';
  const file=new File([makePng()],'1.png',{type:'image/png'});
  const delayed=clientFixture({origin,replyOnHello:3});
  await delayed.client.startMeeshoUpload(file,target,'');
  assert.equal(delayed.helloAttempts(),3);
  assert.equal(delayed.client.getMeeshoUpload(target).phase,'ready');
  assert.equal(delayed.calls.filter(call=>call.type==='upload').length,1);

  const blocked=clientFixture({origin,noExtension:true});
  await blocked.client.startMeeshoUpload(file,target,'');
  assert.equal(blocked.helloAttempts(),4);
  assert.equal(blocked.calls.length,0);
  assert.match(blocked.client.getMeeshoUpload(target).message,/allow.*listing-tool-three\.vercel\.app/);

  const error='The extension reloaded. Refresh the listing page, then check the saved upload.';
  const reloaded=clientFixture({origin,helloError:error});
  await reloaded.client.startMeeshoUpload(file,target,'');
  assert.equal(reloaded.calls.length,0);
  assert.equal(reloaded.client.getMeeshoUpload(target).message,error);

  const duplicate=clientFixture({origin,secondExtension:true});
  await duplicate.client.startMeeshoUpload(file,target,'');
  assert.equal(duplicate.calls.length,0);
  assert.match(duplicate.client.getMeeshoUpload(target).message,/Keep one Browser AI Test extension/);
});
test("subscribers share discovery and automatically reconnect when the bridge becomes ready",async t=>{
  const options={origin:"https://listing-tool-three.vercel.app",noExtension:true};
  const f=clientFixture(options);
  const phases=[];
  let onUnavailable;
  let onConnected;
  const unavailable=new Promise(resolve=>{onUnavailable=resolve;});
  const connected=new Promise(resolve=>{onConnected=resolve;});
  t.after(f.client.subscribeMeeshoExtension(()=>{
    const state=f.client.getMeeshoExtensionState();
    phases.push(state.phase);
    if(state.phase==="unavailable")onUnavailable();
    if(state.phase==="connected")onConnected();
  }));
  t.after(f.client.subscribeMeeshoExtension(()=>{}));
  assert.equal(f.client.getMeeshoExtensionState().phase,"checking");
  await unavailable;
  assert.equal(f.helloAttempts(),4);
  options.noExtension=false;
  f.doc.dispatchEvent(new Event("listing-meesho-bridge-ready"));
  await connected;
  assert.equal(f.helloAttempts(),5);
  assert.deepEqual(phases,["unavailable","checking","connected"]);
  assert.equal(f.client.getMeeshoExtensionState().version,"0.12.0");
  assert.equal(f.calls.length,0);
});
test("uploads target the connected extension through a channel legacy bridges cannot act on",async()=>{
  const f=clientFixture({routedReplies:true});
  const legacyRequests=[];
  f.doc.addEventListener("listing-meesho-request",event=>{
    const {type}=JSON.parse(event.detail);
    if(type!=="listing-meesho-hello")legacyRequests.push(type);
  });
  await f.client.startMeeshoUpload(new File([makePng()],"1.png",{type:"image/png"}),target,"");
  assert.equal(f.client.getMeeshoUpload(target).phase,"ready");
  assert.equal(f.calls.filter(call=>call.type==="upload").length,1);
  assert.deepEqual(legacyRequests,[]);
});
const sellerPage = seller => `https://supplier.meesho.com/panel/v3/new/cataloging/${seller}/images-bulk-upload`;
function loadMeeshoExtension(...files){
  const context=vm.createContext({URL,setTimeout});
  for(const file of files)vm.runInContext(fs.readFileSync(path.join(root,'browser-extension',file),'utf8'),context);
  return context;
}
test("reconnection injects only into open listing tabs allowed by Chrome",async()=>{
  const {reconnectOpenTabs}=loadMeeshoExtension("listing-core.js").BrowserTestListing;
  const hosted="https://listing-tool-three.vercel.app";
  const injected=[];
  await reconnectOpenTabs({
    tabs:{
      query:async({url})=>{
        assert.ok(url.includes(hosted+"/*"));
        return [
          {id:1,url:hosted+"/create-product"},
          {id:2,url:"http://localhost:3000/"},
          {id:3,url:"https://other-site.vercel.app/"},
          {id:4,url:hosted+"/claims",pendingUrl:"https://other-site.vercel.app/"},
        ];
      },
    },
    permissions:{contains:async({origins})=>origins[0]===hosted+"/*"},
    scripting:{executeScript:async params=>injected.push(params)},
  });
  assert.deepEqual(JSON.parse(JSON.stringify(injected)),[{target:{tabId:1},files:["listing-bridge.js"]}]);
});
test("reinjecting the listing bridge replaces its old listener",()=>{
  const document=new EventTarget(),window={},requests=[],replies=[];
  window.top=window;
  const id="a".repeat(32);
  const chrome={runtime:{id,sendMessage:(message,cb)=>{requests.push(message);cb({ok:true});}}};
  const context=vm.createContext({location:{origin:"https://listing-tool-three.vercel.app"},document,window,chrome,CustomEvent});
  const source=fs.readFileSync(path.join(root,"browser-extension","listing-bridge.js"),"utf8");
  vm.runInContext(source,context);
  vm.runInContext(source,context);
  document.addEventListener("listing-meesho-response",event=>replies.push(JSON.parse(event.detail)));
  for(const extensionId of [id,"b".repeat(32)]){
    const detail=JSON.stringify({requestId:crypto.randomUUID(),type:"listing-meesho-status",extensionId});
    document.dispatchEvent(new CustomEvent("listing-meesho-routed-request",{detail}));
  }
  assert.equal(requests.length,1);
  assert.equal(replies.length,1);
  assert.equal(replies[0].extensionId,id);
});
test("seller discovery validates open pages, deduplicates the same seller and stops on ambiguity",async()=>{
  const {resolveSellerPage}=loadMeeshoExtension('meesho-core.js').BrowserTestMeesho;
  const chromeFor=urls=>({tabs:{query:async ({url})=>{assert.equal(url,'https://supplier.meesho.com/*');return urls.map(value=>typeof value==='string'?{url:value}:value);}}});
  const motiw=sellerPage('motiw'),other=sellerPage('another-seller');
  assert.equal(await resolveSellerPage(chromeFor([motiw,'https://supplier.meesho.com/panel/v3/new/fulfillment/motiw/claims'])),motiw);
  assert.equal(await resolveSellerPage(chromeFor([other]),motiw),motiw);
  assert.equal(await resolveSellerPage(chromeFor([other])),other);
  assert.equal(await resolveSellerPage(chromeFor(['https://supplier.meesho.com/panel/v3/new/growth/jifdb/home'])),sellerPage('jifdb'));
  await assert.rejects(resolveSellerPage(chromeFor([motiw,other])),/More than one/);
});
test("seller discovery follows the signed-in dashboard redirect when no verified seller tab is open",async()=>{
  const {BrowserTestMeesho}=loadMeeshoExtension('meesho-core.js');
  const entryUrl=sellerPage('motiw');
  const dashboard='https://supplier.meesho.com/panel/v3/new/growth/jifdb/home';
  const navigations=[
    {status:'complete',url:entryUrl,pendingUrl:dashboard},
    {status:'complete',url:entryUrl},
    {status:'complete',url:dashboard},
  ];
  const closed=[];
  const chrome={
    tabs:{
      query:async()=>[
        {url:sellerPage('other').replace('.com','.com.example')},
        {url:sellerPage('other'),pendingUrl:'https://supplier.meesho.com/'},
      ],
      create:async ({url,active})=>{assert.equal(url,entryUrl);assert.equal(active,false);return {id:76};},
      get:async id=>{assert.equal(id,76);return navigations.shift();},
      remove:async id=>closed.push(id),
    },
    scripting:{executeScript:async ({args})=>{assert.equal(args[0],entryUrl);return [{result:false}];}},
  };
  assert.equal(await BrowserTestMeesho.resolveSellerPage(chrome),sellerPage('jifdb'));
  assert.deepEqual(closed,[76]);
});
test("a signed-out session opens Meesho for sign-in without selecting an upload destination",async()=>{
  const context=loadMeeshoExtension('meesho-core.js');
  let time=0;
  context.Date={now:()=>time};
  context.setTimeout=(resolve,ms)=>{time+=ms;resolve();};
  const focused=[];
  const chrome={tabs:{
    query:async()=>[],
    create:async()=>({id:77}),
    get:async()=>({status:'complete',url:'https://supplier.meesho.com/'}),
    update:async(id,{active})=>{if(active)focused.push(id);},
  }};
  await assert.rejects(context.BrowserTestMeesho.resolveSellerPage(chrome),/Sign in to Meesho in the tab that opened/);
  assert.deepEqual(focused,[77]);
});
test("the upload runner opens the selected seller page and stops before sending an image if it redirects",async()=>{
  const {BrowserTestMeeshoRunner}=loadMeeshoExtension('meesho-core.js','meesho-runner.js');
  const sourceUrl=sellerPage('motiw');
  const state={};
  const opened=[];
  const tab={id:5,url:sourceUrl,status:'complete'};
  const chromeApi={
    tabs:{
      create:async options=>{opened.push(options);return tab;},
      get:async()=>tab,
    },
    storage:{local:{get:async()=>state,set:async values=>Object.assign(state,values)}},
    scripting:{executeScript:async()=>[{result:true}]},
  };
  const runner=new BrowserTestMeeshoRunner({chromeApi,upload:async()=>assert.fail('An image may only be supplied after the seller page is verified.')});
  await runner.open({id:'first',sourceUrl});
  assert.equal(opened.length,1);
  assert.equal(opened[0].url,sourceUrl);
  assert.equal(opened[0].active,true);

  tab.url='https://supplier.meesho.com/';
  await assert.rejects(runner.resume('first',1),/Sign in to the intended seller in the Meesho tab opened/);
  assert.equal((await runner.get('first')).phase,'failed-before-upload');
});
test("the listing uses an explicit seller page or automatic detection and blocks upload without a seller",async()=>{
  const f=clientFixture(),file=new File([makePng()],'image.png',{type:'image/png'}),motiw=sellerPage('motiw');
  assert.equal(f.client.savedMeeshoPanel(),'');
  f.client.saveMeeshoPanel(motiw);
  await f.client.startMeeshoUpload(file,target,'');
  assert.equal(f.calls.find(c=>c.type==='upload').sourceUrl,motiw);
  assert.equal(f.calls.some(c=>c.type==='account'),false);
  f.client.saveMeeshoPanel('');
  assert.equal(f.client.savedMeeshoPanel(),'');
  const missing=clientFixture({accountError:'Sign in to Meesho first.'});
  await missing.client.startMeeshoUpload(file,target,'');
  assert.deepEqual(missing.calls.map(c=>c.type),['account']);
  assert.match(missing.client.getMeeshoUpload(target).message,/Sign in/);
  const old=clientFixture({sellerAccountDetection:false});
  await old.client.startMeeshoUpload(file,target,'');
  assert.equal(old.calls.length,0);
  assert.match(old.client.getMeeshoUpload(target).message,/0.12.0/);
});
test("saved retries can change the seller before file dispatch only",async()=>{
  const {BrowserTestMeeshoRunner}=loadMeeshoExtension('meesho-core.js','meesho-runner.js');
  const runner=new BrowserTestMeeshoRunner({});
  const job={id:'saved',phase:'failed-before-upload',sourceUrl:sellerPage('old-seller'),tabId:5,uploadAttempted:false};
  runner.get=async()=>job;
  runner.write=async()=>{};
  runner.open=async current=>{assert.equal(current.sourceUrl,sellerPage('motiw'));assert.equal(current.tabId,undefined);};
  let sends=0,lookups=0;
  runner.send=async()=>{sends++;};
  runner.finish=async current=>current;
  const select=async()=>{lookups++;return sellerPage('motiw');};
  await runner.resume(job.id,1,undefined,select);
  assert.equal(sends,1);
  job.uploadAttempted=true;
  runner.check=async()=>{throw new Error('The original tab changed.');};
  await assert.rejects(runner.resume(job.id,1,undefined,select),/automatic re-upload is blocked/);
  assert.equal(sends,1);
  assert.equal(lookups,1);
  const {BrowserTestMeeshoNative}=loadMeeshoExtension('meesho-core.js','meesho-native.js');
  const native=new BrowserTestMeeshoNative({chromeApi:{tabs:{get:async()=>({url:sellerPage('another-seller')})}},stage:async()=>assert.fail('The wrong seller should not receive bytes.')});
  await assert.rejects(native.upload({tabId:5,sourceUrl:sellerPage('motiw')}),/selected Meesho seller/);
});
test("two image slots queue separately; each receives its own URL and never reaches 100 before field acknowledgement",async()=>{
  const f=clientFixture(),a=target,b={rowId:"variant-456",field:"image2"};
  await Promise.all([f.client.startMeeshoUpload(new File([makePng()],"first.png",{type:"image/png"}),a,""),f.client.startMeeshoUpload(new File([makePng()],"second.png",{type:"image/png"}),b,"")]);
  const one=f.client.getMeeshoUpload(a),two=f.client.getMeeshoUpload(b);assert.equal(one.phase,"ready");assert.equal(two.phase,"ready");assert.equal(one.progress,95);assert.notEqual(one.receipt.url,two.receipt.url);assert.equal(one.receipt.target.rowId,a.rowId);assert.equal(two.receipt.target.field,"image2");assert.equal(f.maxActive(),1);
  f.client.markMeeshoApplied(a,one.id);assert.equal(f.client.getMeeshoUpload(a).progress,100);assert.equal(f.client.getMeeshoUpload(b).progress,95);
  assert.equal([...f.storage.values()].some(value=>value.includes("c".repeat(64))),false,"Never persist staging authorization in page storage");
});
test("a mismatched extension result stops with an error and no applied URL",async()=>{
  const f=clientFixture({wrongTarget:true});await f.client.startMeeshoUpload(new File([makePng()],"first.png",{type:"image/png"}),target,"");const j=f.client.getMeeshoUpload(target);assert.equal(j.phase,"error");assert.equal(j.receipt,undefined);assert.ok(j.progress<100);assert.match(j.message,/does not match/);
});
test("a completed image that conflicted with manual edits does not prevent choosing a new image",async()=>{
  const f=clientFixture();await f.client.startMeeshoUpload(new File([makePng()],"old.png",{type:"image/png"}),target,"");const old=f.client.getMeeshoUpload(target);
  await f.client.startMeeshoUpload(new File([makePng()],"new.png",{type:"image/png"}),target,"newer-manual-value");const next=f.client.getMeeshoUpload(target);assert.notEqual(next.id,old.id);assert.equal(next.originalName,"new.png");assert.equal(next.initialValue,"newer-manual-value");assert.notEqual(next.receipt.url,old.receipt.url);
});
test("selecting another source image while uploading prevents the original result from auto-applying",async()=>{
  const f=clientFixture({hold:true});const operation=f.client.startMeeshoUpload(new File([makePng()],"first.png",{type:"image/png"}),target,"");
  for(let n=0;n<100&&!f.waiting.length;n++)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(f.waiting.length,1);
  f.client.invalidateMeeshoSelection(target);f.waiting.shift()();await operation;assert.equal(f.client.getMeeshoUpload(target).superseded,true);assert.equal(f.client.getMeeshoUpload(target).progress,95);
});
test("local-only staging and supplier upload page validation reject other destinations",()=>{
  assert.equal(staging.localListingOrigin("http://localhost:3000"),true);assert.equal(staging.localListingOrigin("https://example.com"),false);assert.equal(contract.isMeeshoPanel(sellerPage('motiw')),true);assert.equal(contract.isMeeshoPanel("https://supplier.meesho.com/orders"),false);
});
test("the supplied four image filenames map correctly regardless of selection order",()=>{
  const names=["Sup 2.png","Sup 3.png","1.png","Sup 1.png"].map(name=>({name}));
  assert.deepEqual(imageSet.arrangeProductImages(names).map(f=>f?.name),["1.png","Sup 1.png","Sup 2.png","Sup 3.png"]);
  assert.deepEqual(imageSet.arrangeProductImages([{name:"Sup 2.png"}]).map(f=>f?.name||null),[null,null,"Sup 2.png",null],"Missing slots stay empty instead of shifting supporting images");
  assert.deepEqual(imageSet.arrangeProductImages([{name:"photo10.jpg"},{name:"photo2.jpg"}]).filter(Boolean).map(f=>f.name),["photo2.jpg","photo10.jpg"]);
  assert.throws(()=>imageSet.arrangeProductImages([{name:"main.png"},{name:"1.png"}]),/Both/);
});
test("bulk validation is atomic: invalid files, excess files or occupied slots queue nothing new",async()=>{
  const f=clientFixture(),good=new File([makePng()],"1.png",{type:"image/png"}),bad=new File(["gif"],"Sup 1.gif",{type:"image/gif"});
  assert.throws(()=>f.client.startMeeshoImageSet("bulk-product",[{field:"image1",file:good},{field:"image2",file:bad}],{}),/No images were queued/);assert.equal(f.calls.length,0);assert.equal(f.client.getMeeshoUpload({rowId:"bulk-product",field:"image1"}),null);
  assert.throws(()=>imageSet.validateProductImageFiles(Array.from({length:5},(_,n)=>({name:n+".png",type:"image/png",size:10,lastModified:n}))),/4 files/);
  assert.throws(()=>imageSet.validateProductImageFiles([{name:"huge.png",type:"image/png",size:4194305,lastModified:1}]),/4 MB/);
  const duplicate={name:"same.png",type:"image/png",size:10,lastModified:1};assert.throws(()=>imageSet.validateProductImageFiles([duplicate,duplicate]),/twice/);
  const held=clientFixture({hold:true}),existing=held.client.startMeeshoUpload(good,{rowId:"bulk-product",field:"image3"},"");
  assert.throws(()=>held.client.startMeeshoImageSet("bulk-product",[{field:"image1",file:good},{field:"image3",file:new File([makePng()],"Sup 2.png",{type:"image/png"})}],{}),/pending upload/);assert.equal(held.client.getMeeshoUpload({rowId:"bulk-product",field:"image1"}),null);
  for(let n=0;n<100&&!held.waiting.length;n++)await new Promise(r=>setTimeout(r,5));held.waiting.shift()();await existing;
});
test("one four-file selection produces four serial, slot-bound uploads and aggregate 100 only after all fields are filled",async()=>{
  const f=clientFixture(),rowId="bulk-parent",values={image1:"old-main",image2:"old-2",image3:"old-3",image4:"old-4"};
  const slots=imageSet.arrangeProductImages(["Sup 2.png","1.png","Sup 3.png","Sup 1.png"].map(name=>new File([makePng()],name,{type:"image/png"})));
  const ticket=f.client.startMeeshoImageSet(rowId,slots.map((file,n)=>({field:imageSet.PRODUCT_IMAGE_SLOTS[n],file})),values);assert.equal(ticket.jobs.length,4);
  await ticket.finished;assert.equal(f.maxActive(),1);assert.equal(f.calls.filter(c=>c.type==="upload").length,4);
  assert.equal(f.calls.filter(c=>c.type==='account').length,1);
  assert.ok(f.calls.filter(c=>c.type==='upload').every(c=>c.sourceUrl===sellerPage('seller-a')));
  const read=entry=>f.client.getMeeshoUpload({rowId,field:entry.field});
  assert.equal(imageSet.imageSetProgress(ticket.jobs,read,values).percent,95);assert.equal(new Set(ticket.jobs.map(j=>read(j).receipt.url)).size,4);
  for(const [index,j]of ticket.jobs.entries()){const job=read(j);assert.equal(job.receipt.target.field,imageSet.PRODUCT_IMAGE_SLOTS[index]);assert.equal(job.originalName,slots[index].name);values[j.field]=job.receipt.url;f.client.markMeeshoApplied({rowId,field:j.field},j.id);}
  assert.deepEqual(imageSet.imageSetProgress(ticket.jobs,read,values),{completed:4,failed:0,percent:100});
  assert.equal(f.client.getMeeshoUpload({rowId:"another-product",field:"image1"}),null);
  values.image4="newer-manual-link";assert.equal(imageSet.imageSetProgress(ticket.jobs,read,values).percent,98);assert.equal(imageSet.imageSetProgress(ticket.jobs,read,values).completed,3);
});
test("staging HTTP boundary blocks cross-site preparation and unauthorized file resolution",async()=>{
  const source=ts.transpileModule(fs.readFileSync(path.join(root,"app/api/meesho-upload/route.ts"),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const context=vm.createContext({module:{exports:{}},exports:{},require:()=>staging,Request,Response,URL,Buffer});context.exports=context.module.exports;vm.runInContext(source,context);const route=context.module.exports;
  const input={action:"prepare",jobId:crypto.randomUUID(),target,file:{name:"x.png",type:"image/png",base64:makePng().toString("base64")}};
  for(const headers of [{Origin:"https://evil.test"},{Origin:"http://localhost:3000","Sec-Fetch-Site":"cross-site"}]){const r=await route.POST(new Request("http://localhost:3000/api/meesho-upload",{method:"POST",headers:{"Content-Type":"application/json",...headers},body:JSON.stringify(input)}));assert.equal(r.status,400);assert.equal('path' in await r.json(),false);}
  const bad=await route.POST(new Request("http://localhost:3000/api/meesho-upload",{method:"POST",headers:{"Content-Type":"application/json",Origin:"https://evil.test","X-Listing-Extension":"a".repeat(32)},body:JSON.stringify({action:"resolve",jobId:input.jobId,token:"b".repeat(64)})}));assert.equal(bad.status,400);
  assert.equal((await route.OPTIONS(new Request("http://localhost:3000/api/meesho-upload",{method:"OPTIONS",headers:{Origin:"https://evil.test"}}))).status,403);
});
test("variant filenames bind to actual V numbers; absent V11 and supporting images remain untouched",()=>{
  const rows=Array.from({length:10},(_,i)=>({rowId:`row-${i+2}`,version:i+2,title:`V${i+2}`,image1:`old-${i+2}`,image2:'support-1',image3:'support-2',image4:'support-3'}));
  const files=[10,3,9,2,8,4,7,5,6].map(n=>new File([makePng()],`${n}.png`,{type:'image/png'}));
  const plan=variantImages.arrangeVariantMainImages(files,rows);assert.deepEqual(plan.map(p=>p.rowId),Array.from({length:9},(_,i)=>`row-${i+2}`));assert.equal(plan.some(p=>p.rowId==='row-11'),false);
  for(const selected of plan)assert.equal(Number(selected.file.name.split('.')[0]),rows.find(row=>row.rowId===selected.rowId).version);
  assert.throws(()=>variantImages.arrangeVariantMainImages([new File([makePng()],'1.png',{type:'image/png'})],rows),/V1 does not exist/);
  assert.throws(()=>variantImages.arrangeVariantMainImages([new File([makePng()],'Sup 1.png',{type:'image/png'})],rows),/supporting image/);
  assert.throws(()=>variantImages.validateVariantImageSelection([{file:files[0],rowId:'row-2'},{file:files[1],rowId:'row-2'}],rows),/same variant/);
});
test("variant main-image application preserves all supporting overrides, other variants and the parent",()=>{
  const parent={image1:'parent-main',image2:'shared-1',image3:'shared-2',image4:'shared-3'};
  const variants=[{id:'v2',productName:'variant 2',version:2,overrides:{image2:'custom-2',image3:'custom-3',image4:'custom-4',price:'123'}},{id:'v3',version:3,overrides:{image1:'old-v3'}}];
  const before=structuredClone({parent,variants});const result=variantImages.withVariantMainImage(variants,'v2','new-main');
  assert.equal(result[0].overrides.image1,'new-main');assert.equal(result[0].overrides.image2,'custom-2');assert.equal(result[0].overrides.image3,'custom-3');assert.equal(result[0].overrides.image4,'custom-4');assert.equal(result[0].overrides.price,'123');assert.equal(result[1],variants[1]);assert.deepEqual({parent,variants},before);
});
test("nine variant main images queue independently while a legacy multi-tab extension is blocked before staging",async()=>{
  const f=clientFixture(),rows=Array.from({length:10},(_,i)=>({rowId:`variant-${i+2}`,version:i+2,image1:`old-${i+2}`,image2:'support-1',image3:'support-2',image4:'support-3'}));
  const ticket=f.client.startMeeshoImageBatch(rows.slice(0,9).map(row=>({file:new File([makePng()],`${row.version}.png`,{type:'image/png'}),target:{rowId:row.rowId,field:'image1'},initialValue:row.image1})));
  await ticket.finished;assert.equal(f.maxActive(),1);assert.equal(ticket.jobs.length,9);
  for(const expected of ticket.jobs){const job=f.client.getMeeshoUpload(expected.target);assert.equal(job.receipt.target.field,'image1');assert.equal(job.receipt.target.rowId,expected.target.rowId);assert.equal(job.progress,95);}
  assert.equal(f.client.getMeeshoUpload({rowId:'variant-11',field:'image1'}),null);
  assert.equal(f.client.getMeeshoUpload({rowId:'variant-2',field:'image2'}),null);
  const legacy=clientFixture({oldExtension:true});await legacy.client.startMeeshoUpload(new File([makePng()],'2.png',{type:'image/png'}),target,'',true);assert.equal(legacy.calls.length,0);assert.match(legacy.client.getMeeshoUpload(target).message,/0.10.0/);
});
test("deployed uploads use browser memory and block extensions that would download a copy",async()=>{
  const origin='https://listing-tool-three.vercel.app',f=clientFixture({origin,browserStaging:true});
  const ticket=f.client.startMeeshoImageBatch([2,3].map(version=>({file:new File([makePng()],`${version}.png`,{type:'image/png'}),target:{rowId:`cloud-v${version}`,field:'image1'},initialValue:'old'})));
  await ticket.finished;assert.equal(f.calls.filter(c=>c.type==='stage').length,0);assert.equal(f.calls.filter(c=>c.type==='browser-stage').length,2);assert.equal(f.maxActive(),1);
  for(const entry of ticket.jobs){const upload=f.client.getMeeshoUpload(entry.target);assert.equal(upload.phase,'ready');assert.equal(upload.receipt.target.rowId,entry.target.rowId);assert.equal(upload.receipt.target.field,'image1');}
  assert.ok(f.calls.filter(c=>c.type==='upload').every(c=>c.origin===origin&&c.mode==='browser'));
  for(const site of [origin,'http://localhost:3000']){
    const old=clientFixture({origin:site,downloadFreeUploads:false});await old.client.startMeeshoUpload(new File([makePng()],'2.png',{type:'image/png'}),target,'');
    assert.equal(old.calls.length,0);assert.match(old.client.getMeeshoUpload(target).message,/without a downloaded copy requires.*0.10.0/);
  }
});
test("saved phone and charm filenames map to actual family versions, excluding parents and unknown versions",()=>{
  const productRows=savedVariantImages.savedVariantImageRows([
    {id:'phone-10',parentId:'phone-parent',version:'V10',image1:'old10'},
    {id:'phone-parent',variantNumber:99,image1:'parent'},
    {id:'phone-2',parentId:'phone-parent',variantNumber:2,sku:'MODEL.V20',image1:'old2'},
    {id:'phone-unknown',parentId:'phone-parent',version:'unknown'},
  ],'product');
  assert.deepEqual(productRows.map(row=>[row.rowId,row.version]),[['phone-2',2],['phone-10',10]]);
  const charmRows=savedVariantImages.savedVariantImageRows([
    {id:'charm-parent',sourceKind:'parent',sourceVariantNumber:99,sku:'CHARM.V99'},
    {id:'charm-10',sourceKind:'variant',sourceVariantNumber:10,sku:'CHARM.V2'},
    {id:'charm-2',sourceKind:'variant',sourceVariantNumber:2,sku:'CHARM.V10'},
  ],'charm');
  assert.deepEqual(charmRows.map(row=>[row.rowId,row.version]),[['charm-2',2],['charm-10',10]]);
  const files=[10,2].map(n=>new File([makePng()],`${n}.png`,{type:'image/png'}));
  for(const rows of [productRows,charmRows]) assert.deepEqual(variantImages.arrangeVariantMainImages(files,rows).map(s=>s.rowId),rows.map(r=>r.rowId));
});
test("saved-image partial failure keeps failed links for retry and writes only image1",async()=>{
  const db=new Map([['v2',{id:'v2',parentId:'parent',variantNumber:2,image1:'old2',image2:'support2',image3:'support3',image4:'support4',sku:'SKU.V2',productName:'Title 2'}],['v3',{id:'v3',parentId:'parent',variantNumber:3,image1:'old3',image2:'other-support',sku:'SKU.V3',productName:'Title 3'}]]);
  const original=structuredClone([...db.values()]);
  const pending={v2:{url:'uploaded2',initialValue:'old2'},v3:{url:'uploaded3',initialValue:'old3'}};
  let fail=true;const calls=[];
  const save=async(id,payload)=>{calls.push({id,payload});assert.deepEqual(Object.keys(payload),['image1']);if(id==='v3'&&fail)throw new Error('temporary database failure');db.set(id,{...db.get(id),...payload});};
  const firstPlan=savedVariantImages.pendingVariantMainImageChanges(savedVariantImages.savedVariantImageRows([...db.values()],'product'),pending);
  firstPlan[0].payload.image2='must-not-save';
  const first=await savedVariantImages.saveVariantMainImages(firstPlan,save);
  assert.deepEqual(first.saved,['v2']);assert.equal(first.errors.length,1);assert.equal(db.get('v2').image1,'uploaded2');assert.equal(db.get('v3').image1,'old3');
  for(const id of first.saved)delete pending[id];fail=false;
  const second=await savedVariantImages.saveVariantMainImages(savedVariantImages.pendingVariantMainImageChanges(savedVariantImages.savedVariantImageRows([...db.values()],'product'),pending),save);
  assert.deepEqual(second.saved,['v3']);assert.deepEqual(calls.map(call=>call.id),['v2','v3','v3']);
  for(const before of original){const after=db.get(before.id);for(const field of ['image2','image3','image4','sku','productName'])assert.equal(after[field],before[field]);}
  const preview=savedVariantImages.withSavedVariantMainImage({...db.get('v2'),image:'old-thumb'},'new-preview');
  assert.equal(preview.image,'new-preview');assert.equal(preview.image2,'support2');assert.equal(db.get('v2').image1,'uploaded2');
});
test("saving uploaded links rejects removed variants and preserves newer main-image edits",()=>{
  const rows=[{rowId:'v2',version:2,image1:'newer-manual-edit'}];
  assert.throws(()=>savedVariantImages.pendingVariantMainImageChanges(rows,{v2:{url:'upload',initialValue:'old'}}),/edited elsewhere/);
  assert.throws(()=>savedVariantImages.pendingVariantMainImageChanges(rows,{other:{url:'upload',initialValue:'old'}}),/no longer available/);
  assert.deepEqual(savedVariantImages.pendingVariantMainImageChanges(rows,{v2:{url:'newer-manual-edit',initialValue:'old'}}),[]);
});
process.on("exit",()=>{if(oldTs)require.extensions[".ts"]=oldTs;else delete require.extensions[".ts"];});

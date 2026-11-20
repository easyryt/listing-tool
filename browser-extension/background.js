importScripts('client.js', 'drive-core.js', 'drive-upload.js', 'drive-native.js', 'drive-runner.js');
importScripts('meesho-core.js','meesho-native.js','meesho-runner.js');
importScripts('listing-core.js','listing-browser-stage.js');
importScripts('claims-core.js','claims-page.js','claims-runner.js');
const Drive = globalThis.BrowserTestDrive;
if(chrome.storage?.local?.setAccessLevel) chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}).catch(()=>{});
async function pairedApi(code,timeoutMs=30000){
  let api=await localApi(timeoutMs);
  try{await api.request('/api/status');return api;}catch{}
  if(!/^[A-Fa-f0-9]{8}$/.test(code||''))throw new Error('Refresh the local uploader to reconnect its image-staging service.');
  const paired=await api.request('/api/pair',{code},true);await chrome.storage.session.set({access:paired.token});return localApi(timeoutMs);
}
const nativeUploader=new globalThis.BrowserTestDriveNative({stage:async({jobId,file,code})=>(await pairedApi(code)).request('/api/drive-stage-image',{jobId,file:file.base64===undefined?undefined:file})});
const runner=new globalThis.BrowserTestDriveRunner({upload:input=>nativeUploader.upload(input),mirror:async(record,code)=>{
  const saved=await(await pairedApi(code,5000)).request('/api/records',{requestId:record.id,title:record.originalName,sku:'DRIVE-TEST-'+record.id.slice(0,8),sourceUrl:record.sourceUrl,imageUrls:[record.url],filename:record.filename});
  return {saved:true,id:saved.record.id};
}});
const meeshoNative=new globalThis.BrowserTestMeeshoNative({stage:async({jobId,file,code})=>(await pairedApi(code)).request('/api/meesho-stage-image',{jobId,file:file.base64===undefined?undefined:file})});
const meeshoRunner=new globalThis.BrowserTestMeeshoRunner({upload:input=>meeshoNative.upload(input),mirror:async(record,code)=>{
  const saved=await(await pairedApi(code,5000)).request('/api/records',{requestId:record.id,title:record.originalName,sku:'MEESHO-TEST-'+record.id.slice(0,8),sourceUrl:record.sourceUrl,imageUrls:[record.url],filename:record.filename});return{saved:true,id:saved.record.id};
}});
let uploaderActive=false;
const listingBrowserStage=new globalThis.BrowserTestListingBrowserStage();
const listingNative=new globalThis.BrowserTestMeeshoNative({stage:async({jobId,code})=>{
  globalThis.BrowserTestListing.validate(code,jobId);
  if(code.mode==='browser')return listingBrowserStage.resolve(code,jobId);
  const response=await fetch(code.origin+'/api/meesho-upload',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json','X-Listing-Extension':chrome.runtime.id},body:JSON.stringify({action:'resolve',jobId,token:code.token}),signal:AbortSignal.timeout(20000)});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'The listing tool could not supply its staged image.');
  if(result.sha256!==code.sha256||result.bytes!==code.bytes||result.target?.rowId!==code.target.rowId||result.target?.field!==code.target.field)throw new Error('The image fingerprint or destination changed. No file was supplied.');
  return result;
}});
const listingRunner=new globalThis.BrowserTestMeeshoRunner({namespace:'listingMeesho',upload:input=>listingNative.upload(input)});
const claimsRunner=new globalThis.BrowserTestClaimsRunner();
async function exclusive(action){if(uploaderActive)throw new Error('An image upload is already running.');uploaderActive=true;try{return await action();}finally{uploaderActive=false;}}
chrome.action.onClicked.addListener(async tab => {
  if (!tab.id) return;
  await chrome.tabs.create({url:'http://127.0.0.1:4317/',active:true});
  return;
});

async function localApi(timeoutMs) {
  const { access = '' } = await chrome.storage.session.get('access');
  return new globalThis.BrowserTestApi({ extensionId: chrome.runtime.id, getToken: () => access, onSession: () => {},timeoutMs });
}
chrome.runtime.onMessageExternal.addListener((message, sender, respond) => {
  if (!Drive.trustedDashboard(sender.url) || message?.type !== 'connect-local-app' || !/^[A-Fa-f0-9]{8}$/.test(message.code || '')) {
    respond({ ok: false, error: 'Only the local dashboard may pair this extension.' }); return false;
  }
  (async () => {
    const api = await localApi();
    const result = await api.request('/api/pair', { code: message.code }, true);
    await chrome.storage.session.set({ access: result.token });
    await (await localApi()).request('/api/status');
    return { ok: true, extensionId: chrome.runtime.id, version: chrome.runtime.getManifest().version };
  })().then(respond).catch(error => respond({ ok: false, error: error.message }));
  return true;
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const listingOrigin=globalThis.BrowserTestListing.origin(sender.tab?.url);
  if(sender.id===chrome.runtime.id&&listingOrigin&&(!sender.frameId||sender.frameId===0)&&message?.type?.startsWith('claims-')){
    (async()=>{
      if(message.type==='claims-hello')return{ok:true,id:chrome.runtime.id,version:chrome.runtime.getManifest().version,claimsAutofill:true};
      if(message.type==='claims-prepare'){const job=await claimsRunner.prepare(message,listingOrigin,sender.tab.id);return{ok:true,operationId:job.operationId};}
      return{ok:true,...await claimsRunner.step(message,listingOrigin,sender.tab.id)};
    })().then(respond).catch(error=>respond({ok:false,error:error.message}));return true;
  }
  if(sender.id===chrome.runtime.id&&listingOrigin&&(!sender.frameId||sender.frameId===0)&&message?.type?.startsWith('listing-meesho-')){
    (async()=>{
      const L=globalThis.BrowserTestListing;
      if(message.type==='listing-meesho-hello')return{ok:true,id:chrome.runtime.id,version:chrome.runtime.getManifest().version,listingUpload:true,singleTabUploads:true,browserStaging:!!chrome.storage?.session?.set&&!!chrome.scripting?.executeScript,downloadFreeUploads:!!chrome.storage?.session?.set&&!!chrome.scripting?.executeScript};
      if(message.type==='listing-meesho-prepare'){
        if(!chrome.storage?.session?.set||!chrome.scripting?.executeScript)throw new Error('Reload Browser AI Test 0.10.0 and refresh the listing page to upload without downloading a copy.');
        return{ok:true,staged:await exclusive(()=>listingBrowserStage.prepare(message,listingOrigin))};
      }
      if(message.type==='listing-meesho-start'){
        if(message.listing?.origin!==listingOrigin)throw new Error('The upload belongs to a different listing app.');L.validate(message.listing,message.jobId);
        const existing=await listingRunner.get(message.jobId);if(existing&&existing.listing?.origin!==listingOrigin)throw new Error('This operation belongs to a different app.');
        return{ok:true,job:L.publicJob(await exclusive(async()=>{const job=await listingRunner.start(message,sender.tab.id);if(job.phase==='complete'&&job.listing?.mode==='browser')try{await listingBrowserStage.confirm(job.listing,job.id);}catch{}return job;}))};
      }
      const job=await listingRunner.get(message.jobId);if(!job||job.listing?.origin!==listingOrigin)throw new Error('No upload exists for this listing page.');
      if(message.type==='listing-meesho-status')return{ok:true,job:L.publicJob(job)};
      if(message.type==='listing-meesho-resume')return{ok:true,job:L.publicJob(await exclusive(async()=>{const resumed=await listingRunner.resume(message.jobId,sender.tab.id);if(resumed.phase==='complete'&&resumed.listing?.mode==='browser')try{await listingBrowserStage.confirm(resumed.listing,resumed.id);}catch{}return resumed;}))};
      throw new Error('Unsupported listing image operation.');
    })().then(respond).catch(error=>respond({ok:false,error:error.message}));return true;
  }
  let meeshoDashboard=false;try{const u=new URL(sender.tab?.url);meeshoDashboard=u.origin==='http://127.0.0.1:4317'&&u.pathname==='/meesho'&&!u.search&&!u.hash;}catch{}
  if(sender.id===chrome.runtime.id&&meeshoDashboard&&(!sender.frameId||sender.frameId===0)&&message?.type?.startsWith('meesho-')){
    (async()=>{
      if(message.type==='meesho-hello')return{ok:true,id:chrome.runtime.id,version:chrome.runtime.getManifest().version,meeshoUpload:true};
      if(message.type==='meesho-start')return{ok:true,job:await exclusive(()=>meeshoRunner.start(message,sender.tab.id))};
      if(message.type==='meesho-resume')return{ok:true,job:await exclusive(()=>meeshoRunner.resume(message.jobId,sender.tab.id,message.mirrorCode))};
      if(message.type==='meesho-status')return{ok:true,job:await meeshoRunner.get(message.jobId)};
      if(message.type==='meesho-history')return{ok:true,records:await meeshoRunner.list()};
      throw new Error('Unsupported Meesho test operation.');
    })().then(respond).catch(error=>respond({ok:false,error:error.message}));return true;
  }
  if(sender.id===chrome.runtime.id && Drive.trustedDashboard(sender.tab?.url) && (!sender.frameId || sender.frameId===0) && typeof message?.type==='string' && message.type.startsWith('uploader-')) {
    (async()=>{
      if(message.type==='uploader-hello')return{ok:true,id:chrome.runtime.id,version:chrome.runtime.getManifest().version,uploadMethod:'native-file-input',uploadControls:['keyboard','pointer']};
      if(message.type==='uploader-start')return{ok:true,job:await exclusive(()=>runner.start(message,sender.tab.id))};
      if(message.type==='uploader-resume')return{ok:true,job:await exclusive(()=>runner.resume(message.jobId,sender.tab.id,message.mirrorCode,message.controlMode))};
      if(message.type==='uploader-status')return{ok:true,job:await runner.get(message.jobId)};
      if(message.type==='uploader-history')return{ok:true,records:await runner.list()};
      throw new Error('Unsupported uploader operation.');
    })().then(respond).catch(error=>respond({ok:false,error:error.message}));
    return true;
  }
  if (sender.id !== chrome.runtime.id || !Drive.isDrive(sender.tab?.url) || (sender.frameId !== undefined && sender.frameId !== 0)) {
    respond({ ok: false, error: 'This action is limited to the selected Google Drive page.' }); return false;
  }
  (async () => {
    const api = await localApi();
    if (message?.type === 'drive-status') { await api.request('/api/status'); return { ok: true }; }
    if (message?.type === 'drive-sample') return { ok: true, file: await api.request('/api/sample-image') };
    if (message?.type === 'drive-upload') {
      if (!Drive.isMyDrive(sender.tab.url) || !/^browser-ai-drive-test-[a-z0-9.-]+\.(png|jpg|webp)$/i.test(message.file?.name || '')) throw new Error('Uploads are limited to this test image in My Drive.');
      Drive.decodeImage(message.file);
      const results = await chrome.scripting.executeScript({ target:{tabId:sender.tab.id},world:'MAIN',func:globalThis.browserTestDriveUpload,args:[message.file] });
      if (!results[0]?.result?.dispatched) throw new Error('Drive did not confirm dispatching the file. Inspect its upload status before trying again.');
      return {ok:true,upload:results[0].result};
    }
    if (message?.type === 'drive-save') {
      const input = message.record;
      const id = Drive.idFromLink(input?.imageUrls?.[0]);
      if (!id || input.imageUrls.length !== 1 || input.imageUrls[0] !== Drive.fileLink(id) || !Drive.isDrive(input.sourceUrl) || !/^browser-ai-drive-test-[a-z0-9.-]+\.(png|jpg|webp)$/i.test(input.filename || '')) throw new Error('Only this test image’s Drive viewing link can be saved.');
      return { ok: true, saved: await api.request('/api/records', input) };
    }
    throw new Error('Unsupported Drive test action.');
  })().then(respond).catch(error => respond({ ok: false, error: error.message }));
  return true;
});

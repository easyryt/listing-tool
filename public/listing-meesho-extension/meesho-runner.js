/* Serial selected images share one extension-owned Meesho tab. Never publishes a catalog. */
(() => {
  class BrowserTestMeeshoRunner {
    constructor({chromeApi=globalThis.chrome,upload,mirror=async()=>({saved:false}),delay=ms=>new Promise(r=>setTimeout(r,ms)),now=()=>Date.now(),namespace='meeshoUploader'}={}){Object.assign(this,{chrome:chromeApi,upload,mirror,delay,now});this.active=null;this.jobsKey=namespace+'Jobs';this.historyKey=namespace+'History';this.tabKey=namespace+'UploadTab';}
    async state(){const s=await this.chrome.storage.local.get([this.jobsKey,this.historyKey]);return{jobs:s[this.jobsKey]||{},records:s[this.historyKey]||[]};}
    async write(job){job.updatedAt=new Date(this.now()).toISOString();const s=await this.state();s.jobs[job.id]={...job};const done=Object.values(s.jobs).filter(j=>j.phase==='complete').sort((a,b)=>a.updatedAt.localeCompare(b.updatedAt));while(Object.keys(s.jobs).length>30&&done.length)delete s.jobs[done.shift().id];await this.chrome.storage.local.set({[this.jobsKey]:s.jobs});}
    async get(id){return(await this.state()).jobs[id]||null;}
    async list(){return(await this.state()).records;}
    async check(job){const tab=await this.chrome.tabs.get(job.tabId);if(!globalThis.BrowserTestMeesho.isUpload(tab.url)||tab.url!==job.sourceUrl||(tab.pendingUrl&&tab.pendingUrl!==job.sourceUrl))throw new Error('Keep the tab on its original Meesho Image Bulk Upload page.');return tab;}
    async script(job,func,args=[]){await this.check(job);return(await this.chrome.scripting.executeScript({target:{tabId:job.tabId},func,args}))[0]?.result;}
    async open(job){
      let saved=(await this.chrome.storage.local.get(this.tabKey))[this.tabKey];let tab,resetMarker='';
      if(!saved){const old=Object.values((await this.state()).jobs).filter(j=>j.id!==job.id&&j.phase==='complete'&&j.sourceUrl===job.sourceUrl&&j.tabId).sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''))[0];if(old)saved={tabId:old.tabId,sourceUrl:old.sourceUrl,jobId:old.id};}
      if(saved?.jobId&&saved.jobId!==job.id){const previous=await this.get(saved.jobId);if(previous?.uploadAttempted&&previous.phase!=='complete')throw new Error('The previous Meesho upload is still uncertain. Check its saved upload before reusing the tab. No new image was supplied.');}
      if(saved?.tabId){try{const found=await this.chrome.tabs.get(saved.tabId);if(globalThis.BrowserTestMeesho.isUpload(found.url)&&found.url===saved.sourceUrl&&found.url===job.sourceUrl)tab=found;}catch{}}
      if(tab){
        job.tabId=tab.id;await this.write(job);
        resetMarker=job.id;
        await this.script(job,function meeshoMarkBeforeReset(marker){document.documentElement.setAttribute('data-listing-meesho-reset',marker);},[resetMarker]);
        await this.chrome.tabs.update(tab.id,{active:true});
        if(tab.url===job.sourceUrl)await this.chrome.tabs.reload(tab.id);else await this.chrome.tabs.update(tab.id,{url:job.sourceUrl});
      }else{tab=await this.chrome.tabs.create({url:job.sourceUrl,active:true});job.tabId=tab.id;await this.write(job);}
      await this.chrome.storage.local.set({[this.tabKey]:{tabId:job.tabId,sourceUrl:job.sourceUrl,jobId:job.id}});
      const started=this.now();while(this.now()-started<30000){const t=await this.chrome.tabs.get(job.tabId);if(t.status==='complete'){
        if(!globalThis.BrowserTestMeesho.isUpload(t.url)||t.url!==job.sourceUrl)throw new Error('Sign in to the intended seller in the Meesho tab opened for this upload, then retry the saved image.');
        if(await this.script(job,function meeshoReady(marker){return!!document.querySelector('input#imageBulkUploadGetFile[type="file"]')&&(!marker||document.documentElement.getAttribute('data-listing-meesho-reset')!==marker);},[resetMarker]))return;
      }await this.delay(400);}throw new Error('Meesho’s upload page did not become ready.');
    }
    async send(job,file,code){job.phase='uploading-image';delete job.error;await this.write(job);
      const result=await this.upload({tabId:job.tabId,sourceUrl:job.sourceUrl,jobId:job.id,file,code,afterStaging:async()=>{job.staged=true;await this.write(job);},beforeDispatch:async()=>{await this.check(job);job.uploadAttempted=true;await this.write(job);}});
      if(!result?.dispatched)throw new Error('Chrome did not confirm supplying the selected image.');
    }
    async find(job){
      await this.check(job);await this.chrome.scripting.executeScript({target:{tabId:job.tabId},files:['meesho-core.js']});
      const started=this.now();
      while(this.now()-started<90000){
        const found=await this.script(job,function meeshoFind(name,expectedUrl){if(location.href!==expectedUrl)throw new Error('The Meesho seller page changed.');return globalThis.BrowserTestMeesho.findUploadedFile(document,name);},[job.remoteName,job.sourceUrl]);
        if(found&&globalThis.BrowserTestMeesho.imageLink(found.url))return found;
        if(!job.linkRequested){
          const ready=await this.script(job,function meeshoSelected(name){const input=document.querySelector('#imageBulkUploadGetFile');const button=[...document.querySelectorAll('button')].find(e=>e.getClientRects().length&&e.innerText.trim()==='Get Image Link');return input?.files?.length===1&&input.files[0].name===name&&!!button&&!button.disabled;},[job.remoteName]);
          if(ready){job.linkRequested=true;await this.write(job);await this.script(job,function meeshoGenerate(expectedUrl){if(location.href!==expectedUrl)throw new Error('The Meesho seller page changed.');const button=[...document.querySelectorAll('button')].find(e=>e.getClientRects().length&&e.innerText.trim()==='Get Image Link');if(!button||button.disabled)throw new Error('Meesho’s Get Image Link button is unavailable.');button.click();return true;},[job.sourceUrl]);}
        }
        const error=await this.script(job,function meeshoError(){return[...document.querySelectorAll('[role="alert"]')].filter(e=>e.getClientRects().length).map(e=>e.innerText.trim()).filter(Boolean).join(' ').slice(0,400);});
        if(error)throw new Error('Meesho reported: '+error);
        await this.delay(650);
      }
      throw new Error('Meesho has not confirmed this image link. Check its test tab, then use Check existing upload. No second copy will be uploaded.');
    }
    async finish(job,code){job.phase='finding-file';delete job.error;await this.write(job);const found=await this.find(job);job.url=found.url;job.phase='saving-local';await this.write(job);
      const state=await this.state();let record=state.records.find(r=>r.id===job.id)||{id:job.id,originalName:job.originalName,filename:job.remoteName,mime:job.mime,url:found.url,sourceUrl:job.sourceUrl,createdAt:new Date(this.now()).toISOString(),storage:'chrome.storage.local',copied:false,...(job.listing?{sha256:job.listing.sha256,target:job.listing.target}:{})};
      await this.chrome.storage.local.set({[this.historyKey]:[record,...state.records.filter(r=>r.id!==job.id)]});
      job.phase='copying-link';await this.write(job);
      try{record.copied=await this.script(job,async function meeshoCopy(url){await navigator.clipboard.writeText(url);return true;},[record.url])===true;}catch{record.copied=false;}
      try{record.mirror=await this.mirror(record,code);}catch(error){record.mirror={saved:false,error:error.message};}
      const latest=await this.state();await this.chrome.storage.local.set({[this.historyKey]:latest.records.map(r=>r.id===job.id?record:r)});
      job.phase='complete';job.record=record;await this.write(job);try{await this.chrome.tabs.update(job.callerTabId,{active:true});}catch{}return job;
    }
    async start(input,callerTabId){
      if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(input?.jobId||''))throw new Error('Invalid upload operation ID.');
      if(!globalThis.BrowserTestMeesho.isUpload(input.sourceUrl))throw new Error('Use your Meesho Image Bulk Upload page URL.');
      if(input.listing){globalThis.BrowserTestListing.validate(input.listing,input.jobId);input={...input,file:{name:input.listing.originalName,type:input.listing.type}};}
      else globalThis.BrowserTestDrive.decodeImage(input.file);
      globalThis.BrowserTestMeesho.uniqueName(input.file.type,new Date(this.now()).toISOString(),input.jobId);
      if(this.active)throw new Error('An upload is already running.');this.active=input.jobId;let job;
      try{const state=await this.state();if(state.jobs[input.jobId])return state.jobs[input.jobId];if(state.records.length>=500)throw new Error('Export your 500 saved test images before adding more.');
        job={id:input.jobId,phase:'opening-meesho',sourceUrl:input.sourceUrl,callerTabId,originalName:String(input.file.name||'image').replace(/[\x00-\x1f]/g,'').slice(0,150),remoteName:input.listing?.filename||globalThis.BrowserTestMeesho.uniqueName(input.file.type,new Date(this.now()).toISOString(),input.jobId),mime:input.file.type,uploadAttempted:false,linkRequested:false,...(input.listing?{listing:input.listing,staged:true}:{})};await this.write(job);await this.open(job);const code=input.listing||input.mirrorCode;await this.send(job,{...input.file,name:job.remoteName},code);return await this.finish(job,code);
      }catch(error){if(job){job.phase=job.uploadAttempted?'needs-resume':'failed-before-upload';job.error=error.message;await this.write(job);}throw error;}finally{this.active=null;}
    }
    async resume(id,callerTabId,code,selectPage){if(this.active)throw new Error('An upload is already running.');this.active=id;let job;
      try{job=await this.get(id);if(!job)throw new Error('No saved Meesho operation exists.');if(job.phase==='complete')return job;job.callerTabId=callerTabId;
        code=job.listing||code;
        if(!job.uploadAttempted){
          if(selectPage){const sourceUrl=await selectPage();if(sourceUrl!==job.sourceUrl){job.sourceUrl=sourceUrl;delete job.tabId;await this.write(job);}}
          await this.open(job);await this.send(job,{name:job.remoteName,type:job.mime},code);
        }else{try{await this.check(job);}catch{throw new Error('The original Meesho seller tab is unavailable. Upload status is uncertain; automatic re-upload is blocked.');}}
        return await this.finish(job,code);
      }catch(error){if(job){job.phase=job.uploadAttempted?'needs-resume':'failed-before-upload';job.error=error.message;await this.write(job);}throw error;}finally{this.active=null;}
    }
  }
  globalThis.BrowserTestMeeshoRunner=BrowserTestMeeshoRunner;
})();

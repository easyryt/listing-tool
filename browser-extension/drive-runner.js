/* A fixed, single-image browser workflow. Only Google Drive is a navigation target. */
(() => {
  class BrowserTestDriveRunner {
    constructor({ chromeApi = globalThis.chrome, delay = ms => new Promise(resolve=>setTimeout(resolve,ms)), now = () => Date.now(), mirror = async()=>({saved:false}), upload } = {}) {
      this.chrome = chromeApi; this.delay = delay; this.now = now; this.mirror = mirror; this.upload = upload; this.active = null;
    }
    async state() { const value = await this.chrome.storage.local.get(['driveUploaderJobs','driveUploaderHistory']); return { jobs:value.driveUploaderJobs || {}, records:value.driveUploaderHistory || [] }; }
    async writeJob(job) { job.updatedAt = new Date(this.now()).toISOString(); const state = await this.state(); state.jobs[job.id] = {...job}; const completed = Object.values(state.jobs).filter(value=>value.phase==='complete').sort((a,b)=>a.updatedAt.localeCompare(b.updatedAt)); while(Object.keys(state.jobs).length>30 && completed.length) delete state.jobs[completed.shift().id]; await this.chrome.storage.local.set({driveUploaderJobs:state.jobs}); }
    async get(id) { const {jobs} = await this.state(); return jobs[id] || null; }
    async list() { const {records} = await this.state(); return records; }
    async openDrive(job) {
      let tab;
      if(job.tabId) { try { tab=await this.chrome.tabs.get(job.tabId); } catch {} }
      if(!tab || !globalThis.BrowserTestDrive.isDrive(tab.url)) tab=await this.chrome.tabs.create({url:'https://drive.google.com/drive/my-drive',active:true});
      else await this.chrome.tabs.update(tab.id,{active:true});
      job.tabId=tab.id; await this.writeJob(job);
      const started=this.now();
      while(this.now()-started<25000) {
        tab=await this.chrome.tabs.get(job.tabId);
        if(tab.status==='complete') {
          if(!globalThis.BrowserTestDrive.isMyDrive(tab.url) && job.phase==='opening-drive') throw new Error('Sign in to your Google Drive in the opened tab, then choose the image again. No upload was started.');
          if(globalThis.BrowserTestDrive.isDrive(tab.url)) return tab;
        }
        await this.delay(300);
      }
      throw new Error('Drive did not finish loading. No automatic upload retry was made.');
    }
    async readyForUpload(tabId) {
      const started=this.now();
      while(this.now()-started<20000) {
        const result=await this.chrome.scripting.executeScript({target:{tabId},func:function driveReady(){ return [...document.querySelectorAll('button,[role="button"]')].some(el=>el.getClientRects().length && /^New$/i.test((el.getAttribute('aria-label') || el.innerText || el.textContent || '').trim())); }});
        if(result[0]?.result) return;
        await this.delay(350);
      }
      throw new Error('Drive’s upload controls were not ready. No upload was started.');
    }
    async find(job,{allowSearch=true}={}) {
      await this.chrome.scripting.executeScript({target:{tabId:job.tabId},files:['drive-core.js']});
      const started=this.now(); let searched=false;
      while(this.now()-started<90000) {
        const results=await this.chrome.scripting.executeScript({target:{tabId:job.tabId},func:function driveFind(filename){ return globalThis.BrowserTestDrive.findUploadedFile(document,filename); },args:[job.remoteName]});
        const found=results[0]?.result;
        if(found && globalThis.BrowserTestDrive.idFromLink(found.url)===found.id) return found;
        if(allowSearch && !searched && this.now()-started>8000) {
          searched=true;
          await this.chrome.scripting.executeScript({target:{tabId:job.tabId},func:function driveSearch(filename){
            const input=[...document.querySelectorAll('input')].find(el=>/search in drive/i.test(el.getAttribute('aria-label')||'') && el.getClientRects().length);
            const button=[...document.querySelectorAll('button,[role="button"]')].find(el=>/search google drive/i.test(el.getAttribute('aria-label')||'') && el.getClientRects().length);
            if(!input || !button) return false;
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,filename); input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true})); button.click(); return true;
          },args:[job.remoteName]});
        }
        await this.delay(700);
      }
      throw new Error('The upload result is uncertain. Use Find existing upload; the extension will not upload a second copy automatically.');
    }
    async finish(job,mirrorCode,allowSearch=true) {
      job.phase='finding-file'; await this.writeJob(job);
      const found=await this.find(job,{allowSearch});
      job.fileId=found.id; job.url=found.url; job.phase='saving-local'; await this.writeJob(job);
      const state=await this.state();
      let record=state.records.find(value=>value.id===job.id);
      if(!record) {
        record={id:job.id,originalName:job.originalName,filename:job.remoteName,mime:job.mime,url:found.url,fileId:found.id,createdAt:new Date(this.now()).toISOString(),sourceUrl:'https://drive.google.com/drive/my-drive',storage:'chrome.storage.local',copied:false};
        await this.chrome.storage.local.set({driveUploaderHistory:[record,...state.records]});
      }
      job.phase='copying-link'; await this.writeJob(job);
      try {
        const result=await this.chrome.scripting.executeScript({target:{tabId:job.tabId},func:async function driveCopy(url){ await navigator.clipboard.writeText(url); return true; },args:[found.url]});
        record={...record,copied:result[0]?.result===true};
      } catch { record={...record,copied:false}; }
      const current=await this.state(); await this.chrome.storage.local.set({driveUploaderHistory:current.records.map(value=>value.id===record.id?record:value)});
      if(mirrorCode) { try { record.mirror=await this.mirror(record,mirrorCode); } catch(error) { record.mirror={saved:false,error:error.message}; } }
      job.phase='complete'; job.record=record; delete job.error; await this.writeJob(job);
      try { await this.chrome.tabs.update(job.callerTabId,{active:true}); } catch {}
      return record;
    }
    async sendImage(job,file,code,controlMode='keyboard'){
      job.phase='uploading-image';delete job.error;await this.writeJob(job);
      if(!this.upload)throw new Error('The native Drive uploader is not configured. Reload Browser AI Test.');
      const result=await this.upload({tabId:job.tabId,jobId:job.id,file,code,controlMode,afterStaging:async()=>{job.staged=true;await this.writeJob(job);},beforeDispatch:async()=>{job.uploadAttempted=true;await this.writeJob(job);}});
      if(!result?.dispatched)throw new Error(result?.error||'Chrome did not supply the image to Drive.');
      job.uploadMethod=result.method;await this.writeJob(job);await this.finish(job,code,false);
    }
    async start(input,callerTabId) {
      const D=globalThis.BrowserTestDrive;
      if(!/^[a-f0-9-]{36}$/.test(input?.jobId || '')) throw new Error('Invalid upload operation ID.');
      D.decodeImage(input.file);
      if(this.active) throw new Error('An image upload is already running.');
      this.active=input.jobId;
      let job;
      try {
        const state=await this.state();
        if(state.jobs[input.jobId]) return state.jobs[input.jobId];
        if(state.records.length>=500) throw new Error('Local history has reached 500 images. Export it before starting more test uploads.');
        job={id:input.jobId,phase:'opening-drive',callerTabId,originalName:String(input.file.name||'image').slice(0,150),mime:input.file.type,remoteName:D.uniqueName(input.file.type,new Date(this.now()).toISOString(),input.jobId),uploadAttempted:false,startedAt:new Date(this.now()).toISOString()};
        await this.writeJob(job);
        await this.openDrive(job); await this.readyForUpload(job.tabId);
        const payload={...input.file,name:job.remoteName};
        await this.sendImage(job,payload,input.mirrorCode);return job;
      } catch(error) {
        if(job) { job.phase=job.uploadAttempted?'needs-resume':'failed-before-upload';job.error=error.message;try{await this.writeJob(job);}catch{} }
        throw error;
      } finally { this.active=null; }
    }
    async resume(id,callerTabId,mirrorCode,controlMode='keyboard') {
      if(!['keyboard','pointer'].includes(controlMode))throw new Error('Unsupported upload control method.');
      if(this.active) throw new Error('An upload is already running.');
      this.active=id; let job;
      try {
        job=await this.get(id);
        if(!job) throw new Error('No upload was found for this operation.');
        if(job.phase==='complete') return job;
        job.callerTabId=callerTabId;
        if(!job.uploadAttempted){job.phase='opening-drive';delete job.tabId;delete job.error;await this.writeJob(job);await this.openDrive(job);await this.readyForUpload(job.tabId);await this.sendImage(job,{name:job.remoteName,type:job.mime},mirrorCode,controlMode);}
        else{await this.openDrive(job);await this.finish(job,mirrorCode);}return job;
      } catch(error) { if(job){job.phase=job.uploadAttempted?'needs-resume':'failed-before-upload';job.error=error.message;try{await this.writeJob(job);}catch{}}throw error; }
      finally {this.active=null;}
    }
  }
  globalThis.BrowserTestDriveRunner=BrowserTestDriveRunner;
})();

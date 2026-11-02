/* Selected bytes are prepared by Chrome on this computer, never on the deployment host. */
(() => {
  const key='listingBrowserStages';
  const sameTarget=(a,b)=>!!a&&!!b&&a.rowId===b.rowId&&a.field===b.field;
  const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const descriptor=record=>Object.fromEntries(['id','origin','mode','filename','originalName','type','bytes','sha256','target','token'].map(field=>[field,record[field]]));
  class BrowserTestListingBrowserStage {
    constructor({chromeApi=globalThis.chrome,delay=ms=>new Promise(resolve=>setTimeout(resolve,ms)),now=()=>Date.now(),createBlob,releaseBlob}={}){Object.assign(this,{chrome:chromeApi,delay,now});this.busy=false;this.createBlob=createBlob||((file,id)=>this.blob(file,id));this.releaseBlob=releaseBlob||(()=>this.chrome.offscreen.closeDocument());}
    async blob(file,id){
      const url=this.chrome.runtime.getURL('listing-stage.html');
      const contexts=await this.chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT'],documentUrls:[url]});
      if(!contexts.length)await this.chrome.offscreen.createDocument({url:'listing-stage.html',reasons:['BLOBS'],justification:'Prepare only the selected product image as a local Blob for Chrome Downloads.'});
      const result=await this.chrome.runtime.sendMessage({target:'listing-stage-document',type:'listing-stage-create-blob',jobId:id,file});
      if(!result?.ok||typeof result.url!=='string'||!result.url.startsWith('blob:chrome-extension://'+this.chrome.runtime.id+'/'))throw new Error(result?.error||'Chrome could not prepare the image Blob.');
      return result.url;
    }
    async records(){return(await this.chrome.storage.local.get(key))[key]||{};}
    async write(record){const records=await this.records();await this.chrome.storage.local.set({[key]:{...records,[record.id]:record}});}
    async completed(record){
      if(!Number.isInteger(record.downloadId))throw new Error('Image preparation was interrupted before Chrome confirmed its local copy. Select it again; no Meesho upload was started.');
      const started=this.now();
      while(this.now()-started<45000){
        const [item]=await this.chrome.downloads.search({id:record.downloadId});
        if(!item||(item.state==='complete'&&item.exists===false))throw new Error('Chrome cannot find this prepared image. Select the image again.');
        if(item.state==='interrupted')throw new Error('Chrome interrupted image preparation. Select the image again; no second Meesho upload was sent.');
        if(item.danger&&!['safe','deepScannedSafe','allowlistedByPolicy'].includes(item.danger))throw new Error('Chrome blocked the image download. Review Chrome’s download warning yourself; no image was supplied to Meesho.');
        if(item.state==='complete'){
          const path=String(item.filename||'').replaceAll('\\','/');
          if(!path.endsWith('/listing-tool/meesho-staging/'+record.id+'/'+record.filename)||!(/^[A-Za-z]:\//.test(path)||path.startsWith('/'))||item.fileSize!==record.bytes)throw new Error('Chrome’s prepared file does not match this upload. No local path from the webpage is accepted.');
          return{path:item.filename,filename:record.filename,type:record.type,bytes:record.bytes,sha256:record.sha256,target:record.target};
        }
        await this.delay(300);
      }
      throw new Error('Chrome has not completed the local image copy. Select the image again after checking Downloads.');
    }
    async prepare(input,origin){
      if(this.busy)throw new Error('An image is already being prepared.');this.busy=true;let blobStarted=false;
      try{
        if(globalThis.BrowserTestListing.origin(origin)!==origin||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(input?.jobId||'')||!['image/png','image/jpeg'].includes(input.file?.type))throw new Error('Invalid selected image operation.');
        const bytes=globalThis.BrowserTestDrive.decodeImage(input.file),sha256=await digest(bytes);
        if(input.sha256!==sha256)throw new Error('The selected image fingerprint changed before preparation.');
        const target={rowId:input.target?.rowId,field:input.target?.field};
        const records=await this.records(),existing=records[input.jobId];
        if(existing){
          if(existing.origin!==origin||existing.sha256!==sha256||existing.type!==input.file.type||!sameTarget(existing.target,target))throw new Error('This operation is already bound to another image or destination.');
          await this.completed(existing);return descriptor(existing);
        }
        const completed=Object.values(records).filter(record=>record.complete).sort((a,b)=>a.filename.localeCompare(b.filename));
        let changed=false;
        while(completed.length&&(Object.keys(records).length>=250||Object.values(records).reduce((sum,r)=>sum+r.bytes,0)+bytes.length>100*1024*1024)){delete records[completed.shift().id];changed=true;}
        if(changed)await this.chrome.storage.local.set({[key]:records}); // Expire completed metadata only; never delete a file.
        if(Object.keys(records).length>=250||Object.values(records).reduce((sum,r)=>sum+r.bytes,0)+bytes.length>100*1024*1024)throw new Error('The extension image staging cache is full (250 images / 100 MB). Keep your originals and review the extension’s staging copies before starting another batch.');
        const token=[...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('');
        const record={id:input.jobId,origin,mode:'browser',token,sha256,bytes:bytes.length,type:input.file.type,target,
          originalName:String(input.file.name||'image').replace(/[\x00-\x1f\\/]/g,'_').slice(0,150),filename:globalThis.BrowserTestMeesho.uniqueName(input.file.type,new Date(this.now()).toISOString(),input.jobId)};
        globalThis.BrowserTestListing.validate(record,record.id);
        await this.write(record); // Persist the operation before starting any local download.
        blobStarted=true;const url=await this.createBlob(input.file,record.id);
        record.downloadId=await this.chrome.downloads.download({url,filename:'listing-tool/meesho-staging/'+record.id+'/'+record.filename,saveAs:false,conflictAction:'uniquify'});
        await this.write(record);await this.completed(record);return descriptor(record);
      }finally{if(blobStarted)try{await this.releaseBlob();}catch{}this.busy=false;}
    }
    async resolve(code,id){
      globalThis.BrowserTestListing.validate(code,id);
      const record=(await this.records())[id];
      if(code.mode!=='browser'||!record||record.origin!==code.origin||record.token!==code.token||record.sha256!==code.sha256||record.filename!==code.filename||record.bytes!==code.bytes||record.type!==code.type||!sameTarget(record.target,code.target))throw new Error('This prepared image does not match the authorized product and image slot.');
      return this.completed(record);
    }
    async confirm(code,id){
      const record=(await this.records())[id];
      if(record&&record.origin===code.origin&&record.token===code.token)await this.write({...record,complete:true});
    }
  }
  globalThis.BrowserTestListingBrowserStage=BrowserTestListingBrowserStage;
})();

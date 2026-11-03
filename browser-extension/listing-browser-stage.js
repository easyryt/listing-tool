/* Selected images stay in extension session memory. No download or local file is created. */
(() => {
  const key='listingBrowserStages',imageKey='listingSelectedImage';
  const sameTarget=(a,b)=>!!a&&!!b&&a.rowId===b.rowId&&a.field===b.field;
  const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const descriptor=record=>Object.fromEntries(['id','origin','mode','filename','originalName','type','bytes','sha256','target','token'].map(field=>[field,record[field]]));
  class BrowserTestListingBrowserStage {
    constructor({chromeApi=globalThis.chrome,now=()=>Date.now()}={}){Object.assign(this,{chrome:chromeApi,now});this.busy=false;}
    async records(){return(await this.chrome.storage.local.get(key))[key]||{};}
    async write(record){const records=await this.records();await this.chrome.storage.local.set({[key]:{...records,[record.id]:record}});}
    async hold(record,bytes){
      const previous=(await this.chrome.storage.session.get(imageKey))[imageKey];
      if(previous&&previous.id!==record.id){
        const jobs=(await this.chrome.storage.local.get('listingMeeshoJobs')).listingMeeshoJobs||{};
        if(jobs[previous.id]?.uploadAttempted&&jobs[previous.id].phase!=='complete')throw new Error('Check the previous saved upload before selecting another image.');
      }
      // A binary string fits a 4 MB image within Chrome's 10 MB session-memory limit.
      let binary='';for(let offset=0;offset<bytes.length;offset+=32768)binary+=String.fromCharCode(...bytes.subarray(offset,offset+32768));
      await this.chrome.storage.session.set({[imageKey]:{id:record.id,binary}});
    }
    async prepare(input,origin){
      if(this.busy)throw new Error('An image is already being prepared.');this.busy=true;
      try{
        if(globalThis.BrowserTestListing.origin(origin)!==origin||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(input?.jobId||'')||!['image/png','image/jpeg'].includes(input.file?.type))throw new Error('Invalid selected image operation.');
        const bytes=globalThis.BrowserTestDrive.decodeImage(input.file),sha256=await digest(bytes);
        if(input.sha256!==sha256)throw new Error('The selected image fingerprint changed before preparation.');
        const target={rowId:input.target?.rowId,field:input.target?.field},records=await this.records(),existing=records[input.jobId];
        if(existing){
          if(existing.origin!==origin||existing.sha256!==sha256||existing.type!==input.file.type||!sameTarget(existing.target,target))throw new Error('This operation is already bound to another image or destination.');
          if(existing.delivery!=='memory')throw new Error('Select this image again to use the upload without a downloaded copy.');
          if(!existing.complete)await this.hold(existing,bytes);
          return descriptor(existing);
        }
        const completed=Object.values(records).filter(record=>record.complete).sort((a,b)=>a.filename.localeCompare(b.filename));
        while(Object.keys(records).length>=250&&completed.length)delete records[completed.shift().id];
        if(Object.keys(records).length>=250)throw new Error('Finish the pending image uploads before starting another batch.');
        const token=[...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('');
        const record={id:input.jobId,origin,mode:'browser',delivery:'memory',token,sha256,bytes:bytes.length,type:input.file.type,target,
          originalName:String(input.file.name||'image').replace(/[\x00-\x1f\\/]/g,'_').slice(0,150),filename:globalThis.BrowserTestMeesho.uniqueName(input.file.type,new Date(this.now()).toISOString(),input.jobId)};
        globalThis.BrowserTestListing.validate(record,record.id);
        await this.hold(record,bytes);await this.chrome.storage.local.set({[key]:{...records,[record.id]:record}});return descriptor(record);
      }finally{this.busy=false;}
    }
    async resolve(code,id){
      globalThis.BrowserTestListing.validate(code,id);
      const record=(await this.records())[id];
      if(code.mode!=='browser'||!record||record.origin!==code.origin||record.token!==code.token||record.sha256!==code.sha256||record.filename!==code.filename||record.bytes!==code.bytes||record.type!==code.type||!sameTarget(record.target,code.target))throw new Error('This prepared image does not match the authorized product and image slot.');
      const image=(await this.chrome.storage.session.get(imageKey))[imageKey];
      if(record.delivery!=='memory'||image?.id!==id||typeof image.binary!=='string')throw new Error('The selected image is no longer in browser memory. Select it again; no image was downloaded.');
      const file={name:record.filename,type:record.type,base64:btoa(image.binary)},bytes=globalThis.BrowserTestDrive.decodeImage(file);
      if(bytes.length!==record.bytes||await digest(bytes)!==record.sha256)throw new Error('The selected image changed. No image was supplied to Meesho.');
      return{file,filename:record.filename,type:record.type,bytes:record.bytes,sha256:record.sha256,target:record.target};
    }
    async confirm(code,id){
      const record=(await this.records())[id];
      if(record&&record.origin===code.origin&&record.token===code.token){
        await this.write({...record,complete:true});
        if((await this.chrome.storage.session.get(imageKey))[imageKey]?.id===id)await this.chrome.storage.session.remove(imageKey);
      }
    }
  }
  globalThis.BrowserTestListingBrowserStage=BrowserTestListingBrowserStage;
})();

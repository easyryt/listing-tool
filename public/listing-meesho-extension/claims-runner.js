(() => {
  class BrowserTestClaimsRunner {
    constructor({chromeApi=globalThis.chrome,delay=ms=>new Promise(resolve=>setTimeout(resolve,ms)),now=()=>Date.now()}={}){Object.assign(this,{chrome:chromeApi,delay,now});this.busy=new Set();}
    async records(){return(await this.chrome.storage.local.get('listingClaimsJobs')).listingClaimsJobs||{};}
    async write(job){const jobs=await this.records();jobs[job.operationId]=job;const completed=Object.values(jobs).filter(item=>['review','attention'].includes(item.phase)).sort((a,b)=>a.updatedAt-b.updatedAt);while(Object.keys(jobs).length>20&&completed.length)delete jobs[completed.shift().operationId];await this.chrome.storage.local.set({listingClaimsJobs:jobs});}
    async job(id,origin,callerTabId){if(!globalThis.BrowserTestClaims.uuid(id))throw new Error('Invalid claim operation.');const job=(await this.records())[id];if(!job||job.origin!==origin||job.callerTabId!==callerTabId)throw new Error('This claim belongs to a different listing tab.');return job;}
    async script(job,action,data={}){
      const tab=await this.chrome.tabs.get(job.tabId);
      if(!globalThis.BrowserTestClaims.allowedPage(tab.url,globalThis.BrowserTestClaims.account(job.claim.claimsUrl)))throw new Error('Sign in to Meesho and keep the original claims form open.');
      const result=await this.chrome.scripting.executeScript({target:{tabId:job.tabId},world:'ISOLATED',func:globalThis.browserTestClaimsPage,args:[action,{...data,operationId:job.operationId,claim:job.claim}]});
      if(!result[0]?.result)throw new Error('Meesho did not confirm this claim step. Check its original form.');return result[0].result;
    }
    async prepare(message,origin,callerTabId){
      const C=globalThis.BrowserTestClaims;
      if(!C.uuid(message.operationId))throw new Error('Invalid claim operation.');const claim=C.validate(message.claim);
      if(this.busy.has(message.operationId))throw new Error('This claim is already being prepared.');this.busy.add(message.operationId);let job;
      try{
        const jobs=await this.records(),existing=jobs[message.operationId];
        if(existing){if(existing.origin!==origin||existing.callerTabId!==callerTabId||JSON.stringify(C.validate(existing.claim))!==JSON.stringify(claim))throw new Error('The saved claim operation does not match.');return existing;}
        const outstanding=Object.values(jobs).find(item=>item.origin===origin&&item.callerTabId===callerTabId&&['opening','prepared','transferring'].includes(item.phase));
        if(outstanding)throw new Error('Finish or check the original prepared claim before starting another.');
        const tab=await this.chrome.tabs.create({url:claim.claimsUrl,active:true});
        job={operationId:message.operationId,origin,callerTabId,tabId:tab.id,claim,phase:'opening',supplied:[],updatedAt:this.now()};await this.write(job);
        const started=this.now();while(this.now()-started<60000){
          const current=await this.chrome.tabs.get(job.tabId);
          if(current.status==='complete'){
            const result=await this.script(job,'advance');
            if(result.phase==='prepared'){job.phase='prepared';job.updatedAt=this.now();await this.write(job);return job;}
          }
          await this.delay(400);
        }
        throw new Error('Meesho’s claim form did not become ready. Check its tab, sign in if needed, and try again.');
      }catch(error){if(job){job.phase='attention';job.updatedAt=this.now();await this.write(job);}throw error;}finally{this.busy.delete(message.operationId);}
    }
    async step(message,origin,callerTabId){
      const job=await this.job(message.operationId,origin,callerTabId),type=message.type;
      if(type==='claims-focus'){await this.chrome.tabs.update(job.tabId,{active:true});return{operationId:job.operationId};}
      if(this.busy.has(job.operationId))throw new Error('Wait for the current claim step to finish.');this.busy.add(job.operationId);
      try{
        if(type==='claims-abort'){try{await this.script(job,'abort');}catch{}job.phase='attention';job.updatedAt=this.now();await this.write(job);return{operationId:job.operationId};}
        if(!['prepared','transferring'].includes(job.phase))throw new Error('This claim is already prepared or needs review. Open its original form.');
        const actions={'claims-file-begin':'file-begin','claims-file-chunk':'file-chunk','claims-file-finish':'file-finish','claims-finish':'finish'},action=actions[type];
        if(!action)throw new Error('Unsupported claim step.');
        if(action!=='finish'&&!job.claim.evidence.some(file=>file.role===message.role))throw new Error('That evidence was not selected for this claim.');
        if(action==='file-chunk'&&(!Number.isInteger(message.index)||message.index<0||typeof message.base64!=='string'||message.base64.length>699052))throw new Error('Invalid evidence chunk.');
        const result=await this.script(job,action,{role:message.role,index:message.index,base64:message.base64});
        if(action==='file-begin')job.phase='transferring';if(result.supplied)job.supplied=result.supplied;
        if(action==='finish'){job.phase='review';await this.chrome.tabs.update(job.tabId,{active:true});}
        job.updatedAt=this.now();if(action!=='file-chunk')await this.write(job);
        return{operationId:job.operationId,...(action==='finish'?{result:{operationId:job.operationId,draftId:job.claim.id,revision:job.claim.revision,phase:'review',supplied:job.supplied,submitted:false}}:{})};
      }catch(error){job.phase='attention';job.updatedAt=this.now();await this.write(job);try{await this.script(job,'abort');}catch{}throw error;}finally{this.busy.delete(job.operationId);}
    }
  }
  globalThis.BrowserTestClaimsRunner=BrowserTestClaimsRunner;
})();

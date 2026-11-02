/* Private packaged Blob helper. Only the extension service worker may call it. */
(() => {
  const urls=new Map();
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(message?.target!=='listing-stage-document'||message.type!=='listing-stage-create-blob'||sender.id!==chrome.runtime.id||sender.tab)return false;
    try{
      if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(message.jobId||'')||!['image/png','image/jpeg'].includes(message.file?.type))throw new Error('Invalid selected image Blob.');
      if(urls.size&&!urls.has(message.jobId))throw new Error('Another selected image is still being prepared.');
      const bytes=globalThis.BrowserTestDrive.decodeImage(message.file);
      if(!urls.has(message.jobId))urls.set(message.jobId,URL.createObjectURL(new Blob([bytes],{type:message.file.type})));
      respond({ok:true,url:urls.get(message.jobId)});
    }catch(error){respond({ok:false,error:error.message});}
    return false;
  });
})();

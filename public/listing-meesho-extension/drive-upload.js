/* Fixed Drive upload adapter. Uses shared DOM events from the extension's isolated world. */
(() => {
  if(typeof document!=='undefined') document.documentElement.setAttribute('data-browser-ai-upload-stage','adapter-loaded');
  globalThis.browserTestDriveUpload = async function browserTestDriveUpload(file) {
    const report = stage => document.documentElement.setAttribute('data-browser-ai-upload-stage',stage);
    try {
      report('validating-image');
      if(location.origin!=='https://drive.google.com'||!/^\/drive\/(?:u\/\d+\/)?my-drive\/?$/.test(location.pathname)) throw new Error('Open My Drive before uploading.');
      if(!file||!/^browser-ai-drive-test-[a-z0-9.-]+\.(png|jpg|webp)$/i.test(file.name)||!['image/png','image/jpeg','image/webp'].includes(file.type)||typeof file.base64!=='string'||file.base64.length>5592408) throw new Error('Unsupported approved test image.');
      const bytes=Uint8Array.from(atob(file.base64),value=>value.charCodeAt(0));
      if(!bytes.length||bytes.length>4194304) throw new Error('Choose an image up to 4 MB.');
      const visible=el=>el.isConnected&&el.getClientRects().length>0;
      const target=[...document.querySelectorAll('[role="main"] [role="grid"],[role="grid"],[role="main"]')].find(visible);
      if(!target) throw new Error('Drive’s file area is not ready. No image was dispatched.');
      const transfer=new DataTransfer();
      transfer.items.add(new File([bytes],file.name,{type:file.type}));
      report('dispatching-image');
      for(const type of ['dragenter','dragover','drop']) target.dispatchEvent(new DragEvent(type,{bubbles:true,cancelable:true,composed:true,dataTransfer:transfer}));
      report('image-dispatched');
      // Dispatch is not an upload-success claim. The runner still requires this
      // exact unique filename and its Drive file ID before saving a link.
      return {dispatched:true,filename:file.name,method:'drive-drop'};
    } catch(error) {report('error: '+String(error.message||error).slice(0,220));throw error;}
  };
})();

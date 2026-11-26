/* Supplies only the approved staged image to Meesho's observed file input. */
(() => {
  class BrowserTestMeeshoNative {
    constructor({chromeApi=globalThis.chrome,stage}={}){this.chrome=chromeApi;this.stage=stage;}
    async upload({tabId,sourceUrl,jobId,file,code,beforeDispatch=async()=>{},afterStaging=async()=>{}}){
      const chrome=this.chrome,target={tabId};let attached=false;
      const check=async()=>{const tab=await chrome.tabs.get(tabId);if(!globalThis.BrowserTestMeesho.isUpload(tab.url)||tab.url!==sourceUrl||(tab.pendingUrl&&tab.pendingUrl!==sourceUrl))throw new Error('The tab left the selected Meesho seller’s upload page.');};
      const command=async(method,params={})=>{await check();return chrome.debugger.sendCommand(target,method,params);};
      try{
        await check();if(!['image/png','image/jpeg'].includes(file?.type))throw new Error('Choose a PNG or JPG image.');if(file.base64!==undefined)globalThis.BrowserTestDrive.decodeImage(file);
        const staged=await this.stage({jobId,file,code});
        if(staged.file){
          const bytes=globalThis.BrowserTestDrive.decodeImage(staged.file);
          if(code?.mode!=='browser'||staged.filename!==file.name||staged.type!==file.type||staged.file.name!==file.name||staged.file.type!==file.type||bytes.length!==code.bytes||staged.sha256!==code.sha256)throw new Error('The selected image does not match this upload.');
          await afterStaging();await check();await beforeDispatch();
          const results=await chrome.scripting.executeScript({target,world:'ISOLATED',func:async function meeshoSupplySelectedImage(selected,expected){
            const page=new URL(location.href);
            if(page.href!==expected.sourceUrl)throw new Error('The tab left the selected Meesho seller’s upload page.');
            const input=document.querySelector('input#imageBulkUploadGetFile[type="file"]');
            if(!input||input.disabled||input.hasAttribute('webkitdirectory'))throw new Error('Meesho’s image picker is unavailable.');
            const data=Uint8Array.from(atob(selected.base64),value=>value.charCodeAt(0));
            const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(b=>b.toString(16).padStart(2,'0')).join('');
            if(data.length!==expected.bytes||hash!==expected.sha256)throw new Error('The selected image changed before delivery.');
            if(location.href!==page.href||!input.isConnected||input.disabled)throw new Error('Meesho’s image picker changed before delivery.');
            const image=new File([data],selected.name,{type:selected.type}),transfer=new DataTransfer();transfer.items.add(image);
            input.files=transfer.files;
            if(input.files.length!==1||input.files[0].name!==selected.name||input.files[0].size!==data.length)throw new Error('Meesho did not accept the selected image.');
            input.dispatchEvent(new Event('input',{bubbles:true,composed:true}));
            input.dispatchEvent(new Event('change',{bubbles:true,composed:true}));
            return{dispatched:true,method:'memory-file-input'};
          },args:[staged.file,{bytes:code.bytes,sha256:code.sha256,sourceUrl}]});
          if(!results[0]?.result?.dispatched)throw new Error('Meesho did not confirm receiving this selected image.');
          return results[0].result;
        }
        const path=String(staged.path||'').replaceAll('\\','/');
        if(staged.filename!==file.name||staged.type!==file.type||!path.endsWith('/meesho-staging/'+jobId+'/'+file.name)||!(/^[A-Za-z]:\//.test(path)||path.startsWith('/')))throw new Error('Invalid staged Meesho image path.');
        await afterStaging();await check();
        try{await chrome.debugger.attach(target,'1.3');attached=true;}catch{throw new Error('Another controller is using the new Meesho tab. Close its DevTools, then retry the saved image.');}
        await command('Page.bringToFront');
        const root=await command('DOM.getDocument',{depth:0});
        const result=await command('DOM.querySelector',{nodeId:root.root.nodeId,selector:'input#imageBulkUploadGetFile[type="file"]'});
        if(!result.nodeId)throw new Error('Meesho’s image picker was not found.');
        const {node}=await command('DOM.describeNode',{nodeId:result.nodeId,depth:0});const attrs={};for(let i=0;i<(node.attributes||[]).length;i+=2)attrs[node.attributes[i]]=node.attributes[i+1];
        if(node.localName!=='input'||attrs.id!=='imageBulkUploadGetFile'||attrs.type!=='file'||Object.hasOwn(attrs,'webkitdirectory')||Object.hasOwn(attrs,'disabled'))throw new Error('Meesho’s image picker is unavailable.');
        await check();await beforeDispatch();await command('DOM.setFileInputFiles',{nodeId:result.nodeId,files:[staged.path]});
        return{dispatched:true,method:'native-file-input'};
      }finally{if(attached)try{await chrome.debugger.detach(target);}catch{}}
    }
  }
  globalThis.BrowserTestMeeshoNative=BrowserTestMeeshoNative;
})();

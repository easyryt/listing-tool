/* Supplies only the approved staged image to Meesho's observed file input. */
(() => {
  class BrowserTestMeeshoNative {
    constructor({chromeApi=globalThis.chrome,stage}={}){this.chrome=chromeApi;this.stage=stage;}
    async upload({tabId,jobId,file,code,beforeDispatch=async()=>{},afterStaging=async()=>{}}){
      const chrome=this.chrome,target={tabId};let attached=false;
      const check=async()=>{if(!globalThis.BrowserTestMeesho.isUpload((await chrome.tabs.get(tabId)).url))throw new Error('The tab left Meesho Image Bulk Upload. No image was supplied.');};
      const command=async(method,params={})=>{await check();return chrome.debugger.sendCommand(target,method,params);};
      try{
        await check();if(!['image/png','image/jpeg'].includes(file?.type))throw new Error('Choose a PNG or JPG image.');if(file.base64!==undefined)globalThis.BrowserTestDrive.decodeImage(file);
        const staged=await this.stage({jobId,file,code}),path=String(staged.path||'').replaceAll('\\','/');
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

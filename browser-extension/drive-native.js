/* One native file-picker operation on this tool's new My Drive tab. No arbitrary CDP input. */
(() => {
  class BrowserTestDriveNative {
    constructor({chromeApi=globalThis.chrome,stage,delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){this.chrome=chromeApi;this.stage=stage;this.delay=delay;}
    async upload({tabId,jobId,file,code,controlMode='keyboard',beforeDispatch=async()=>{},afterStaging=async()=>{}}){
      const chrome=this.chrome,target={tabId};let attached=false,intercepted=false,altHeld=false,timer,listener,waiter;
      const check=async()=>{if(!globalThis.BrowserTestDrive.isMyDrive((await chrome.tabs.get(tabId)).url))throw new Error('The upload tab left My Drive. No more browser commands will run.');};
      const command=async(method,params={})=>{await check();return chrome.debugger.sendCommand(target,method,params);};
      const click=async point=>{await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y,buttons:0,pointerType:'mouse'});for(const type of ['mousePressed','mouseReleased'])await command('Input.dispatchMouseEvent',{type,x:point.x,y:point.y,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1,pointerType:'mouse'});};
      try {
        if(!['keyboard','pointer'].includes(controlMode))throw new Error('Unsupported native upload control method.');
        await check();if(file?.base64!==undefined)globalThis.BrowserTestDrive.decodeImage(file);else if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('No approved staged image is available. Choose an image again.');
        if(!chrome.debugger?.attach)throw new Error('Native upload needs Chrome’s debugger permission. Reload Browser AI Test 0.5.2 and approve its permission request.');
        const staged=await this.stage({jobId,file,code});
        const normalized=String(staged.path||'').replaceAll('\\','/');
        if(staged.filename!==file.name||staged.type!==file.type||!normalized.endsWith('/drive-staging/'+jobId+'/'+file.name)||!(/^[A-Za-z]:\//.test(normalized)||normalized.startsWith('/')))throw new Error('The local server returned an invalid staged-image path.');
        await afterStaging();
        await check();
        try{await chrome.debugger.attach(target,'1.3');attached=true;}catch(error){throw new Error('Chrome could not start native upload on its new Drive tab. Close DevTools or another controller on that tab, then try again. '+error.message);}
        await command('Page.enable');
        await command('Page.bringToFront');
        const tree=await command('Page.getFrameTree');const mainFrame=tree.frameTree?.frame?.id;
        if(!mainFrame)throw new Error('Chrome did not identify the Drive upload frame.');
        waiter=new Promise((resolve,reject)=>{
          listener=(source,method,params)=>{if(source.tabId===tabId&&method==='Page.fileChooserOpened'&&params.frameId===mainFrame){if(!Number.isInteger(params.backendNodeId))reject(new Error('Drive did not expose a native file input. No file was supplied.'));else resolve(params.backendNodeId);}};
          chrome.debugger.onEvent.addListener(listener);
          timer=setTimeout(()=>reject(new Error('Drive did not open its native file picker. No file was supplied.')),15000);
        });
        waiter.catch(()=>{});
        await command('Page.setInterceptFileChooserDialog',{enabled:true});intercepted=true;
        const point=async kind=>{
          for(let attempt=0;attempt<30;attempt++){
            await check();
            const results=await chrome.scripting.executeScript({target:{tabId},func:function driveUploadPoint(kind){
              const selector=kind==='new'?'button,[role="button"]':'[role="menuitem"]';
              const node=[...document.querySelectorAll(selector)].find(el=>el.getClientRects().length&&(kind==='new'?/^New$/i:/^(File upload|Upload file)(?=\s|Alt|$)/i).test((el.getAttribute('aria-label')||el.innerText||el.textContent||'').replace(/\s+/g,' ').trim()));
              if(!node)return null;const rect=node.getBoundingClientRect();return{x:rect.x+rect.width/2,y:rect.y+rect.height/2};
            },args:[kind]});
            const value=results[0]?.result;if(value&&Number.isFinite(value.x)&&Number.isFinite(value.y))return value;
            await this.delay(100);
          }
          throw new Error('Drive’s '+(kind==='new'?'New button':'File upload menu')+' is not ready. No file was supplied.');
        };
        if(controlMode==='keyboard'){
          await check();await chrome.scripting.executeScript({target:{tabId},func:function driveFocusForUpload(){const button=[...document.querySelectorAll('button,[role="button"]')].find(el=>el.getClientRects().length&&/^New$/i.test((el.getAttribute('aria-label')||el.innerText||el.textContent||'').trim()));button?.focus();}});
          const key=async(type,key,code,windowsVirtualKeyCode,modifiers=0,text)=>command('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode,nativeVirtualKeyCode:windowsVirtualKeyCode,modifiers,...(text?{text,unmodifiedText:text}:{})});
          // Drive's documented two-part shortcut: Alt+C, then U. Keep the
          // sequence together; Alt+C is a prefix, not a visible menu command.
          altHeld=true;await key('rawKeyDown','Alt','AltLeft',18,1);
          await key('rawKeyDown','c','KeyC',67,1);await key('keyUp','c','KeyC',67,1);
          await key('keyUp','Alt','AltLeft',18);altHeld=false;
          await key('keyDown','u','KeyU',85,0,'u');await key('keyUp','u','KeyU',85);
        }else{await click(await point('new'));await click(await point('file'));}
        const backendNodeId=await waiter;
        const description=await command('DOM.describeNode',{backendNodeId,depth:0});
        const node=description.node,attributes=node?.attributes||[];const attrs={};for(let index=0;index<attributes.length;index+=2)attrs[attributes[index]]=attributes[index+1];
        if(String(node?.localName).toLowerCase()!=='input'||attrs.type!=='file'||Object.hasOwn(attrs,'webkitdirectory'))throw new Error('Drive requested an unsupported picker. No image was supplied.');
        await check();await beforeDispatch();
        await command('DOM.setFileInputFiles',{backendNodeId,files:[staged.path]});
        return{dispatched:true,filename:file.name,method:'native-file-input'};
      } finally {
        clearTimeout(timer);if(listener)chrome.debugger.onEvent.removeListener(listener);
        if(attached){if(altHeld){try{await chrome.debugger.sendCommand(target,'Input.dispatchKeyEvent',{type:'keyUp',key:'Alt',code:'AltLeft',windowsVirtualKeyCode:18,modifiers:0});}catch{}}if(intercepted){try{await chrome.debugger.sendCommand(target,'Page.setInterceptFileChooserDialog',{enabled:false});}catch{}}try{await chrome.debugger.detach(target);}catch{}}
      }
    }
  }
  globalThis.BrowserTestDriveNative=BrowserTestDriveNative;
})();

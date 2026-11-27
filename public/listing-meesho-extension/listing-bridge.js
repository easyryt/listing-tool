/* Listing pages can request only the selected-image Meesho workflow. */
(() => {
  if(!['http://localhost:3000','http://127.0.0.1:3000','https://listing-tool-three.vercel.app'].includes(location.origin)||window.top!==window)return;
  const extensionId=chrome.runtime.id;
  if(!extensionId)return;
  const allowed=new Set(['listing-meesho-hello','listing-meesho-account','listing-meesho-prepare','listing-meesho-start','listing-meesho-status','listing-meesho-resume']);
  const handleRequest=event=>{
    if(typeof event.detail!=='string'||event.detail.length>5650000)return;let message;try{message=JSON.parse(event.detail);}catch{return;}
    if(!message||!allowed.has(message.type)||!/^[a-f0-9-]{36}$/.test(message.requestId||'')||(message.extensionId&&message.extensionId!==extensionId))return;
    if(message.type!=='listing-meesho-prepare'&&event.detail.length>14000)return;
    const reply=result=>document.dispatchEvent(new CustomEvent('listing-meesho-response',{detail:JSON.stringify({...result,requestId:message.requestId,extensionId})}));
    try{
      if(chrome.runtime?.id!==extensionId)return;
      chrome.runtime.sendMessage(message,response=>reply(chrome.runtime.lastError||!response?{ok:false,error:'Chrome lost the extension connection. Recheck the connection before uploading.'}:response));
    }catch{reply({ok:false,error:'Chrome lost the extension connection. Recheck the connection before uploading.'});}
  };
  for(const type of ['listing-meesho-request','listing-meesho-routed-request']){
    if(globalThis.listingMeeshoRequestHandler)document.removeEventListener(type,globalThis.listingMeeshoRequestHandler);
    document.addEventListener(type,handleRequest);
  }
  globalThis.listingMeeshoRequestHandler=handleRequest;
  document.dispatchEvent(new CustomEvent('listing-meesho-bridge-ready'));
})();

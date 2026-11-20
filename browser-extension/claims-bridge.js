/* Claims-only messages from the top-level listing app. Evidence is sent in bounded chunks. */
(() => {
  if(!['http://localhost:3000','http://127.0.0.1:3000','https://listing-tool-three.vercel.app'].includes(location.origin)||window.top!==window)return;
  const allowed=new Set(['claims-hello','claims-prepare','claims-file-begin','claims-file-chunk','claims-file-finish','claims-finish','claims-focus','claims-abort']);
  document.addEventListener('listing-claims-request',event=>{
    if(typeof event.detail!=='string'||event.detail.length>710000)return;
    let message;try{message=JSON.parse(event.detail);}catch{return;}
    if(!allowed.has(message.type)||!/^[a-f0-9-]{36}$/.test(message.requestId||'')||message.type!=='claims-file-chunk'&&event.detail.length>18000)return;
    const reply=result=>document.dispatchEvent(new CustomEvent('listing-claims-response',{detail:JSON.stringify({requestId:message.requestId,...result})}));
    try{chrome.runtime.sendMessage(message,response=>reply(chrome.runtime.lastError?{ok:false,error:'The extension reloaded. Refresh and check the original claim form.'}:response));}catch{reply({ok:false,error:'Reload the claims extension and refresh the listing page.'});}
  });
})();

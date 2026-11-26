/* Listing pages can request only the selected-image Meesho workflow. */
(() => {
  if(!['http://localhost:3000','http://127.0.0.1:3000','https://listing-tool-three.vercel.app'].includes(location.origin)||window.top!==window)return;
  const allowed=new Set(['listing-meesho-hello','listing-meesho-account','listing-meesho-prepare','listing-meesho-start','listing-meesho-status','listing-meesho-resume']);
  document.addEventListener('listing-meesho-request',event=>{
    if(typeof event.detail!=='string'||event.detail.length>5650000)return;let message;try{message=JSON.parse(event.detail);}catch{return;}
    if(!allowed.has(message.type)||!/^[a-f0-9-]{36}$/.test(message.requestId||''))return;
    if(message.type!=='listing-meesho-prepare'&&event.detail.length>14000)return;
    const reply=result=>document.dispatchEvent(new CustomEvent('listing-meesho-response',{detail:JSON.stringify({requestId:message.requestId,...result})}));
    try{chrome.runtime.sendMessage(message,response=>reply(chrome.runtime.lastError?{ok:false,error:'The extension reloaded. Refresh the listing page, then check the saved upload.'}:response));}catch{reply({ok:false,error:'Reload the extension and refresh the listing page.'});}
  });
})();

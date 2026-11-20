/* Local app bridge: fixed Drive upload operations only, never arbitrary Chrome commands. */
(() => {
  if(location.origin!=='http://127.0.0.1:4317' || !['/','/meesho'].includes(location.pathname) || window.top!==window) return;
  const allowed=new Set(location.pathname==='/meesho'?['meesho-hello','meesho-start','meesho-status','meesho-resume','meesho-history']:['uploader-hello','uploader-start','uploader-status','uploader-resume','uploader-history']);
  document.addEventListener('browser-ai-drive-request',event=>{
    if(typeof event.detail!=='string' || event.detail.length>5700000) return;
    let message;try{message=JSON.parse(event.detail);}catch{return;}
    if(!allowed.has(message.type) || !/^[a-f0-9-]{36}$/.test(message.requestId||'')) return;
    const reply=result=>document.dispatchEvent(new CustomEvent('browser-ai-drive-response',{detail:JSON.stringify({requestId:message.requestId,...result})}));
    try { chrome.runtime.sendMessage(message,response=>{
      reply(chrome.runtime.lastError?{ok:false,error:'The extension reloaded. Refresh this page and check the upload status before retrying.'}:response);
    }); } catch { reply({ok:false,error:'The extension reloaded. Refresh this page before continuing.'}); }
  });
  const ready=()=>{document.documentElement.setAttribute('data-browser-ai-drive-version',chrome.runtime.getManifest().version);document.dispatchEvent(new CustomEvent('browser-ai-drive-ready'));};
  if(document.documentElement) ready();else document.addEventListener('DOMContentLoaded',ready,{once:true});
})();

(() => {
  const origins=['http://localhost:3000','http://127.0.0.1:3000'];
  function origin(value){try{const u=new URL(value);return origins.includes(u.origin)&&!u.username&&!u.password?u.origin:null;}catch{return null;}}
  function validate(value,id){
    if(!value||!origins.includes(value.origin)||!/^[a-f0-9]{64}$/.test(value.token||'')||!/^[a-f0-9]{64}$/.test(value.sha256||'')||!['image/png','image/jpeg'].includes(value.type)||!Number.isInteger(value.bytes)||value.bytes<1||value.bytes>4194304)throw new Error('Invalid selected-image authorization. Choose the image again in the listing tool.');
    const t=value.target;if(!t||typeof t.rowId!=='string'||!t.rowId||t.rowId.length>200||/[\x00-\x1f]/.test(t.rowId)||!['image1','image2','image3','image4'].includes(t.field))throw new Error('Invalid product image destination.');
    if(!/^browser-ai-meesho-test-\d{14}-[a-f0-9]{8}\.(png|jpg)$/.test(value.filename||'')||!value.filename.endsWith('-'+id.slice(0,8)+(value.type==='image/png'?'.png':'.jpg')))throw new Error('The staged filename does not belong to this upload.');
    return value;
  }
  function publicJob(job){if(!job)return null;const{listing,...safe}=job;void listing;return safe;}
  globalThis.BrowserTestListing={origin,validate,publicJob};
})();

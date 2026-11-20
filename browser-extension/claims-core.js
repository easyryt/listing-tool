/* Fixed claims workflow boundaries. Never accepts arbitrary selectors, scripts or submit commands. */
(() => {
  const issues={wrong_return:'I have received wrong return',damaged_return:'I have received damaged return',missing_items:'Item/s are missing in my return',used_return:'I have received used product as return'};
  const roles=['video','product','waybill','barcode'],uuid=value=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value||'');
  function account(value){try{const u=new URL(value);return u.origin==='https://supplier.meesho.com'&&!u.username&&!u.password&&!u.search&&!u.hash?u.pathname.match(/^\/panel\/v3\/new\/fulfillment\/([\w-]+)\/claims$/)?.[1]||null:null;}catch{return null;}}
  function allowedPage(value,owner){try{const u=new URL(value);return u.origin==='https://supplier.meesho.com'&&!u.username&&!u.password&&!u.search&&!u.hash&&new RegExp('^/panel/v3/new/(?:fulfillment/'+owner+'/claims|experience/'+owner+'/support/1(?:/\\d+(?:/create)?)?)$').test(u.pathname);}catch{return false;}}
  function validate(value){
    if(!value||!uuid(value.id)||!Number.isInteger(value.revision)||value.revision<1||!account(value.claimsUrl)||!Object.hasOwn(issues,value.issue)||!['Intact','Tampered'].includes(value.condition))throw new Error('Invalid saved claim. Save the draft again before autofill.');
    for(const key of ['subOrderNumber','awbNumber','packetId'])if(typeof value[key]!=='string'||!value[key].trim()||value[key].length>100||/[\x00-\x1f]/.test(value[key]))throw new Error('Add the correct sub-order, AWB and Packet ID before autofill.');
    if(typeof value.description!=='string'||!value.description.trim()||value.description.length>1000||typeof value.callbackNumber!=='string'||value.callbackNumber&&!/^\d{10}$/.test(value.callbackNumber))throw new Error('Check the claim description and callback number.');
    if(!Array.isArray(value.evidence)||value.evidence.length<3||value.evidence.length>4)throw new Error('Select the original video, product photo and reverse waybill.');
    const used=new Set(),ids=new Set();
    const evidence=value.evidence.map(file=>{
      if(!file||!roles.includes(file.role)||used.has(file.role)||!uuid(file.id)||ids.has(file.id)||typeof file.name!=='string'||!file.name||file.name.length>150||/[\x00-\x1f\\/]/.test(file.name)||!/^[a-f0-9]{64}$/.test(file.sha256)||!Number.isInteger(file.bytes)||file.bytes<1||file.bytes>(file.role==='video'?100:10)*1024*1024)throw new Error('Invalid or duplicate claim evidence.');
      if(file.role==='video'?file.type!=='video/mp4'||!/\.mp4$/i.test(file.name):!['image/png','image/jpeg'].includes(file.type))throw new Error('Use an original MP4 video and PNG/JPG photos.');
      used.add(file.role);ids.add(file.id);return{id:file.id,role:file.role,name:file.name,type:file.type,bytes:file.bytes,sha256:file.sha256};
    });
    if(!['video','product','waybill'].every(role=>used.has(role)))throw new Error('Add all required evidence before autofill.');
    return{id:value.id,revision:value.revision,claimsUrl:value.claimsUrl,issue:value.issue,subOrderNumber:value.subOrderNumber.trim(),awbNumber:value.awbNumber.trim(),packetId:value.packetId.trim(),condition:value.condition,description:value.description.trim(),callbackNumber:value.callbackNumber,evidence};
  }
  globalThis.BrowserTestClaims={issues,roles,uuid,account,allowedPage,validate};
})();

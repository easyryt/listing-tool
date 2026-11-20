/* Runs only in the extension's isolated world on an owned Meesho claims/support tab. */
globalThis.browserTestClaimsPage=async function browserTestClaimsPage(action,data){
  const claim=data.claim,owner=new URL(claim.claimsUrl).pathname.split('/')[5];
  const page=new URL(location.href),prefix='/panel/v3/new/experience/'+owner+'/support/1';
  if(window.top!==window||page.origin!=='https://supplier.meesho.com'||page.username||page.password||page.search||page.hash||!(page.pathname===new URL(claim.claimsUrl).pathname||new RegExp('^'+prefix+'(?:/\\d+(?:/create)?)?$').test(page.pathname)))throw new Error('Keep the prepared tab on its original Meesho claims page.');
  const issues={wrong_return:'I have received wrong return',damaged_return:'I have received damaged return',missing_items:'Item/s are missing in my return',used_return:'I have received used product as return'};
  const issue=issues[claim.issue],text=el=>(el?.textContent||'').replace(/\*/g,'').replace(/\s+/g,' ').trim(),visible=el=>el.isConnected&&el.getClientRects().length>0;
  if(!issue)throw new Error('Unsupported return issue.');
  const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
  const snapshot=JSON.stringify(stable(claim));
  let state=globalThis.__listingClaimForm;
  if(action==='advance'&&(!state||state.operationId!==data.operationId))state=globalThis.__listingClaimForm={operationId:data.operationId,snapshot,clicked:{},supplied:{}};
  if(!state||state.operationId!==data.operationId||state.snapshot!==snapshot)throw new Error('This claim form reloaded or changed. Check it before starting another autofill attempt.');
  const unique=(items,message)=>{if(items.length!==1)throw new Error(message);return items[0];};
  const label=name=>unique([...document.querySelectorAll('label')].filter(el=>text(el)===name),'Meesho’s '+name+' field changed. Fill it manually.');
  const field=name=>{const node=document.getElementById(label(name).htmlFor);if(!node||node.disabled||node.readOnly)throw new Error('Meesho’s '+name+' field is unavailable.');return node;};
  const choice=name=>unique([...label(name).parentElement.querySelectorAll('button[aria-haspopup="listbox"]')].filter(visible),'Meesho’s '+name+' selector changed.');
  const button=name=>[...document.querySelectorAll('button')].filter(visible).find(el=>text(el)===name&&!el.disabled);
  const expected=[['Sub Order Number',claim.subOrderNumber],['AWB Number',claim.awbNumber],['Packet ID',claim.packetId],['Description',claim.description],...(claim.callbackNumber?[['Callback Number',claim.callbackNumber]]:[])];
  const form=()=>{
    if(!page.pathname.endsWith('/create')||text(choice('Issue'))!==issue)throw new Error('The selected Meesho issue does not match this claim.');
    if(text(choice('State of the packet'))!==claim.condition)throw new Error('The packet condition changed. Check the original form.');
    for(const [name,value]of expected)if(field(name).value!==value)throw new Error('The '+name+' changed in Meesho. Autofill stopped to preserve your edits.');
    if(!/^\d{10}$/.test(field('Callback Number').value))throw new Error('Enter a valid callback number in the app or Meesho, then prepare again.');
  };
  if(action==='advance'){
    if(!page.pathname.endsWith('/create')){
      let next;
      if(page.pathname===new URL(claim.claimsUrl).pathname)next=button('Raise Claim');
      else if(page.pathname===prefix)next=button(issue);
      else if([...document.querySelectorAll('h1,h2,h3')].some(el=>text(el)===issue))next=button('Raise a Ticket');
      if(next&&!state.clicked[page.pathname]){state.clicked[page.pathname]=true;next.click();}
      return{phase:'opening'};
    }
    // Meesho changes the route before its ticket fields finish loading.
    // Keep polling that owned form instead of treating its loading screen as a changed layout.
    const loadedLabels=[...document.querySelectorAll('label')].map(text);
    const requiredLabels=['Issue','Sub Order Number','AWB Number','State of the packet','Packet ID','Description','Callback Number'];
    if(requiredLabels.some(name=>!loadedLabels.includes(name)))return{phase:'opening'};
    if(text(choice('Issue'))!==issue)throw new Error('The selected issue does not match this saved claim.');
    // Validate every field before changing any values.
    const fields=expected.map(([name,value])=>({name,value,node:field(name)}));
    for(const item of fields)if(item.name!=='Callback Number'&&item.node.value&&item.node.value!==item.value)throw new Error('The '+item.name+' already has a different value. Your edit was preserved.');
    const condition=choice('State of the packet');
    if(text(condition)!==claim.condition){
      if(text(condition)&&text(condition)!=='State of the packet')throw new Error('A different packet condition is already selected.');
      const options=[...document.querySelectorAll('[role="option"]')].filter(el=>visible(el)&&text(el)===claim.condition);
      if(options.length===1)options[0].click();else if(condition.getAttribute('aria-expanded')!=='true')condition.click();
      return{phase:'opening'};
    }
    for(const {node,value}of fields){
      if(node.value===value)continue;
      const prototype=node.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype,'value').set.call(node,value);
      node.dispatchEvent(new Event('input',{bubbles:true,composed:true}));node.dispatchEvent(new Event('change',{bubbles:true,composed:true}));
    }
    await new Promise(resolve=>setTimeout(resolve,0));form();return{phase:'prepared'};
  }
  if(action==='abort'){delete state.file;return{supplied:Object.keys(state.supplied)};}
  form();
  const prefixes={video:'product_openingvideo_link_',product:'product_image_link_',waybill:'product_reverse_way_bill_link_',barcode:'barcode_image_link_'};
  const fileInput=role=>unique([...document.querySelectorAll('input[type="file"]')].filter(el=>el.id.startsWith(prefixes[role])&&!el.disabled&&!el.hasAttribute('webkitdirectory')),'Meesho’s evidence field changed. Attach that file manually.');
  if(action==='file-begin'){
    const evidence=claim.evidence.find(file=>file.role===data.role);
    if(!evidence||state.supplied[data.role])throw new Error('This evidence is missing or was already supplied. Check the original form.');
    if(fileInput(data.role).files?.length)throw new Error('That Meesho evidence field already contains a file. Your selection was preserved.');
    state.file={...evidence,parts:[],received:0,index:0};return{ready:true};
  }
  if(action==='file-chunk'){
    const file=state.file;
    if(!file||file.role!==data.role||file.index!==data.index||typeof data.base64!=='string'||data.base64.length>699052||!data.base64.length||!/^[A-Za-z0-9+/]*={0,2}$/.test(data.base64))throw new Error('Evidence chunks are out of order. Check the original form before trying again.');
    const bytes=Uint8Array.from(atob(data.base64),value=>value.charCodeAt(0));
    if(!bytes.length||bytes.length>524288||file.received+bytes.length>file.bytes)throw new Error('The evidence size changed during transfer.');
    file.parts.push(bytes);file.received+=bytes.length;file.index++;return{received:file.received};
  }
  if(action==='file-finish'){
    const file=state.file;if(!file||file.role!==data.role||file.received!==file.bytes)throw new Error('The evidence transfer is incomplete.');
    const blob=new Blob(file.parts,{type:file.type}),bytes=new Uint8Array(await blob.arrayBuffer());
    const matches=file.type==='video/mp4'?String.fromCharCode(...bytes.slice(4,8))==='ftyp':file.type==='image/png'?[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v):bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
    if(!matches||hash!==file.sha256)throw new Error('The evidence does not match the selected original. Nothing was attached.');
    if(location.href!==page.href)throw new Error('The Meesho form changed during transfer.');form();
    const input=fileInput(file.role);if(input.files?.length)throw new Error('A file was added manually during transfer. It was preserved.');
    const transfer=new DataTransfer();transfer.items.add(new File([blob],file.name,{type:file.type}));input.files=transfer.files;
    state.supplied[file.role]=file.id;delete state.file;
    input.dispatchEvent(new Event('input',{bubbles:true,composed:true}));input.dispatchEvent(new Event('change',{bubbles:true,composed:true}));
    return{supplied:Object.keys(state.supplied)};
  }
  if(action==='finish'){
    if(!claim.evidence.every(file=>state.supplied[file.role]===file.id))throw new Error('Not all selected evidence was supplied. Review the original Meesho form.');
    // Deliberately never click Submit or claim that a ticket was created.
    return{phase:'review',supplied:Object.keys(state.supplied),submitted:false};
  }
  throw new Error('Unsupported claims page action.');
};

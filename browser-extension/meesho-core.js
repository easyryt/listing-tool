/* Fixed Meesho Image Bulk Upload boundaries and exact-row link capture. */
(() => {
  const supplierOrigin='https://supplier.meesho.com';
  const defaultUploadPage=`${supplierOrigin}/panel/v3/new/cataloging/motiw/images-bulk-upload`;
  function isUpload(value){try{const u=new URL(value);return u.origin==='https://supplier.meesho.com'&&!u.username&&!u.password&&!u.search&&!u.hash&&/^\/panel\/v3\/new\/cataloging\/[a-zA-Z0-9_-]+\/images-bulk-upload$/.test(u.pathname);}catch{return false;}}
  function sellerUploadPage(value){
    try{
      const url=new URL(value);
      if(isUpload(url.href))return url.href;
      if(url.origin!==supplierOrigin||url.username||url.password)return null;
      const seller=url.pathname.match(/^\/panel\/v3\/new\/fulfillment\/([\w-]+)\/claims$/)?.[1];
      return seller?`${supplierOrigin}/panel/v3/new/cataloging/${seller}/images-bulk-upload`:null;
    }catch{return null;}
  }
  async function resolveSellerPage(chrome,configured){
    if(configured!==undefined&&configured!==''){
      if(!isUpload(configured))throw new Error('Use your Meesho Image Bulk Upload page URL.');
      return new URL(configured).href;
    }
    const tabs=await chrome.tabs.query({url:`${supplierOrigin}/*`});
    const pages=new Set(tabs.filter(tab=>!tab.pendingUrl||tab.pendingUrl===tab.url).map(tab=>sellerUploadPage(tab.url)).filter(Boolean));
    if(pages.size>1)throw new Error('More than one Meesho seller page is open. Save the correct Image Bulk Upload URL in upload settings.');
    return pages.values().next().value ?? defaultUploadPage;
  }
  function imageLink(value){try{const u=new URL(value);return u.origin==='https://upload.meeshosupplyassets.com'&&!u.username&&!u.password&&!u.search&&!u.hash&&/^\/cataloging\/\d+\/[a-zA-Z0-9_.-]+\.(png|jpg|jpeg)$/i.test(u.pathname)?u.href:null;}catch{return null;}}
  function uniqueName(type,iso,id){if(!['image/png','image/jpeg'].includes(type))throw new Error('Meesho accepts PNG or JPG images.');return 'browser-ai-meesho-test-'+iso.replace(/\D/g,'').slice(0,14)+'-'+id.slice(0,8)+(type==='image/png'?'.png':'.jpg');}
  function findUploadedFile(doc,filename){
    const rows=[...doc.querySelectorAll('table[aria-label="Uploaded image links"] tbody tr')].filter(row=>row.getClientRects().length&&[...row.querySelectorAll('td')].some(cell=>cell.innerText.trim()===filename));
    if(rows.length>1)throw new Error('Multiple Meesho rows match this image. No link was selected.');
    if(!rows.length)return null;
    const urls=[...rows[0].querySelectorAll('td')].map(cell=>imageLink(cell.innerText.trim())).filter(Boolean);
    if(urls.length!==1)return null;
    const url=urls[0];if(new URL(url).pathname.split('/').pop()!==filename)throw new Error('Meesho returned a link for a different image.');
    return{url};
  }
  globalThis.BrowserTestMeesho={isUpload,resolveSellerPage,imageLink,uniqueName,findUploadedFile};
})();

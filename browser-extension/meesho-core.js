/* Fixed Meesho Image Bulk Upload boundaries and exact-row link capture. */
(() => {
  function isUpload(value){try{const u=new URL(value);return u.origin==='https://supplier.meesho.com'&&!u.username&&!u.password&&!u.search&&!u.hash&&/^\/panel\/v3\/new\/cataloging\/[a-zA-Z0-9_-]+\/images-bulk-upload$/.test(u.pathname);}catch{return false;}}
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
  globalThis.BrowserTestMeesho={isUpload,imageLink,uniqueName,findUploadedFile};
})();

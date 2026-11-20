/* An on-page, Drive-only workflow. It does not mirror or expose extension pages. */
(() => {
  const D = globalThis.BrowserTestDrive;
  if (!D.isDrive(location.href)) return;
  const existing = document.getElementById('browser-ai-drive-test');
  if (existing) { existing.scrollIntoView({ block: 'nearest' }); return; }
  const host = document.createElement('aside'); host.id = 'browser-ai-drive-test'; host.setAttribute('aria-label', 'Browser AI Google Drive test');
  const root = host.attachShadow({ mode: 'open' });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(':host{position:fixed;top:88px;right:22px;width:370px;max-height:calc(100vh - 110px);overflow:auto;z-index:2147483647;font:13px/1.5 system-ui;color:#193047}*{box-sizing:border-box}.panel{background:#fff;border:1px solid #ccd8e6;border-radius:16px;box-shadow:0 12px 50px #14283a30;padding:20px}h2{font-size:18px;margin:0 0 8px}p{color:#586c7e;margin:8px 0 12px}label{display:block;margin-top:12px}input[type=file]{max-width:100%;font:inherit}input[type=checkbox]{margin-right:8px}button,a{font:600 12px system-ui;border:1px solid #c9d5e2;background:#fff;color:#285575;padding:10px;border-radius:8px;cursor:pointer;text-decoration:none;display:inline-block;margin:8px 5px 0 0}button.primary{background:#166b70;color:white;border-color:#166b70}button:disabled{opacity:.45;cursor:not-allowed}button.close{float:right;padding:3px 8px;margin:0}.status{padding:10px;border-radius:8px;background:#eff5fa;overflow-wrap:anywhere}.error{background:#fff0ed;color:#a43627}.success{background:#e9f8f0;color:#196447}input.link{width:100%;padding:8px;border:1px solid #c9d5e2;border-radius:6px;font:11px system-ui}small{font-size:11px;color:#697b8b}');
  root.adoptedStyleSheets = [sheet];
  const make = (tag, text, attrs = {}) => { const node = document.createElement(tag); if (text) node.textContent = text; for (const [name, value] of Object.entries(attrs)) node.setAttribute(name,value); return node; };
  const panel = make('section', '', { class: 'panel' });
  const close = make('button','×',{class:'close','aria-label':'Close Drive test'}), title = make('h2','Browser AI · Drive test');
  const description = make('p','Upload one uniquely named test image to My Drive, copy its viewing link and save it in the local test database.');
  const privacy = make('small','Uses the current Drive account and existing sharing permissions. The copied link is a Drive viewing link, not a public image URL. No GPT calls.');
  const status = make('p','Checking the local app connection…',{class:'status',role:'status','aria-live':'polite'});
  const check = make('button','Check local connection');
  const dashboard = make('a','Local dashboard',{href:'http://127.0.0.1:4317/',target:'_blank',rel:'noopener noreferrer'});
  const label = make('label','Optional: choose your own PNG, JPG or WEBP (4 MB max)');
  const input = make('input','',{type:'file',accept:'image/png,image/jpeg,image/webp','aria-label':'Drive test image'}); label.append(input);
  const approveLabel = make('label'), approve = make('input','',{type:'checkbox','aria-label':'Approve this image upload to My Drive'});
  approveLabel.append(approve,document.createTextNode('I approve uploading this image to My Drive and saving its link locally.'));
  const run = make('button','Run Google Drive test',{class:'primary'}), resume = make('button','Find / save last upload'), stop = make('button','Stop');
  const linkInput = make('input','',{class:'link',type:'text',readonly:'','aria-label':'Captured Google Drive image link'});
  const copy = make('button','Copy Drive link'), open = make('a','Open uploaded image',{target:'_blank',rel:'noopener noreferrer'});
  const note = make('small','For the first test, leave the image chooser empty to use a generated PNG. Open My Drive before running. An uncertain upload is never retried automatically.');
  panel.append(close,title,description,privacy,status,check,dashboard,label,approveLabel,run,resume,stop,linkInput,copy,open,note); root.append(panel); document.body.append(host);
  let connected = false, busy = false, generation = 0, pending = null, captured = '';
  const show = (text, kind = '') => { status.textContent = text; status.className = 'status ' + kind; };
  const update = () => { run.disabled = busy || !connected || !approve.checked || Boolean(pending); resume.disabled = busy || !connected || !pending; stop.disabled = !busy; copy.disabled = !captured; open.hidden = !captured; linkInput.hidden = !captured; check.disabled = busy; input.disabled = busy; approve.disabled = busy; };
  const send = async message => { const result = await chrome.runtime.sendMessage(message); if (!result?.ok) throw new Error(result?.error || 'Extension connection failed. Reload the extension and reopen this test.'); return result; };
  const delay = ms => new Promise(resolve => setTimeout(resolve,ms));
  async function connection() { try { await send({type:'drive-status'}); connected = true; show('Connected to the local test app. Ready to upload the sample.','success'); } catch { connected = false; show('Open the local dashboard and click Connect installed extension. Keep npm run dev running.','error'); } update(); }
  function search(filename) {
    const searchInput = [...document.querySelectorAll('input')].find(el => /search in drive/i.test(el.getAttribute('aria-label') || '') && el.getClientRects().length);
    const searchButton = [...document.querySelectorAll('button,[role="button"]')].find(el => /search google drive/i.test(el.getAttribute('aria-label') || '') && el.getClientRects().length);
    if (!searchInput || !searchButton) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(searchInput,filename);
    searchInput.dispatchEvent(new Event('input',{bubbles:true})); searchInput.dispatchEvent(new Event('change',{bubbles:true})); searchButton.click(); return true;
  }
  async function identify(version) {
    const started = Date.now(); let searched = false;
    while (Date.now() - started < 90000) {
      if (generation !== version) throw new Error('Stopped. The dispatched Drive upload may still finish; use Find / save last upload rather than uploading again.');
      const found = D.findUploadedFile(document,pending.filename);
      if (found) return found;
      if (!searched && Date.now() - started > 8000) { searched = search(pending.filename); if (searched) show('Looking up the exact new test filename in Drive…'); }
      await delay(400);
    }
    throw new Error('Drive has not exposed a unique file ID yet. Check its upload status. Use Find / save last upload to continue without another upload.');
  }
  async function finish(version) {
    show('Waiting for Drive to show the uploaded image (up to 90 seconds)…');
    const found = await identify(version); if (version !== generation) return;
    captured = found.url; linkInput.value = captured; open.href = captured; update();
    const record = { requestId:pending.requestId,title:pending.filename,sku:'DRIVE-TEST-' + pending.requestId.slice(0,8),sourceUrl:pending.sourceUrl,imageUrls:[captured],filename:pending.filename };
    const response = await send({type:'drive-save',record}); if (version !== generation) return;
    try { await navigator.clipboard.writeText(captured); show('PASS: Drive file found, viewing link copied and saved locally. Record: ' + response.saved.record.id,'success'); }
    catch { show('Drive file found and link saved locally. Click Copy Drive link to copy it.','success'); }
    update();
  }
  run.onclick = async event => {
    if (!event.isTrusted || busy || !connected || !approve.checked || pending) return;
    if (!D.isMyDrive(location.href)) { show('Open My Drive first, then click the extension icon on that page. Uploading into a shared folder is outside this test.','error'); return; }
    const version = ++generation; busy = true; update();
    try {
      let file, type;
      if (input.files[0]) { file = input.files[0]; type = file.type; if (file.size > 4194304) throw new Error('Choose an image up to 4 MB.'); }
      else { const sample = (await send({type:'drive-sample'})).file; type = sample.type; file = new File([D.decodeImage(sample)],sample.name,{type}); }
      const bytes = new Uint8Array(await file.arrayBuffer());
      // Validate chosen bytes through the same bounded decoder as the generated sample.
      let binary = ''; for (let offset=0; offset<bytes.length; offset+=8192) binary += String.fromCharCode(...bytes.subarray(offset,offset+8192));
      const base64 = btoa(binary); D.decodeImage({type,base64});
      if (version !== generation) return;
      const requestId = crypto.randomUUID(), filename = D.uniqueName(type,new Date().toISOString(),requestId);
      pending = { requestId,filename,sourceUrl:location.origin + location.pathname };
      show('Uploading ' + filename + ' through Drive’s File upload control…');
      await send({type:'drive-upload',file:{name:filename,type,base64}});
      await finish(version);
    } catch(error) { if (version === generation) show(error.message,'error'); }
    finally { busy = false; update(); }
  };
  resume.onclick = async event => { if (!event.isTrusted || busy || !pending || !connected) return; const version = ++generation; busy = true; update(); try { await finish(version); } catch(error) { if (version === generation) show(error.message,'error'); } finally { busy = false; update(); } };
  copy.onclick = async event => { if (!event.isTrusted || !captured) return; try { await navigator.clipboard.writeText(captured); show('Drive link copied to the clipboard.','success'); } catch { show('Copy was blocked. Select the displayed link and copy it manually.','error'); } };
  check.onclick = event => { if (event.isTrusted) connection(); };
  approve.onchange = update;
  stop.onclick = () => { ++generation; show('Stopped subsequent steps. Drive may still finish a dispatched upload. Use Find / save last upload to resume.'); update(); };
  close.onclick = () => { ++generation; host.remove(); };
  update(); connection();
})();

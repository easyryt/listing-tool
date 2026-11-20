(() => {
  'use strict';
  const demo = document.body.dataset.mode === 'demo';
  const API = 'http://127.0.0.1:4317';
  const P = globalThis.BrowserTestPolicy;
  const tabId = Number(new URLSearchParams(location.search).get('tab'));
  let access = '', view = null, pending = null, image = null, tableData = null, approvedOrigin = '', usage = null;
  let running = false, epoch = 0, imageUrl = null, captured = null, saveId = crypto.randomUUID(), savedRecords = [];
  document.body.innerHTML = `<main>
    <header><div><div class="eyebrow">CUSTOM EXTENSION TEST · V0.3</div><h1>Browser AI Test</h1><p>Upload an image. Capture its link. Save a test listing.</p></div><span class="badge">${demo ? 'Local dashboard' : 'Custom Chrome extension'}</span></header>
    <div id="message" class="status" role="status" aria-live="polite">Connecting to the local test server…</div>
    <div class="layout"><div class="stack">
      <section class="card"><h2>${demo ? 'Your test workspace' : 'Connect the local server'}</h2>
        <p>${demo ? 'Try the sample form beside these controls. It has no connection to your listing app or Meesho.' : 'Start this separate test server, then copy its pairing code from the local dashboard.'}</p>
        ${demo ? '<div class="target">Extension pairing code: <strong id="pair-code">…</strong></div><div class="row"><button id="refresh-code">New code</button><a class="button" href="/demo" target="_blank" rel="noopener">Open demo in a tab</a></div><small>Code expires after 10 minutes and is used once. Paste it only into your own extension.</small>' : '<label>Local pairing code<input id="pair-code-input" autocomplete="off" spellcheck="false" maxlength="8" placeholder="8 characters from dashboard"></label><div class="row"><button id="pair" class="primary">Pair extension</button><a class="button" href="http://127.0.0.1:4317" target="_blank" rel="noopener">Local dashboard</a></div>'}
        <div class="cost"><div class="eyebrow">GPT-6 LUNA ONLY · NO MODEL UPGRADES</div><div class="stats"><div><small>Estimated today</small><strong id="spend">$0.0000</strong></div><div><small>Daily budget</small><strong id="budget">$0.02</strong></div><div><small>AI requests</small><strong id="calls">0 / 20</strong></div></div><small id="key-state">Checking API availability…</small><p class="muted">Manual controls and sample drafts cost $0. Estimates use published text rates; set a project budget in OpenAI too. Reset: midnight UTC.</p></div>
      </section>
      <section class="card"><h2><span class="step">1</span>${demo ? 'Inspect the embedded test page' : 'Inspect the selected Chrome tab'}</h2><p>${demo ? 'These controls work only on the sample page inside this dashboard. To use another tab, install and open your custom extension.' : 'Use the extension icon on the tab you want to work with. Chrome settings pages and ungranted tabs are unavailable.'}</p><div id="target" class="target">No page inspected</div><div class="row"><button id="inspect" class="primary">Inspect page · free</button><button id="read-table">Read tables · free</button></div><div id="fields" class="field-list"></div><label><input id="trust" type="checkbox">I trust this destination and allow reviewed edits. Its fields may auto-save.</label><small>Only supported visible listing fields. Password, contact and payment fields are excluded.</small></section>
      <section class="card"><h2><span class="step">2</span>Prepare a draft</h2><p>Use free controls, or ask the budget model for one small step.</p>
        <label>Listing field<select id="field"><option value="">Inspect the page first</option></select></label><label id="value-label">New value<input id="value" maxlength="700" placeholder="Enter the exact value you want"></label><div class="row"><button id="manual">Prepare edit · free</button><button id="sample">Prepare sample title · free</button></div>
        <details><summary>Use GPT for a task</summary><label>Your instruction<textarea id="task" maxlength="600" rows="3" placeholder="Set the title to Universal Transparent Mobile Case Lanyard Insert Tabs Phone Charms Holder (Pack of 10)"></textarea></label><p class="muted">Describe the product yourself. This budget test sends no images, current field values, table contents, full page text or browser history to GPT.</p><details><summary>Preview the exact task and page data sent to OpenAI</summary><pre id="data-preview">Inspect a page first.</pre></details><label><input type="checkbox" id="ai-consent">I reviewed this data and approve one paid request to OpenAI.</label><div class="row"><button id="ask" class="primary">Ask budget AI</button><button id="refresh-usage">Refresh usage</button></div></details>
        <div id="proposal" hidden><div class="eyebrow">REVIEW BEFORE APPLYING</div><p id="proposal-reason"></p><div id="edits"></div><div class="row"><button id="apply" class="primary">Confirm and apply</button><button id="discard">Discard draft</button></div><small>Filling fields can trigger the website’s auto-save. No submit, publish or payment buttons are automated.</small></div>
      </section>
      <section class="card"><h2><span class="step">3</span>Upload an image</h2><p>Choose an image yourself, or use the built-in sample. It stays local until you confirm placing it in the selected website’s file field.</p><label>Destination file field<select id="file-field"><option value="">Inspect a page first</option></select></label><label>PNG, JPG or WEBP · maximum 4 MB<input id="image" type="file" accept="image/png,image/jpeg,image/webp"></label><div class="row"><button id="use-sample">Use sample image · free</button></div><img id="image-preview" alt="Image you selected" hidden><p id="image-info" class="muted">No image selected.</p><label><input id="auto-save" type="checkbox" checked>After upload, capture one new image link, save a test record and copy the link.</label><label><input id="upload-consent" type="checkbox">I approve sending this image to the inspected destination and the selected test workflow.</label><div class="row"><button id="upload" class="primary">Upload and run selected steps</button></div><small>Stops for review if no new link or more than one is found. Some sites need their own upload adapter.</small></section>
      <section class="card"><h2><span class="step">4</span>Image links &amp; test database</h2><p>Read image URLs from the page, choose the right ones and save them to the separate SQLite test database.</p><div class="row"><button id="capture-links">Capture image links · free</button><button id="copy-links" disabled>Copy selected links</button></div><div id="captured-links" class="field-list">No image links captured yet.</div><div class="grid"><label>Test product title<input id="record-title" maxlength="200" placeholder="Title for the saved test record"></label><label>Test SKU<input id="record-sku" maxlength="100" placeholder="Optional SKU"></label></div><p id="record-source" class="muted">No source page captured.</p><div class="row"><button id="save-record" class="primary" disabled>Save selected links to test DB</button></div><small>Database: browser-ai-test/.data/testing.sqlite. Local upload URLs are for testing on this computer, not marketplace listing URLs.</small></section>
      <section class="card"><h2>Saved test listings</h2><p id="record-count">Loading the test database…</p><div class="row"><button id="refresh-records">Refresh records</button><button id="export-records">Export visible records (JSON)</button></div><div id="records" class="table-scroll"></div></section>
      <section class="card"><h2>Activity</h2><div class="row"><button id="stop" class="danger">Stop / discard pending work</button></div><p class="muted">Stops further steps. An AI request already sent may still be billed. Completed website changes cannot be undone here.</p><ul id="log" aria-live="polite"></ul></section>
    </div><div class="stack">${demo ? '<section class="card"><h2>Safe demo page</h2><p>Sample values only. Watch your approved edits appear here.</p><iframe id="demo-frame" src="/demo" title="Local test listing form"></iframe></section><section class="card"><h2>Use your own Chrome tab</h2><p>Load the <code>browser-ai-test/extension</code> folder using Chrome’s Load unpacked button. Then click its toolbar icon on your chosen page and pair it here.</p><p class="muted">No access to your existing tabs until you select one with the extension icon. Your listing app is separate.</p></section>' : ''}<section class="card" id="tables-card"><h2>Table preview</h2><p>Read visible HTML tables from the selected page. Data stays local and is never sent to GPT.</p><div id="tables" class="table-scroll">No tables read yet.</div><div class="row"><button id="download" disabled>Download table data (JSON)</button></div></section></div></div>
  </main>`;
  const $ = id => document.getElementById(id);
  const pasteOption = document.createElement('label'), pasteCheckbox = document.createElement('input');
  pasteCheckbox.type = 'checkbox'; pasteCheckbox.id = 'auto-paste'; pasteCheckbox.checked = true;
  pasteOption.append(pasteCheckbox, document.createTextNode('Paste the captured link into one empty product-image URL field on the source page.'));
  $('auto-save').parentElement.after(pasteOption);
  if (demo) {
    const section = document.createElement('section'); section.className = 'card';
    const title = document.createElement('h2'); title.textContent = 'Google Drive · custom extension test';
    const text = document.createElement('p'); text.textContent = 'Connect your installed extension, open My Drive and click its toolbar icon. The Drive-page control uploads one test image, copies its viewing link and saves a local record. Existing sharing permissions stay in place.';
    const label = document.createElement('label'); label.textContent = 'Installed extension ID';
    const id = document.createElement('input'); id.id = 'installed-extension-id'; id.value = 'ecpambeklfncoephahlfnbimbepfiion'; id.maxLength = 32; id.spellcheck = false; label.append(id);
    const connect = document.createElement('button'); connect.id = 'connect-extension'; connect.className = 'primary'; connect.textContent = 'Connect installed extension';
    const drive = document.createElement('a'); drive.className = 'button'; drive.href = 'https://drive.google.com/drive/my-drive'; drive.target = '_blank'; drive.rel = 'noopener noreferrer'; drive.textContent = 'Open My Drive';
    const row = document.createElement('div'); row.className = 'row'; row.append(connect,drive);
    const status = document.createElement('p'); status.id = 'drive-connection-status'; status.className = 'muted'; status.textContent = 'Requires extension version 0.3.0. Reload the extension after updating its files.';
    section.append(title,text,label,row,status); document.querySelector('.layout > .stack').prepend(section);
    connect.onclick = () => action(async () => {
      if (!/^[a-p]{32}$/.test(id.value)) throw new Error('Enter the 32-letter extension ID shown on its Chrome card.');
      if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) throw new Error('Reload extension 0.3.0 and refresh this dashboard in Chrome to enable the connection.');
      const pairing = await api('/api/pair-code',{}); $('pair-code').textContent = pairing.code;
      const response = await new Promise((resolve,reject) => {
        chrome.runtime.sendMessage(id.value,{type:'connect-local-app',code:pairing.code},result => {
          if (chrome.runtime.lastError) reject(new Error('Chrome could not reach the installed extension. Reload version 0.3.0, check its ID and refresh this page.'));
          else if (!result?.ok) reject(new Error(result?.error || 'Extension pairing failed.'));
          else resolve(result);
        });
      });
      status.textContent = `Connected: ${response.extensionId}, version ${response.version}. Open My Drive and click Browser AI Test’s toolbar icon.`;
      message('Custom extension connected. Its Google Drive test is ready.','success');
    });
  }
  const apiClient = new globalThis.BrowserTestApi({
    getToken: () => access, extensionId: demo ? '' : chrome.runtime.id,
    onSession: session => { access = session.token; $('pair-code').textContent = session.pairing.code; showUsage(session.status); }
  });
  function message(text, type = '') { $('message').textContent = text; $('message').className = `status ${type}`; }
  function log(text) { const li = document.createElement('li'); li.textContent = `${new Date().toLocaleTimeString()} · ${text}`; $('log').prepend(li); while ($('log').children.length > 25) $('log').lastChild.remove(); }
  function state() {
    for (const id of ['inspect', 'read-table', 'manual', 'sample', 'ask', 'apply', 'upload', 'capture-links', 'copy-links', 'save-record', 'refresh-records', 'export-records', 'use-sample']) $(id).disabled = running;
    $('ask').disabled ||= !view || !access || !usage?.configured || !$('ai-consent').checked;
    $('apply').disabled ||= !pending || approvedOrigin !== view?.origin;
    $('upload').disabled ||= !view || !image || !$('file-field').value || !$('upload-consent').checked || approvedOrigin !== view?.origin;
    $('manual').disabled ||= !view || !$('field').value;
    $('sample').disabled ||= !view;
    $('download').disabled = !tableData;
    $('save-record').disabled ||= !access || !captured || !selectedLinks().length || !$('record-title').value.trim();
    $('copy-links').disabled ||= !captured || !selectedLinks().length;
    $('export-records').disabled ||= !savedRecords.length;
    $('use-sample').disabled ||= !access;
    $('auto-paste').disabled = running || !$('auto-save').checked;
    if (demo) $('refresh-code').disabled = running || !access;
    if (demo) $('connect-extension').disabled = running || !access;
  }
  function showUsage(data) {
    usage = data;
    $('spend').textContent = `$${data.estimatedSpentUsd.toFixed(5)}`;
    $('budget').textContent = `$${data.budgetUsd.toFixed(2)}`;
    $('calls').textContent = `${data.calls} / ${data.maxCalls}`;
    $('key-state').textContent = data.configured ? 'API key is configured on the local server. Each GPT request needs your approval.' : 'Free mode. Add your own key to this tool’s .env to enable GPT.';
    state();
  }
  async function api(path, data, unauthenticated = false) {
    return apiClient.request(path, data, unauthenticated);
  }
  async function browser(message) {
    if (demo) {
      const agent = $('demo-frame').contentWindow.__browserTestAgent;
      if (!agent) throw new Error('The demo is still loading. Try Inspect page again.');
      return agent.run(message);
    }
    if (!Number.isInteger(tabId) || tabId < 1) throw new Error('Open this controller using the extension icon on your chosen tab.');
    const tab = await chrome.tabs.get(tabId);
    if (!/^https?:\/\//.test(tab.url || '')) throw new Error('Select a normal HTTP or HTTPS page, then click the extension icon again.');
    if (['inspect', 'read_table', 'capture_links'].includes(message.type)) await chrome.scripting.executeScript({ target: { tabId }, files: ['policy.js', 'agent.js'] });
    const results = await chrome.scripting.executeScript({ target: { tabId }, func: async payload => {
      try { return { ok: true, data: await globalThis.__browserTestAgent.run(payload) }; }
      catch (error) { return { ok: false, error: error.message }; }
    }, args: [message] });
    if (!results[0]?.result?.ok) throw new Error(results[0]?.result?.error || 'This page is unavailable. Click the extension icon on it again.');
    return results[0].result.data;
  }
  async function action(fn) {
    if (running) return;
    const version = ++epoch; running = true; state();
    try { await fn(version); }
    catch (error) { if (version === epoch) { message(error.message || 'The action failed. Inspect again.', 'error'); log('Stopped: ' + error.message); } }
    finally { running = false; state(); }
  }
  function preview() {
    $('data-preview').textContent = view ? JSON.stringify({ userTask: $('task').value, untrustedPage: P.snapshot(view) }, null, 2) : 'Inspect a page first.';
    $('ai-consent').checked = false; state();
  }
  function discard() { pending = null; $('proposal').hidden = true; state(); }
  function valueControl() {
    const field = view?.fields.find(f => f.id === $('field').value);
    const previous = $('value'); let input;
    if (field?.type === 'select') {
      input = document.createElement('select');
      for (const option of field.options) input.add(new Option(option.label, option.value));
    } else { input = document.createElement('input'); input.type = field?.type === 'number' ? 'number' : 'text'; input.maxLength = 700; }
    input.id = 'value'; input.value = field?.value || ''; previous.replaceWith(input);
  }
  function showView(snapshot) {
    if (snapshot.origin !== view?.origin) { approvedOrigin = ''; $('trust').checked = false; }
    view = snapshot; discard();
    $('upload-consent').checked = false;
    $('target').textContent = `${view.title} · ${view.origin}`;
    $('fields').replaceChildren(); $('field').replaceChildren(); $('file-field').replaceChildren();
    for (const field of view.fields) {
      $('field').add(new Option(`${field.label} (${field.type})`, field.id));
      const row = document.createElement('div'); row.className = 'field-row';
      const name = document.createElement('span'), value = document.createElement('span');
      name.textContent = field.label; value.textContent = field.value || 'Empty'; row.append(name, value); $('fields').append(row);
    }
    if (!view.fields.length) $('field').add(new Option('No supported listing fields', ''));
    for (const file of view.files) $('file-field').add(new Option(file.label, file.id));
    if (!view.files.length) $('file-field').add(new Option('No visible file input found', ''));
    valueControl(); preview();
    $('record-title').value = view.fields.find(f => /product.?title|product.?name/i.test(f.label))?.value || '';
    $('record-sku').value = view.fields.find(f => /sku|style.?id/i.test(f.label))?.value || '';
    saveId = crypto.randomUUID();
  }
  function propose(proposal) {
    if (!view) throw new Error('Inspect the page first.');
    const validated = P.proposal(proposal, P.snapshot(view));
    pending = { ...validated, snapshotId: view.id, origin: view.origin, operationId: crypto.randomUUID() };
    $('proposal-reason').textContent = validated.reason;
    $('edits').replaceChildren();
    for (const edit of validated.edits) {
      const field = view.fields.find(f => f.id === edit.fieldId), row = document.createElement('p');
      row.textContent = `${field.label}: ${field.value || '(empty)'} → ${edit.value}`; $('edits').append(row);
    }
    if (validated.action === 'unsupported') { discard(); message(validated.reason, 'error'); return; }
    $('proposal').hidden = false; message('Draft ready. Review the destination and values, then confirm.', 'success');
    state();
  }
  $('inspect').onclick = () => action(async () => { showView(await browser({ type: 'inspect' })); message('Page inspected locally. Select a field or prepare a sample title.', 'success'); log('Inspected ' + view.origin); });
  function renderTables(data) {
    tableData = data; $('tables').replaceChildren();
    if (!data.tables.length) $('tables').textContent = 'No visible HTML table found. Charts, virtual grids and cross-origin frames need a dedicated adapter.';
    for (const rows of data.tables) {
      const table = document.createElement('table');
      rows.forEach((cells, index) => { const row = document.createElement('tr'); cells.forEach(value => { const cell = document.createElement(index ? 'td' : 'th'); cell.textContent = value; row.append(cell); }); table.append(row); });
      $('tables').append(table);
    }
    message(data.note, 'success'); log(`Read ${data.tables.length} local table(s).`); state();
  }
  $('read-table').onclick = () => action(async () => renderTables(await browser({ type: 'read_table' })));
  $('field').onchange = valueControl;
  $('trust').onchange = () => { approvedOrigin = $('trust').checked && view ? view.origin : ''; state(); };
  $('file-field').onchange = () => { $('upload-consent').checked = false; state(); };
  $('upload-consent').onchange = state; $('ai-consent').onchange = state;
  $('auto-save').onchange = state;
  $('task').oninput = preview;
  $('manual').onclick = () => action(async () => propose({ action: 'fill', reason: 'Manual draft · no AI cost. Check the exact value before applying.', edits: [{ fieldId: $('field').value, value: $('value').value }] }));
  $('sample').onclick = () => action(async () => {
    const field = view?.fields.find(f => /title|product.?name/i.test(f.label));
    if (!field) throw new Error('No title field was found. Choose a field manually.');
    propose({ action: 'fill', reason: 'Fixed sample for testing · not AI detection. Use only if these product facts are correct.', edits: [{ fieldId: field.id, value: 'Universal Transparent Mobile Case Lanyard Insert Tabs Phone Charms Holder (Pack of 10)' }] });
  });
  $('ask').onclick = () => action(async version => {
    message('Asking GPT-6 Luna for one draft. No browser action will run automatically.');
    const consent = $('ai-consent').checked; $('ai-consent').checked = false;
    const result = await api('/api/plan', { task: $('task').value, snapshot: P.snapshot(view), consent });
    if (version !== epoch) return;
    showUsage(result.usage); propose(result.proposal); log(result.cached ? 'Used a cached AI draft · no new call.' : 'Prepared one GPT draft.');
  });
  $('apply').onclick = () => action(async () => {
    if (!pending || approvedOrigin !== view?.origin) throw new Error('Review and approve the inspected destination first.');
    const draft = pending; discard();
    if (draft.action === 'inspect') { showView(await browser({ type: 'inspect' })); message('Fresh page inspected.', 'success'); return; }
    if (draft.action === 'read_table') { renderTables(await browser({ type: 'read_table' })); return; }
    const result = await browser({ type: 'fill', ...draft });
    view = null; preview(); message(result.message, 'success'); log(result.message);
  });
  $('discard').onclick = () => { discard(); message('Draft discarded. No edits were applied.'); };
  function chooseImage(file) {
    image = null; $('upload-consent').checked = false;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    $('image-preview').hidden = true;
    if (!file) { $('image-info').textContent = 'No image selected.'; state(); return; }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 4 * 1024 * 1024) { message('Choose a PNG, JPG or WEBP up to 4 MB.', 'error'); state(); return; }
    image = file; imageUrl = URL.createObjectURL(file); $('image-preview').src = imageUrl; $('image-preview').hidden = false;
    const sizeLabel = file.size < 1024 ? `${file.size} bytes` : `${Math.ceil(file.size / 1024)} KB`;
    $('image-info').textContent = `${file.name} · ${sizeLabel}. Destination: ${view?.origin || 'inspect first'}`; state();
  };
  $('image').onchange = () => chooseImage($('image').files[0]);
  $('use-sample').onclick = () => action(async version => {
    const sample = await api('/api/sample-image');
    if (version !== epoch) return;
    const bytes = Uint8Array.from(atob(sample.base64), c => c.charCodeAt(0));
    $('image').value = ''; chooseImage(new File([bytes], sample.name, { type: sample.type }));
    message('Built-in test image selected. Approve its destination to run the upload workflow.', 'success');
  });
  $('upload').onclick = () => action(async version => {
    if (!view || !image || approvedOrigin !== view.origin || !$('upload-consent').checked) throw new Error('Choose an image and approve its destination first.');
    const selected = image, origin = view.origin, workflow = $('auto-save').checked, paste = $('auto-paste').checked;
    const base64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error('Could not read the selected file.')); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.readAsDataURL(selected); });
    if (version !== epoch) return;
    const result = await browser({ type: 'upload', snapshotId: view.id, origin, operationId: crypto.randomUUID(), fieldId: $('file-field').value, file: { name: selected.name, type: selected.type, base64 } });
    if (version !== epoch) return;
    view = null; discard(); preview(); $('upload-consent').checked = false; message(result.message, 'success'); log(result.message);
    if (!workflow) return;
    message('Waiting up to 15 seconds for one new image URL…');
    const links = await browser({ type: 'capture_links', origin, excludeUrls: result.baseline, waitMs: 15000 });
    if (version !== epoch) return;
    showCaptured(links);
    if (links.images.length !== 1) { message(links.images.length ? 'More than one new image link appeared. Review and select the correct links before saving.' : 'No permanent image link appeared. Check the website’s upload result, then capture links manually.', 'error'); return; }
    let pasteResult = null;
    if (paste) {
      pasteResult = await browser({ type: 'paste_link', origin, sourceUrl: links.sourceUrl, url: links.images[0].url, operationId: crypto.randomUUID() });
      if (version !== epoch) return;
      log(pasteResult.message);
    }
    if (!access) { message('Image link captured. Pair the extension with the local app to save the test record.', 'error'); return; }
    await saveCaptured(version, selected.name);
    if (version !== epoch) return;
    try { await navigator.clipboard.writeText(links.images[0].url); log('Image link copied to clipboard.'); message(`Upload link captured, ${pasteResult?.pasted ? 'pasted, ' : ''}copied and saved to the test database.${pasteResult && !pasteResult.pasted ? ' ' + pasteResult.message : ''}`, 'success'); }
    catch { message('Link saved to the test database. Use Copy selected links to copy it to the clipboard.', 'success'); }
  });
  function selectedLinks() {
    return captured ? captured.images.filter((item, index) => $('captured-links').querySelector(`input[data-link="${index}"]`)?.checked).map(item => item.url) : [];
  }
  function showCaptured(data) {
    captured = data; saveId = crypto.randomUUID(); $('captured-links').replaceChildren();
    data.images.forEach((item, index) => {
      const label = document.createElement('label'), check = document.createElement('input'), text = document.createElement('span');
      check.type = 'checkbox'; check.dataset.link = String(index); check.checked = data.images.length === 1;
      check.onchange = () => { saveId = crypto.randomUUID(); state(); };
      text.textContent = `${item.label || item.kind} · ${item.url}`; label.className = 'url-choice'; label.append(check, text); $('captured-links').append(label);
    });
    if (!data.images.length) $('captured-links').textContent = 'No HTTP/HTTPS image links found. Temporary blob/data URLs cannot be saved as listing image links.';
    $('record-title').value = data.productTitle || $('record-title').value || 'Test product';
    $('record-sku').value = data.sku || $('record-sku').value;
    $('record-source').textContent = `Source: ${data.sourceUrl}`; state();
  }
  async function refreshRecords() {
    const data = await api('/api/records'); savedRecords = data.records;
    $('record-count').textContent = `${data.total} saved test listing(s) · showing the newest ${data.records.length}. Separate local SQLite database.`;
    $('records').replaceChildren();
    const table = document.createElement('table');
    for (const record of data.records) {
      const row = document.createElement('tr'), name = document.createElement('td'), details = document.createElement('td');
      name.textContent = `${record.title} · ${record.sku || 'No SKU'} · ${record.clientOrigin?.startsWith('chrome-extension://') ? 'Custom extension' : record.clientOrigin === 'local-dashboard' ? 'Local dashboard' : 'Earlier record'}`;
      for (const url of record.imageUrls) { const link = document.createElement('a'); link.href = url; link.textContent = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; details.append(link, document.createElement('br')); }
      row.append(name, details); table.append(row);
    }
    if (!data.records.length) $('records').textContent = 'Upload a test image or capture a link to create your first record.';
    else $('records').append(table);
    state();
  }
  async function saveCaptured(version, filename = '') {
    if (!captured || !access) throw new Error('Capture image links and connect the local app first.');
    if (filename) captured.filename = filename;
    const result = await api('/api/records', { requestId: saveId, title: $('record-title').value, sku: $('record-sku').value, sourceUrl: captured.sourceUrl, imageUrls: selectedLinks(), filename: captured.filename || '' });
    if (version !== epoch) return;
    await refreshRecords();
    if (version !== epoch) return;
    message(result.duplicate ? 'This test record was already saved. No duplicate was created.' : 'Image links saved to the separate test database.', 'success'); log('Saved test record ' + result.record.id);
  }
  $('capture-links').onclick = () => action(async version => { const data = await browser({ type: 'capture_links' }); if (version === epoch) { showCaptured(data); message(`Found ${data.images.length} image link(s). Review before saving.`, 'success'); } });
  $('save-record').onclick = () => action(version => saveCaptured(version));
  $('copy-links').onclick = () => action(async () => { await navigator.clipboard.writeText(selectedLinks().join('\n')); message('Selected image links copied.', 'success'); });
  $('refresh-records').onclick = () => action(refreshRecords);
  for (const id of ['record-title', 'record-sku']) $(id).oninput = () => { saveId = crypto.randomUUID(); state(); };
  $('export-records').onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ database: 'local-test-sqlite', records: savedRecords }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'test-listing-records.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  $('stop').onclick = () => {
    ++epoch; discard(); view = null; captured = null; approvedOrigin = ''; $('trust').checked = false; $('ai-consent').checked = false; $('upload-consent').checked = false;
    // Keep the lock until the dispatched operation finishes; then inspect, never blindly retry.
    message(running ? 'Stopped further steps. The dispatched operation may still finish. Inspect the page for changes when it finishes.' : 'Pending work discarded. Inspect the page again to continue.'); log('Stop requested. No further step will start.'); state();
  };
  $('refresh-usage').onclick = () => action(async () => showUsage(await api('/api/status')));
  $('download').onclick = () => {
    if (!tableData) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(tableData, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'browser-test-tables.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  if (demo) {
    $('refresh-code').onclick = () => action(async () => { const data = await api('/api/pair-code', {}); $('pair-code').textContent = data.code; message('New pairing code is ready. It expires in 10 minutes.', 'success'); });
    api('/api/session', undefined, true).then(async data => { access = data.token; $('pair-code').textContent = data.pairing.code; showUsage(data.status); await refreshRecords(); message('Local test page and database are ready. Start with Inspect page.', 'success'); }).catch(() => message('Start the local server with npm run dev, then open http://127.0.0.1:4317.', 'error'));
  } else {
    $('pair').onclick = () => action(async () => {
      const result = await api('/api/pair', { code: $('pair-code-input').value }, true);
      access = result.token; await chrome.storage.session.set({ access }); $('pair-code-input').value = '';
      showUsage(await api('/api/status')); await refreshRecords(); message('Custom extension paired. Inspect your selected Chrome tab to begin.', 'success');
    });
    chrome.storage.session.get('access').then(async data => {
      if (!data.access) { message('Open the local dashboard and pair this extension. Free browser controls work without an API key.'); state(); return; }
      access = data.access;
      try { showUsage(await api('/api/status')); await refreshRecords(); message('Connected. Inspect the selected tab to begin.', 'success'); }
      catch { access = ''; message('The server restarted or is unavailable. Start it and pair again.', 'error'); }
    });
  }
  state();
})();

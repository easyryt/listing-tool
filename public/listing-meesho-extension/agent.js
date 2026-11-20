/* All browser operations are fixed here; AI never supplies executable code. */
(() => {
  if (globalThis.__browserTestAgent?.version === 3) return;
  const P = globalThis.BrowserTestPolicy;
  const MAX_IMAGE = 4 * 1024 * 1024;
  const visible = el => el.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const label = el => P.clean([...el.labels || []].map(x => x.innerText).join(' ') || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.name || el.id || 'Unlabelled field', 100);
  const type = el => el.tagName === 'TEXTAREA' ? 'textarea' : el.tagName === 'SELECT' ? 'select' : el.type;
  const fingerprint = el => JSON.stringify([el.tagName, type(el), el.name, el.id, label(el), el.getAttribute('accept'), el.form?.action]);
  let active = null;
  const executed = new Set();
  let busy = false;
  function inspect() {
    const refs = new Map(), fields = [], files = [];
    for (const el of document.querySelectorAll('input,textarea,select')) {
      if (!visible(el) || el.disabled || el.readOnly) continue;
      const data = { type: type(el), label: label(el), name: el.name };
      const isFile = data.type === 'file';
      if (!isFile && (!P.safeField(data) || fields.length >= 40)) continue;
      if (isFile && files.length >= 5) continue;
      const id = `${isFile ? 'image' : 'field'}-${refs.size + 1}`;
      refs.set(id, { el, fingerprint: fingerprint(el), value: el.value });
      if (isFile) files.push({ id, label: data.label, accept: P.clean(el.accept, 100) });
      else fields.push({ id, label: data.label, type: data.type, value: P.clean(el.value, 700), options: data.type === 'select' ? [...el.options].filter(o => !o.disabled).slice(0, 25).map(o => ({ value: o.value, label: o.text })) : [] });
    }
    const snapshot = { id: crypto.randomUUID(), origin: location.origin, title: P.clean(document.title, 100), fields, files };
    active = { snapshot, refs, href: location.href, created: Date.now() };
    return snapshot;
  }
  function reference(id) {
    const ref = active?.refs.get(id);
    if (!ref || !visible(ref.el) || ref.el.disabled || ref.el.readOnly || fingerprint(ref.el) !== ref.fingerprint || ref.el.value !== ref.value) throw new Error('A field changed. Inspect the page again before applying edits.');
    return ref.el;
  }
  function check(message) {
    if (!active || message.snapshotId !== active.snapshot.id || message.origin !== location.origin || active.href !== location.href || Date.now() - active.created > 300000) throw new Error('This page preview is stale. Inspect the page again.');
    if (!message.operationId || executed.has(message.operationId)) throw new Error('This action has already been attempted. Inspect before trying again.');
  }
  const pause = () => new Promise(resolve => setTimeout(resolve, 100));
  function captureLinks() {
    const images = [], seen = new Set();
    const add = (value, hint, kind) => {
      if (images.length >= 40 || typeof value !== 'string' || !value || value.length > 2048) return;
      let url;
      try { url = new URL(value, location.href); } catch { return; }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || seen.has(url.href)) return;
      seen.add(url.href); images.push({ url: url.href, label: P.clean(hint, 100), kind });
    };
    for (const el of document.querySelectorAll('img,a[href],input,textarea')) {
      if (!visible(el)) continue;
      if (el.tagName === 'IMG') add(el.currentSrc || el.src, el.alt || 'Page image', 'image');
      else if (el.tagName === 'A' && (/\.(png|jpe?g|webp)(?:[?#]|$)/i.test(el.href) || /image|upload|photo|download/i.test(el.innerText))) add(el.href, el.innerText, 'link');
      else if (['INPUT', 'TEXTAREA'].includes(el.tagName) && /(?:image|photo|upload).*(?:url|link)|(?:url|link).*(?:image|photo|upload)/i.test(label(el))) add(el.value, label(el), 'field');
    }
    let productTitle = '', sku = '';
    for (const el of document.querySelectorAll('input,textarea')) {
      if (!visible(el) || !P.safeField({ label: label(el), name: el.name, type: type(el) })) continue;
      if (/product.?title|product.?name|listing.?title/i.test(label(el))) productTitle ||= P.clean(el.value, 200);
      if (/sku|style.?id/i.test(label(el))) sku ||= P.clean(el.value, 100);
    }
    return { origin: location.origin, sourceUrl: location.origin + location.pathname, productTitle, sku, images };
  }
  async function run(message) {
    if (busy) throw new Error('A browser action is already running.');
    busy = true;
    try {
      if (message.type === 'inspect') return inspect();
      if (message.type === 'paste_link') {
        if (message.origin !== location.origin || message.sourceUrl !== location.origin + location.pathname) throw new Error('The page changed before the paste step. Inspect it again.');
        if (!message.operationId || executed.has(message.operationId)) throw new Error('This paste has already been attempted. Inspect before trying again.');
        let url;
        try { url = new URL(message.url); } catch { throw new Error('A valid image URL is required for paste.'); }
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.href.length > 2048) throw new Error('Only HTTP/HTTPS image links without credentials can be pasted.');
        const candidates = [...document.querySelectorAll('input,textarea')].filter(el => visible(el) && !el.disabled && !el.readOnly &&
          ['text', 'url', 'textarea'].includes(type(el)) && /(?:image|photo).*(?:url|link)|(?:url|link).*(?:image|photo)/i.test(label(el)) &&
          P.safeField({ label: label(el), name: el.name, type: type(el) === 'url' ? 'text' : type(el) }));
        if (candidates.length !== 1) return { pasted: false, message: candidates.length ? 'Multiple image-URL fields found; paste manually into the intended one.' : 'No writable product image-URL field found on this page.' };
        const el = candidates[0];
        if (el.value && el.value !== url.href) return { pasted: false, message: 'The image-URL field already has a different value; it was preserved.' };
        const copy = el.cloneNode(true); copy.value = url.href;
        if (copy.value !== url.href || !copy.checkValidity()) throw new Error('The image-URL field does not accept this link.');
        executed.add(message.operationId); active = null;
        const constructor = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement;
        Object.getOwnPropertyDescriptor(constructor.prototype, 'value').set.call(el, url.href);
        el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
        await pause();
        if (!el.isConnected || el.value !== url.href) throw new Error('The page did not retain the pasted URL. Inspect before retrying.');
        return { pasted: true, message: 'Image URL pasted and verified in ' + label(el) + '.' };
      }
      if (message.type === 'capture_links') {
        if (message.origin && message.origin !== location.origin) throw new Error('The selected tab changed destination. Inspect it again.');
        const href = location.href;
        const excluded = new Set(Array.isArray(message.excludeUrls) ? message.excludeUrls.slice(0, 40) : []);
        const deadline = Date.now() + Math.max(0, Math.min(Number(message.waitMs) || 0, 15000));
        let captured;
        do {
          if (location.href !== href) throw new Error('The page navigated while waiting for the upload. Inspect it again.');
          captured = captureLinks();
          captured.images = captured.images.filter(item => !excluded.has(item.url));
          if (captured.images.length || Date.now() >= deadline) return captured;
          await new Promise(resolve => setTimeout(resolve, 250));
        } while (true);
      }
      if (message.type === 'read_table') {
        const tables = [...document.querySelectorAll('table')].filter(visible).slice(0, 3).map(table =>
          [...table.rows].slice(0, 101).map(row => [...row.cells].slice(0, 20).map(cell => P.clean(cell.innerText, 300))));
        return { tables, note: 'Visible HTML tables only; up to 3 tables, 100 data rows each. Kept local.' };
      }
      check(message);
      if (message.type === 'fill') {
        const proposed = P.proposal({ action: 'fill', edits: message.edits, reason: '' }, P.snapshot(active.snapshot));
        const targets = proposed.edits.map(edit => {
          const el = reference(edit.fieldId);
          const copy = el.cloneNode(true); copy.value = edit.value;
          if (copy.value !== edit.value || !copy.checkValidity()) throw new Error(`Invalid value for ${label(el)}. Check the field’s format or limits.`);
          return { el, edit };
        });
        executed.add(message.operationId);
        for (const { el, edit } of targets) {
          reference(edit.fieldId);
          const constructor = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : el.tagName === 'SELECT' ? HTMLSelectElement : HTMLInputElement;
          Object.getOwnPropertyDescriptor(constructor.prototype, 'value').set.call(el, edit.value);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        active = null;
        await pause();
        if (targets.some(({ el, edit }) => !el.isConnected || el.value !== edit.value)) throw new Error('The page did not retain every edit. Some fields may have changed; inspect before continuing.');
        return { message: `Verified ${targets.length} field edit(s). Nothing was clicked or submitted.` };
      }
      if (message.type === 'upload') {
        const el = reference(message.fieldId), file = message.file;
        const baseline = captureLinks().images.map(item => item.url);
        if (el.type !== 'file' || !file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || typeof file.base64 !== 'string' || file.base64.length > Math.ceil(MAX_IMAGE / 3) * 4) throw new Error('Choose a PNG, JPG or WEBP image up to 4 MB.');
        const bytes = Uint8Array.from(atob(file.base64), c => c.charCodeAt(0));
        const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
        const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
        const webp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
        if (!bytes.length || bytes.length > MAX_IMAGE || !({ 'image/png': png, 'image/jpeg': jpg, 'image/webp': webp }[file.type])) throw new Error('Image contents do not match the selected file type.');
        const image = new File([bytes], P.clean(file.name, 120), { type: file.type });
        const accepts = el.accept.toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
        if (accepts.length && !accepts.some(x => x === 'image/*' || x === image.type || (x.startsWith('.') && image.name.toLowerCase().endsWith(x)))) throw new Error('This page does not accept that image type.');
        executed.add(message.operationId);
        const transfer = new DataTransfer(); transfer.items.add(image); el.files = transfer.files;
        el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
        active = null;
        await pause();
        if (!el.isConnected || el.files.length !== 1 || el.files[0].name !== image.name) throw new Error('The site did not retain the file. Use its normal upload button. Do not retry blindly.');
        return { baseline, message: 'Image placed in the file field. Waiting for the website’s resulting image link can verify the next step.' };
      }
      throw new Error('Unsupported browser operation.');
    } finally {
      if (message.type === 'fill' || message.type === 'upload') active = null;
      if (executed.size > 100) executed.delete(executed.values().next().value);
      busy = false;
    }
  }
  globalThis.__browserTestAgent = Object.freeze({ run, version: 3 });
})();

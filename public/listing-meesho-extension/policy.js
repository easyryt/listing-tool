/* Shared, packaged validation. No remotely supplied code or selectors. */
(() => {
  const sensitive = /password|passcode|secret|token|api.?key|otp|verification|credit|debit|bank|card.?number|account.?number|email|e-mail|phone|mobile.?number|address|customer|buyer|recipient|login|sign.?in|full.?name|first.?name|last.?name/i;
  const listing = /product|listing|title|description|sku|style.?id|category|generic|brand|material|colo[u]?r|quantity|inventory|stock|price|mrp|pack|variant|pattern|size|weight|hsn|gst/i;
  const clean = (value, max = 120) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
  function safeField(field) {
    const hint = `${field.label || ''} ${field.name || ''} ${field.type || ''}`;
    return !sensitive.test(hint) && listing.test(hint) && ['text', 'textarea', 'number', 'select'].includes(field.type);
  }
  function snapshot(input) {
    if (!input || typeof input !== 'object' || !Array.isArray(input.fields)) throw new Error('Inspect a supported page first.');
    const origin = new URL(input.origin).origin;
    if (!/^https?:\/\//.test(origin)) throw new Error('Only HTTP and HTTPS pages are supported.');
    return {
      id: clean(input.id, 80), origin, title: clean(input.title, 100),
      fields: input.fields.slice(0, 40).filter(safeField).map(f => ({
        id: clean(f.id, 30), label: clean(f.label, 100), type: f.type,
        options: f.type === 'select' ? (Array.isArray(f.options) ? f.options : []).slice(0, 25).map(o => ({ value: clean(o.value, 100), label: clean(o.label, 100) })) : []
      }))
    };
  }
  function proposal(input, view) {
    if (!input || !['fill', 'inspect', 'read_table', 'unsupported'].includes(input.action)) throw new Error('Unsupported action.');
    if (!Array.isArray(input.edits) || input.edits.length > 5) throw new Error('Use at most five field edits per step.');
    if (input.action === 'fill' && input.edits.length === 0) throw new Error('No field edits were proposed.');
    if (input.action !== 'fill' && input.edits.length) throw new Error('This action cannot contain edits.');
    const seen = new Set();
    const edits = input.edits.map(edit => {
      const field = view.fields.find(f => f.id === edit.fieldId);
      if (!field || seen.has(field.id) || typeof edit.value !== 'string' || edit.value.length > 700) throw new Error('Invalid or repeated field. Inspect the page again.');
      seen.add(field.id);
      if (field.type === 'select' && !field.options.some(o => o.value === edit.value)) throw new Error('The selected option is unavailable.');
      if (field.type === 'number' && (edit.value.trim() === '' || !Number.isFinite(Number(edit.value)))) throw new Error('This field needs a number.');
      return { fieldId: field.id, value: edit.value };
    });
    return { action: input.action, reason: clean(input.reason, 250), edits };
  }
  globalThis.BrowserTestPolicy = Object.freeze({ clean, safeField, snapshot, proposal });
})();

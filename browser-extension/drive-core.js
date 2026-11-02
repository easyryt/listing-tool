/* Fixed Google Drive adapter helpers. No OAuth tokens, cookies or private APIs. */
(() => {
  const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{10,200}$/.test(value);
  function isDrive(url) { try { const parsed = new URL(url); return parsed.origin === 'https://drive.google.com' && !parsed.username && !parsed.password; } catch { return false; } }
  function isMyDrive(url) { try { const parsed = new URL(url); return isDrive(url) && /^\/drive\/(?:u\/\d+\/)?my-drive\/?$/.test(parsed.pathname); } catch { return false; } }
  function trustedDashboard(url) { try { const parsed = new URL(url); return parsed.origin === 'http://127.0.0.1:4317' && parsed.pathname === '/' && !parsed.username && !parsed.password; } catch { return false; } }
  function fileLink(id) { if (!validId(id)) throw new Error('Drive did not expose a valid file ID.'); return `https://drive.google.com/file/d/${id}/view`; }
  function idFromLink(value) {
    try { const url = new URL(value); if (!isDrive(value) || url.username || url.password) return null; const match = url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]+)(?:\/|$)/); return match && validId(match[1]) ? match[1] : null; } catch { return null; }
  }
  function uniqueName(type, stamp, suffix) {
    const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[type];
    if (!extension || !/^[a-z0-9-]{6,40}$/i.test(suffix)) throw new Error('Unsupported test image.');
    return `browser-ai-drive-test-${stamp.replace(/[^0-9]/g, '').slice(0,14)}-${suffix.slice(0,8)}.${extension}`;
  }
  function decodeImage(file) {
    if (!file || typeof file.base64 !== 'string' || file.base64.length > 5592408 || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.base64)) throw new Error('Choose an image up to 4 MB.');
    const bytes = Uint8Array.from(atob(file.base64), value => value.charCodeAt(0));
    const png = bytes.length >= 24 && [137,80,78,71,13,10,26,10].every((value,index) => bytes[index] === value);
    const jpg = bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP';
    if (bytes.length > 4 * 1024 * 1024 || !({ 'image/png': png, 'image/jpeg': jpg, 'image/webp': webp }[file.type])) throw new Error('Image contents do not match PNG, JPG or WEBP.');
    return bytes;
  }
  function findUploadedFile(root, filename) {
    if (!/^browser-ai-drive-test-[a-z0-9.-]+\.(png|jpg|webp)$/i.test(filename)) throw new Error('Only this test run’s uniquely named image can be captured.');
    const found = new Map();
    const nodes = root.querySelectorAll('[role="gridcell"][data-id],[role="row"][data-id],a[href*="/file/d/"]');
    for (const node of [...nodes].slice(0,1500)) {
      if (!node.isConnected || !node.getClientRects().length) continue;
      const hint = `${node.getAttribute('aria-label') || ''} ${node.getAttribute('data-tooltip') || ''} ${node.textContent || ''}`;
      if (!hint.includes(filename)) continue;
      const id = node.getAttribute('data-id') || idFromLink(node.getAttribute('href'));
      if (validId(id)) found.set(id, { id, url: fileLink(id), filename });
    }
    if (found.size > 1) throw new Error('Multiple Drive files matched this test name. Review the upload manually; no link was saved.');
    return [...found.values()][0] || null;
  }
  globalThis.BrowserTestDrive = Object.freeze({ isDrive, isMyDrive, trustedDashboard, fileLink, idFromLink, uniqueName, decodeImage, findUploadedFile });
})();

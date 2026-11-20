(() => {
  class BrowserTestApi {
    constructor({ fetchImpl = globalThis.fetch.bind(globalThis), getToken, onSession, extensionId = '', timeoutMs = 30000 }) {
      this.fetch = fetchImpl; this.getToken = getToken; this.onSession = onSession; this.extensionId = extensionId; this.timeoutMs = timeoutMs;
    }
    async request(path, data, anonymous = false, refreshed = false) {
      if (!/^\/api\/[a-z-]+$/.test(path)) throw new Error('Unsupported local API endpoint.');
      const headers = { 'Content-Type': 'application/json' };
      if (this.extensionId) headers['X-Browser-Extension'] = this.extensionId;
      if (!anonymous) headers.Authorization = `Bearer ${this.getToken()}`;
      const response = await this.fetch('http://127.0.0.1:4317' + path, { method: data ? 'POST' : 'GET', headers, body: data ? JSON.stringify(data) : undefined, credentials: 'omit', signal:globalThis.AbortSignal?.timeout?.(this.timeoutMs) });
      const result = await response.json();
      if (response.status === 401 && !this.extensionId && !anonymous && !refreshed) {
        const session = await this.request('/api/session', undefined, true, true);
        this.onSession(session);
        // Reading can safely resume. Never replay a write or paid request automatically.
        if (!data) return this.request(path, undefined, false, true);
        throw new Error('The server restarted. The dashboard reconnected; review and run this step again. Nothing was automatically retried.');
      }
      if (!response.ok) throw new Error(result.error || `Local server returned HTTP ${response.status}.`);
      return result;
    }
  }
  globalThis.BrowserTestApi = BrowserTestApi;
})();

(function(root) {
  async function refreshPickerData(api, callbacks, { loadPopular = true, loadInstalled = true, forceRefresh = false } = {}) {
    const jobs = [];
    const load = (kind, fetch) => {
      const job = Promise.resolve().then(fetch).then(data => {
        if (!Array.isArray(data)) throw new Error('Uygulama listesi doğrulanamadı');
        callbacks[kind](data);
      }).catch(error => callbacks.error(kind, error));
      jobs.push(job);
    };
    // Start the running-process request independently of registry/start-menu scans.
    load('running', () => api.getRunningApps());
    if (loadPopular) load('popular', () => api.getPopularApps());
    if (loadInstalled) load('installed', () => api.getInstalledApps(forceRefresh));
    await Promise.all(jobs);
  }
  if (typeof module !== 'undefined') module.exports = { refreshPickerData };
  else root.voldenaPickerData = { refreshPickerData };
})(typeof window !== 'undefined' ? window : globalThis);

// Large Unity files are split for hosting; each payload is cached by its content hash.
(() => {
  const manifest = {"files":[{"url":"Build/AutoTarget-20261023-171248.data.unityweb","size":317059424,"parts":["Build/AutoTarget-20261023-171248.data.unityweb.part000","Build/AutoTarget-20261023-171248.data.unityweb.part001","Build/AutoTarget-20261023-171248.data.unityweb.part002","Build/AutoTarget-20261023-171248.data.unityweb.part003"]}],"assets":[{"url":"Build/AutoTarget-20261023-171248.data.unityweb.part000","hash":"b5dd0a234fc95d79666351bc31d72923886e4c6e70c5d74574f291c17fe7756d"},{"url":"Build/AutoTarget-20261023-171248.data.unityweb.part001","hash":"bed4059f3cf66fc83995e05cd75a622e6e65066575006c15c95c63beca20612c"},{"url":"Build/AutoTarget-20261023-171248.data.unityweb.part002","hash":"3b3dc4291b5c991e74ab49216cc05d341afb386ffdb89ce9910c3fb32cee1ec7"},{"url":"Build/AutoTarget-20261023-171248.data.unityweb.part003","hash":"c99b3efcd63a3746bdf84cb4fcc3a55632c9af86040ff22976e25b4b5d65960f"},{"url":"Build/AutoTarget-20261023-171248.framework.js.unityweb","hash":"764a2868e872be846efeb8d2b230e0e6262b29cac0a5b30f41a9fccad08ffe9e"},{"url":"Build/AutoTarget-20261023-171248.loader.js","hash":"cfa3cf545779e5ff972dc191a197d5bdcb464684a9c5e5cef3c9e674ee970ff3"},{"url":"Build/AutoTarget-20261023-171248.wasm.unityweb","hash":"527c6b45a8be3f056c9b9dfdf5ba3ed980c482362274d7ba23dffe275f4c3dd0"},{"url":"Build/AutoTarget-20261023-171248.data.unityweb","hash":"39b7ebc1ca9a8cf0cd631cb9d748bb6affc59a1b9a87fdc06263494a4d409845"}]};
  const fetchFile = window.fetch.bind(window);
  const absolute = url => new URL(url, document.baseURI).href;
  const assets = new Map((manifest.assets || []).map(asset => [absolute(asset.url), asset]));
  const plainUrl = resource => {
    const url = new URL(resource instanceof Request ? resource.url : String(resource), document.baseURI);
    url.searchParams.delete('danjeeHash');
    return url.href;
  };
  window.danjeeBuildUrl = resource => {
    const url = new URL(resource, document.baseURI);
    const asset = assets.get(plainUrl(url.href));
    if (asset) url.searchParams.set('danjeeHash', asset.hash);
    return url.href;
  };
  const files = new Map(manifest.files.map(file => [absolute(file.url), file]));
  // Scope the cache to this application, including when hosted in a Pages subdirectory.
  const cacheName = 'danjee-build-v1:' + new URL('.', document.baseURI).pathname;
  const cacheReady = (async () => {
    try { return window.isSecureContext && window.caches ? await caches.open(cacheName) : null; }
    catch { return null; } // Private browsing / storage restrictions must not prevent play.
  })();
  // Exposed for diagnostics and for waiting until writes finish before closing the page.
  const pending = new Set();
  window.danjeeCacheWrites = pending;
  async function payload(resource, init) {
    const asset = assets.get(plainUrl(resource));
    if (!asset) return fetchFile(resource, init);
    const request = new Request(window.danjeeBuildUrl(resource), {
      ...(resource instanceof Request ? {
        headers: resource.headers, credentials: resource.credentials, signal: resource.signal
      } : {}), ...init
    });
    if (request.method !== 'GET' || request.headers.has('range')) return fetchFile(request);
    request.signal.throwIfAborted();
    const cache = await cacheReady;
    if (cache) {
      try {
        const hit = await cache.match(request);
        request.signal.throwIfAborted();
        if (hit) return hit;
      } catch (error) { if (request.signal.aborted) throw error; }
    }
    const response = await fetchFile(request);
    if (cache && response.ok && response.status === 200) {
      const write = (async () => {
        try {
          await cache.put(request, response.clone());
          // Retire older copies only after the new payload was saved successfully.
          for (const key of await cache.keys()) {
            if (plainUrl(key) === plainUrl(request) && key.url !== request.url) await cache.delete(key);
          }
        }
        catch (error) { console.warn('Danjee build cache unavailable:', error.message); }
      })();
      pending.add(write);
      write.finally(() => pending.delete(write));
    }
    return response;
  }
  window.fetch = async function(resource, init) {
    const file = files.get(plainUrl(resource));
    const method = init?.method || (resource instanceof Request ? resource.method : 'GET');
    if (!file || method.toUpperCase() !== 'GET') return payload(resource, init);
    let index = 0, reader, cancelled = false;
    const abort = new AbortController();
    const signal = init?.signal || (resource instanceof Request ? resource.signal : null);
    const onAbort = () => abort.abort();
    if (signal?.aborted) abort.abort();
    else signal?.addEventListener('abort', onAbort, {once: true});
    const clean = () => signal?.removeEventListener('abort', onAbort);
    const stream = new ReadableStream({
      async pull(controller) {
        try {
          while (!cancelled) {
            if (!reader) {
              if (index >= file.parts.length) { clean(); controller.close(); return; }
              const response = await payload(absolute(file.parts[index++]), {...init, signal: abort.signal});
              if (!response.ok) throw new Error(`Unity chunk: HTTP ${response.status}`);
              reader = response.body.getReader();
            }
            const {done, value} = await reader.read();
            if (done) { reader.releaseLock(); reader = null; continue; }
            controller.enqueue(value); return;
          }
        } catch (error) { clean(); controller.error(error); }
      },
      cancel() { cancelled = true; clean(); abort.abort(); return reader?.cancel(); }
    });
    return new Response(stream, {headers: {'Content-Type':'application/octet-stream', 'Content-Length':String(file.size)}});
  };
})();

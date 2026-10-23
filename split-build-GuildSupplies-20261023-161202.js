// Large Unity files are split for hosting; each payload is cached by its content hash.
(() => {
  const manifest = {"files":[{"url":"Build/GuildSupplies-20261023-161202.data.unityweb","size":317059931,"parts":["Build/GuildSupplies-20261023-161202.data.unityweb.part000","Build/GuildSupplies-20261023-161202.data.unityweb.part001","Build/GuildSupplies-20261023-161202.data.unityweb.part002","Build/GuildSupplies-20261023-161202.data.unityweb.part003"]}],"assets":[{"url":"Build/GuildSupplies-20261023-161202.data.unityweb.part000","hash":"48e81bd28509dc99ca0d043d9ab4ee356def721936eb707899733b89f8a223ec"},{"url":"Build/GuildSupplies-20261023-161202.data.unityweb.part001","hash":"e59ff693e37f017eb6d1880a0b4fb5b93d98dc8bf8d25ee7d94588acd3601815"},{"url":"Build/GuildSupplies-20261023-161202.data.unityweb.part002","hash":"3de014302da3c0bcd8f4b0a50c1b5d4bb6502eb90896f643bab3c2b3f5d1d4b6"},{"url":"Build/GuildSupplies-20261023-161202.data.unityweb.part003","hash":"2fc722fb9d210b4d3be901e77850772ca12fca42cae8d570dedb2f07aa492f05"},{"url":"Build/GuildSupplies-20261023-161202.framework.js.unityweb","hash":"c1a8e40192e4b7bdcbd6fa2c63ac3222356775bf3ff80bedf1fe982acafb89f1"},{"url":"Build/GuildSupplies-20261023-161202.loader.js","hash":"d525f8b19727f58e93702a7d0f991594eae808fad8047d094a6f41c2b48071a5"},{"url":"Build/GuildSupplies-20261023-161202.wasm.unityweb","hash":"647a8fcf90aa61f9085fe015b6bc0fdfc6031f5cc1642ff6d0ce63c55b023ba7"},{"url":"Build/GuildSupplies-20261023-161202.data.unityweb","hash":"f9ae5881c071de1b156b591718eec6dd64cac3b90962c86af23b0b2685dd3274"}]};
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

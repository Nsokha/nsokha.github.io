// Large Unity files are split for hosting; each payload is cached by its content hash.
(() => {
  const manifest = {"files":[{"url":"Build/GuildUI-20261023-100149.data.unityweb","size":313287807,"parts":["Build/GuildUI-20261023-100149.data.unityweb.part000","Build/GuildUI-20261023-100149.data.unityweb.part001","Build/GuildUI-20261023-100149.data.unityweb.part002","Build/GuildUI-20261023-100149.data.unityweb.part003"]}],"assets":[{"url":"Build/GuildUI-20261023-100149.data.unityweb.part000","hash":"7c9f4401fc95755c9aac66697e08e1749f16f645f0f5a35be05f211f9a172e35"},{"url":"Build/GuildUI-20261023-100149.data.unityweb.part001","hash":"675e6a5236dc9b3d6c73d1f140c4dbd11edf24308808d909fd11d6a521a0fecd"},{"url":"Build/GuildUI-20261023-100149.data.unityweb.part002","hash":"00b6d65db3b363b21f9c52ff09a9fe1bc98496e7196c6c6576b17807e5a375e6"},{"url":"Build/GuildUI-20261023-100149.data.unityweb.part003","hash":"43ef4339abbd1094930d1b860f960a3340b99cd119648becd75da2ccea2266cb"},{"url":"Build/GuildUI-20261023-100149.framework.js.unityweb","hash":"1cbca6e5fce289cb4e59746b585dab87e37ba871137adf7209f4c718e9a2d55b"},{"url":"Build/GuildUI-20261023-100149.loader.js","hash":"8609a674c988e082995362981c12b78d4714f473532ab30d6bf2df3adfc3a823"},{"url":"Build/GuildUI-20261023-100149.wasm.unityweb","hash":"0d6c4320941378cec57e75b879ee6a26f333ad6ae12b4dfd63ee0f6edd4647d6"},{"url":"Build/GuildUI-20261023-100149.data.unityweb","hash":"054f5728bcb76ea2f0955fb6721ab24d1739bf78c3c95075f59d9db7f4b65109"}]};
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

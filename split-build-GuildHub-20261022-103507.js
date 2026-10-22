// Large Unity files are split for hosting; each payload is cached by its content hash.
(() => {
  const manifest = {"files":[{"url":"Build/GuildHub-20261022-103507.data.unityweb","size":228592755,"parts":["Build/GuildHub-20261022-103507.data.unityweb.part000","Build/GuildHub-20261022-103507.data.unityweb.part001","Build/GuildHub-20261022-103507.data.unityweb.part002"]}],"assets":[{"url":"Build/GuildHub-20261022-103507.data.unityweb.part000","hash":"6c12a34c981c1becefccb2cfd67f728254e41455be6402712087a27d7107cb6f"},{"url":"Build/GuildHub-20261022-103507.data.unityweb.part001","hash":"0e19179bc74ccd1356f0419567d230949f48243cc3a3186a28bc6a04ec144f63"},{"url":"Build/GuildHub-20261022-103507.data.unityweb.part002","hash":"b46138adc09282dd67b96ee9786c5c70ddf15697c78cda0ca28c5670ea0c6cbc"},{"url":"Build/GuildHub-20261022-103507.framework.js.unityweb","hash":"b889be22121d5cb12823f1056a57677378748c321097ead624d40c467f82dbec"},{"url":"Build/GuildHub-20261022-103507.loader.js","hash":"ac829163a9013da3c55c863698fe2804ae9e6b9e34b2244886f75d982cbf56bc"},{"url":"Build/GuildHub-20261022-103507.wasm.unityweb","hash":"3743f53b8dec0eeee348f68407869721747adac13c9ce7562ed4165282fbe84e"},{"url":"Build/GuildHub-20261022-103507.data.unityweb","hash":"dcbc61a24a49431d302ba8ca337e43af53cea06c35b28e09387d70b082c38494"}]};
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

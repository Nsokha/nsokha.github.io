// Large Unity files are split for hosting; each payload is cached by its content hash.
(() => {
  const manifest = {"files":[{"url":"Build/GuildMenus-20261024-105755.data.unityweb","size":325633159,"parts":["Build/GuildMenus-20261024-105755.data.unityweb.part000","Build/GuildMenus-20261024-105755.data.unityweb.part001","Build/GuildMenus-20261024-105755.data.unityweb.part002","Build/GuildMenus-20261024-105755.data.unityweb.part003"]}],"assets":[{"url":"Build/GuildMenus-20261024-105755.data.unityweb.part000","hash":"1b796cddf874e3504c501538128e0ebdc9de60b3d23ac3e96a1a716590b915fd"},{"url":"Build/GuildMenus-20261024-105755.data.unityweb.part001","hash":"e5cc853da97c591eea77c132460b3103d3267914ac228fc3dfaf4cf433d765d8"},{"url":"Build/GuildMenus-20261024-105755.data.unityweb.part002","hash":"ea0db6c25e6e82e17496fa5ef31bbf583a32ca841dda03f96050b96c2bdc9c9f"},{"url":"Build/GuildMenus-20261024-105755.data.unityweb.part003","hash":"f6753273986d88ef0f7f5545f7e6794d969e3d02eae10132f956f2936261c27f"},{"url":"Build/GuildMenus-20261024-105755.framework.js.unityweb","hash":"f7e2eb109321680ffe535afd6563138d72d3a6170f3c22f888556ac35bf94926"},{"url":"Build/GuildMenus-20261024-105755.loader.js","hash":"e187044c41bcd1fee6ae0bac71b66e9f1bbb73f8ea5d3f4be6cccf0054824478"},{"url":"Build/GuildMenus-20261024-105755.wasm.unityweb","hash":"84eeffe1ccb804191f11c0da2b0b4de361946db6e103cbcd8c38e1eef557fb2e"},{"url":"Build/GuildMenus-20261024-105755.data.unityweb","hash":"4abe34523fd0cc869b707c5f32d6ee3f002abc17f66ff678e8f1a46d951a0d29"}]};
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

// Large Unity files are stored in chunks so the prebuilt client fits in an ordinary Git repository.
(() => {
  const manifest = {"files":[{"url":"Build/ForestCampOnline-20261021-133302.data.unityweb","size":201244289,"parts":["Build/ForestCampOnline-20261021-133302.data.unityweb.part000","Build/ForestCampOnline-20261021-133302.data.unityweb.part001","Build/ForestCampOnline-20261021-133302.data.unityweb.part002"]}]};
  const fetchFile = window.fetch.bind(window);
  const files = new Map(manifest.files.map(file => [new URL(file.url, document.baseURI).href, file]));
  window.fetch = async function(resource, init) {
    const url = new URL(resource instanceof Request ? resource.url : String(resource), document.baseURI).href;
    const file = files.get(url);
    if (!file) return fetchFile(resource, init);
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
              const response = await fetchFile(new URL(file.parts[index++], document.baseURI), {...init, signal: abort.signal});
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

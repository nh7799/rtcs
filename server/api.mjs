import { compileProject, compilerStatus } from './compiler.mjs';
import { importZip, MAX_ARCHIVE } from './project.mjs';
import { armArtifact, buildPi, piStatus } from './pi-build.mjs';
import { piRuns } from './pi-run.mjs';
import { piOsLab } from './pi-os.mjs';

async function readBody(request, limit) {
  const chunks = [];
  let size = 0;
  if (Number(request.headers['content-length']) > limit) throw new Error('Request exceeds the upload limit.');
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) {
      // Preserve the HTTP response and discard the rest of the request.
      request.resume();
      throw new Error('Request exceeds the upload limit.');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function localApi() {
  let compiling = false;
  let status;
  const runs = piRuns();
  const osLab = piOsLab();
  const middleware = async (request, response, next) => {
    const route = request.url?.split('?')[0];
    if (!route?.startsWith('/api/')) return next();
    const send = (code, data) => {
      response.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(JSON.stringify(data));
    };
    const host = request.headers.host || '';
    const origin = request.headers.origin;
    if (!/^127\.0\.0\.1(?::[0-9]{1,5})?$/.test(host) || (origin && origin !== 'http://' + host) ||
        request.headers['sec-fetch-site'] === 'cross-site') {
      return send(403, { ok: false, diagnostics: 'The compiler API accepts same-origin localhost requests only.' });
    }
    try {
      if (request.method === 'GET' && route === '/api/status') {
        status ??= compilerStatus();
        return send(200, await status);
      }
      if (request.method === 'GET' && route === '/api/pi/status') return send(200, await piStatus());
      if (request.method === 'GET' && route === '/api/pios/status') return send(200, await osLab.status());
      if (request.method === 'GET' && route.startsWith('/api/pi/artifact/')) {
        const build = armArtifact(route.slice('/api/pi/artifact/'.length));
        if (!build) return send(404, { ok: false, diagnostics: 'Build expired. Run make again.' });
        response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="initio-simulator-armhf"', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        return response.end(build.bytes);
      }
      if (request.method !== 'POST') return send(404, { ok: false, diagnostics: 'Route unavailable.' });
      if (route === '/api/import') {
        if (request.headers['content-type'] !== 'application/zip') return send(415, { ok: false, diagnostics: 'Expected a ZIP archive.' });
        const files = await importZip(await readBody(request, MAX_ARCHIVE));
        return send(200, { ok: true, files });
      }
      if (request.headers['content-type'] !== 'application/json') return send(415, { ok: false, diagnostics: 'Expected a JSON source project.' });
      if (['/api/pios/action', '/api/pios/stage'].includes(route)) {
        if (origin !== 'http://' + host) return send(403, { ok: false, diagnostics: 'Open the Pi OS controls from the local app.' });
        const data = JSON.parse(await readBody(request, route.endsWith('/stage') ? 4 * 1024 * 1024 : 1024));
        return send(200, route.endsWith('/stage') ? await osLab.stage(data) : await osLab.action(data.action));
      }
      if (['/api/pi/start', '/api/pi/step', '/api/pi/stop'].includes(route)) {
        const data = JSON.parse(await readBody(request, 16 * 1024));
        if (route === '/api/pi/start') return send(200, await runs.start(data));
        if (route === '/api/pi/step') return send(200, await runs.step(data));
        runs.stop(data.runId);
        return send(200, { ok: true });
      }
      if (!['/api/compile', '/api/pi/build'].includes(route)) return send(404, { ok: false, diagnostics: 'Route unavailable.' });
      if (compiling) return send(409, { ok: false, diagnostics: 'Another build is in progress.' });
      compiling = true;
      try {
        const input = JSON.parse(await readBody(request, 4 * 1024 * 1024));
        const build = route === '/api/pi/build' ? buildPi : compileProject;
        const result = await build(input.files, { syntaxOnly: input.syntaxOnly === true, strict: input.strict === true });
        return send(result.ok ? 200 : 422, result);
      } finally { compiling = false; }
    } catch (error) {
      return send(400, { ok: false, diagnostics: error.message || 'Local request failed.' });
    }
  };
  function bind(server) {
    server.middlewares.use(middleware);
    osLab.bind(server.httpServer);
    server.httpServer?.once('close', () => { runs.close(); void osLab.close(); });
  }
  return { name: 'initio-local-compiler', configureServer: bind, configurePreviewServer: bind, closeBundle: osLab.close };
}

/* eslint-disable @typescript-eslint/no-require-imports -- Local Node service. */
const { createServer } = require('node:http');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const { createReadStream, createWriteStream } = require('node:fs');
const { mkdtemp, open, rm, stat } = require('node:fs/promises');
const { networkInterfaces, tmpdir } = require('node:os');
const { join } = require('node:path');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const QRCode = require('qrcode');
const run = promisify(execFile);

const MAX_BYTES = 100 * 1024 * 1024;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const DESKTOP_PORT = 3222;
// Keep this separate from the laptop-only control port. Some Windows network
// stacks reserve 3221 even when no visible process owns it.
const PHONE_PORT = 3223;
const DESKTOP_ORIGINS = new Set([
  'http://localhost:3000', 'http://127.0.0.1:3000',
  'http://localhost:3001', 'http://127.0.0.1:3001',
]);
const newSecret = () => randomBytes(24).toString('base64url');
const validSecret = /^[\w-]{32}$/;
const privateIP = /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)/;
const torchActions = new Set(['torch-on', 'torch-off']);

function localInterfaces() {
  return Object.entries(networkInterfaces()).flatMap(([name, interfaces]) =>
    interfaces.filter(item => !item.internal && item.family === 'IPv4' && privateIP.test(item.address))
      .map(({ address, netmask }) => ({ name, address, netmask })),
  ).sort((a, b) => Number(/wi-?fi|wireless|wlan/i.test(b.name)) - Number(/wi-?fi|wireless|wlan/i.test(a.name)));
}

function sameSubnet(remote, address, netmask) {
  if (!remote || !privateIP.test(remote)) return false;
  const octets = remote.split('.');
  const local = address.split('.');
  return netmask.split('.').every((mask, index) => (Number(octets[index]) & Number(mask)) === (Number(local[index]) & Number(mask)));
}

function authorized(request, secret) {
  const value = request.headers.authorization?.slice(7);
  return !!(secret && request.headers.authorization?.startsWith('Bearer ') && validSecret.test(value) && timingSafeEqual(Buffer.from(value), Buffer.from(secret)));
}

function reply(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

function problem(status, message) {
  return Object.assign(new Error(message), { status });
}

function snapshot(session) {
  return { phase: session.phase, message: session.message, take: session.take?.id, kind: session.take?.kind, torch: session.torch };
}

async function verifyPhoto(path) {
  const file = await open(path, 'r');
  try {
    const signature = Buffer.alloc(3);
    const { bytesRead } = await file.read(signature, 0, signature.length, 0);
    if (bytesRead !== 3 || !signature.equals(Buffer.from([255, 216, 255]))) throw problem(415, 'The phone did not return a valid JPG photo. Take another picture.');
  } finally { await file.close(); }
}

async function mediaBrand(path) {
  const handle = await open(path, 'r');
  try {
    const header = Buffer.alloc(12);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead !== 12 || header.toString('ascii', 4, 8) !== 'ftyp') throw problem(415, 'The phone did not return a valid video. Record a new take.');
    return header.toString('ascii', 8, 12);
  } finally { await handle.close(); }
}

async function prepareMp4(source, directory, signal) {
  if (await mediaBrand(source) !== 'qt  ') return source;
  const ffmpeg = require('ffmpeg-static');
  if (!ffmpeg) throw problem(415, 'This laptop cannot package the iPhone recording as MP4.');
  const output = join(directory, 'evidence.mp4');
  try {
    await run(ffmpeg, [
      '-nostdin', '-v', 'error', '-y', '-protocol_whitelist', 'file', '-f', 'mov', '-i', source,
      '-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy', '-movflags', '+faststart', output,
    ], { timeout: 45_000, windowsHide: true, signal });
  } catch { throw problem(415, 'Could not package the iPhone recording as MP4. Record a new take.'); }
  await mediaBrand(output);
  return output;
}

async function sendMedia(response, path, bytes, type = 'video/mp4') {
  response.writeHead(200, { 'Content-Type': type, 'Content-Length': bytes, 'Cache-Control': 'no-store' });
  await pipeline(createReadStream(path), response);
}

async function trimRecording(response, take, params) {
  const start = Number(params.get('start'));
  const end = Number(params.get('end'));
  if (!params.get('start') || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > 3600 || end - start < 0.095) {
    throw problem(400, 'Choose a start and end at least 0.1 seconds apart.');
  }
  if (take.trim) throw problem(409, 'A trim is already in progress.');
  const controller = new AbortController();
  take.trim = controller;
  const path = join(take.directory, `trim-${newSecret()}.mp4`);
  const ffmpeg = require('ffmpeg-static');
  if (!ffmpeg) { take.trim = undefined; throw problem(503, 'Trimming is unavailable on this laptop. You can use the original.'); }
  try {
    await run(ffmpeg, [
      '-nostdin', '-v', 'error', '-protocol_whitelist', 'file', '-f', 'mov', '-ss', start.toFixed(3), '-i', take.video,
      '-t', (end - start).toFixed(3), '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'veryfast',
      '-crf', '20', '-c:a', 'aac', '-abort_on', 'empty_output_stream', '-movflags', '+faststart', path,
    ], { timeout: 120_000, windowsHide: true, signal: controller.signal });
    const { size } = await stat(path);
    if (size > MAX_BYTES) throw problem(413, 'The trimmed clip exceeds 100 MB. Choose a shorter section.');
    await sendMedia(response, path, size);
  } catch (error) {
    if (!response.headersSent) throw problem(error.status || 422, error.status ? error.message : 'Could not trim that range. Try a different range or use the original.');
  } finally {
    take.trim = undefined;
    await rm(path, { force: true }).catch(() => {});
  }
}

function createCameraBridge({ interfaces = localInterfaces, now = Date.now } = {}) {
  let session;

  function resetTake(target) {
    const take = target.take;
    target.take = undefined;
    take?.receive?.abort();
    take?.trim?.abort();
    if (take?.directory) void rm(take.directory, { recursive: true, force: true }).catch(() => {});
  }

  function discard(target) {
    if (session === target) session = undefined;
    if (target) resetTake(target);
  }

  function returnToIdle(target, message) {
    resetTake(target);
    target.phase = target.phoneReady ? 'ready' : 'connecting';
    target.message = message;
  }

  function beginTake(target, kind, startedOnPhone = false) {
    if (target.phase !== 'ready') throw problem(409, 'Finish the current capture first.');
    target.take = { id: newSecret(), kind, startedOnPhone };
    target.phase = kind === 'photo' ? 'photographing' : 'starting';
    target.commandAt = now();
    target.message = undefined;
  }

  function stopRecording(target, take) {
    if (take.kind !== 'video' || !['recording', 'stopping', 'transferring', 'received'].includes(target.phase)) {
      throw problem(409, 'The phone is not recording.');
    }
    if (target.phase === 'recording') {
      target.phase = 'stopping';
      target.commandAt = now();
    }
  }

  function setTorch(target, action) {
    if (!target.phoneReady || typeof target.torch !== 'boolean') throw problem(409, 'The phone camera is not ready for flashlight control.');
    target.torch = action === 'torch-on';
  }

  function refresh() {
    if (!session) return;
    const time = now();
    if (!session.phone && time - session.created > 2 * 60_000) { discard(session); return; }
    if (time - Math.max(session.desktopSeen, session.phoneSeen || 0) > 12 * 60 * 60_000) { discard(session); return; }
    if (session.phoneReady && session.phase !== 'transferring' && time - session.phoneSeen > 15_000) {
      session.phoneReady = false;
      if (session.phase !== 'received') returnToIdle(session, 'Open Web Camera on the phone to resume.');
    }
    if (!session.take?.startedOnPhone && ['starting', 'recording'].includes(session.phase) && time - session.desktopSeen > 45_000) {
      returnToIdle(session, 'The laptop page closed during recording. Start a new take.');
    }
    const transitionLimit = { starting: 15_000, stopping: 30_000, photographing: 15_000 }[session.phase];
    if (transitionLimit && time - session.commandAt > transitionLimit) {
      returnToIdle(session, 'The phone did not finish the last action. Start a new take.');
    }
  }

  async function desktop(request, response) {
    const origin = request.headers.origin;
    if (!DESKTOP_ORIGINS.has(origin)) throw problem(403, 'Open the claims tool on this laptop.');
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    if (request.method === 'OPTIONS') {
      response.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST, DELETE', 'Access-Control-Allow-Headers': 'Authorization, X-Camera-Take' });
      response.end();
      return;
    }
    const { method } = request;
    const url = new URL(request.url, 'http://localhost');
    if (method === 'POST' && url.pathname === '/session') {
      if (session) throw problem(409, 'A phone camera session is open. Use the tab that paired it or disconnect from the phone.');
      const addresses = interfaces();
      if (!addresses.length) throw problem(503, 'Connect the laptop to a private Wi-Fi or Ethernet network first.');
      const current = { id: newSecret(), controller: newSecret(), scan: newSecret(), phase: 'waiting', created: now(), desktopSeen: now(), addresses };
      session = current;
      try {
        const codes = await Promise.all(addresses.map(async ({ name, address }) => {
          const params = new URLSearchParams({ ip: address, port: String(PHONE_PORT), id: current.id, code: current.scan });
          const qr = await QRCode.toDataURL(`webcamera://pair?${params}`, { width: 256, margin: 3 });
          return { name, address, qr };
        }));
        return reply(response, 201, { id: current.id, controller: current.controller, codes });
      } catch (error) { discard(current); throw error; }
    }

    const match = url.pathname.match(/^\/session\/([\w-]{32})(?:\/(start|stop|photo|video|image|trim|release|torch-on|torch-off))?$/);
    const current = session;
    if (!match || !current || match[1] !== current.id || !authorized(request, current.controller)) throw problem(404, 'Camera session ended. Create a new pairing code.');
    current.desktopSeen = now();
    const action = match[2];
    if (!action && method === 'DELETE') { discard(current); return reply(response, 200, {}); }
    if (!action && method === 'GET') return reply(response, 200, snapshot(current));
    if (['start', 'photo'].includes(action) && method === 'POST') {
      beginTake(current, action === 'photo' ? 'photo' : 'video');
    } else if (torchActions.has(action) && method === 'POST') {
      setTorch(current, action);
    } else {
      const take = current.take;
      if (!take || request.headers['x-camera-take'] !== take.id) throw problem(409, 'That recording is no longer active.');
      if (action === 'stop' && method === 'POST') stopRecording(current, take);
      else if (action === 'video' && method === 'GET' && current.phase === 'received' && take.kind === 'video') return sendMedia(response, take.video, take.bytes);
      else if (action === 'image' && method === 'GET' && current.phase === 'received' && take.kind === 'photo') return sendMedia(response, take.image, take.bytes, 'image/jpeg');
      else if (action === 'trim' && method === 'POST' && current.phase === 'received' && take.kind === 'video') return trimRecording(response, take, url.searchParams);
      else if (action === 'release' && method === 'POST' && current.phase === 'received' && !take.trim) returnToIdle(current);
      else throw problem(409, 'The phone is not ready for that action.');
    }
    return reply(response, 200, snapshot(current));
  }

  async function receiveTake(request, current, take) {
    if (current.phase === 'received') return;
    const photo = take.kind === 'photo';
    const limitBytes = photo ? MAX_PHOTO_BYTES : MAX_BYTES;
    const tooLarge = photo ? 'The photo exceeds 10 MB.' : 'The recording exceeds 100 MB.';
    const waitingFor = photo ? 'photographing' : 'stopping';
    if (current.phase !== waitingFor || take.receive) throw problem(409, 'The laptop is not ready for this capture.');
    const declaredSize = Number(request.headers['content-length']);
    if (declaredSize > limitBytes) {
      returnToIdle(current, tooLarge);
      throw problem(413, tooLarge);
    }
    const receive = new AbortController();
    take.receive = receive;
    current.phase = 'transferring';
    let bytes = 0, directory;
    const limit = new Transform({ transform(chunk, _, callback) {
      bytes += chunk.length;
      if (bytes > limitBytes) callback(problem(413, tooLarge));
      else callback(null, chunk);
    } });
    try {
      directory = await mkdtemp(join(tmpdir(), 'listing-phone-camera-'));
      const source = join(directory, 'original');
      await pipeline(request, limit, createWriteStream(source), { signal: receive.signal });
      let media = source;
      if (photo) await verifyPhoto(source);
      else media = await prepareMp4(source, directory, receive.signal);
      const result = await stat(media);
      if (session !== current || current.take !== take || receive.signal.aborted) throw problem(410, 'Capture ended.');
      if (result.size > limitBytes) throw problem(413, tooLarge);
      take.directory = directory;
      if (photo) take.image = media;
      else take.video = media;
      take.bytes = result.size;
      current.phase = 'received';
    } catch (error) {
      if (directory) await rm(directory, { recursive: true, force: true });
      if (session === current && current.take === take && current.phase === 'transferring') {
        if (error.status) returnToIdle(current, error.message);
        else { current.phase = waitingFor; current.commandAt = now(); }
        current.phoneSeen = now();
      }
      throw error;
    } finally { take.receive = undefined; }
  }

  async function phone(request, response) {
    if (request.headers.origin) throw problem(403, 'Use the Web Camera app to pair.');
    const match = request.url?.match(/^\/phone\/([\w-]{32})(?:\/(pair|ready|start|stop|recording|photo|video|image|failed|pause|disconnect|torch-on|torch-off))?$/);
    const current = session;
    if (!match || !current || match[1] !== current.id) throw problem(404, 'Camera session ended. Scan a new code.');
    const remote = request.socket.remoteAddress;
    const local = current.addresses.find(item => item.address === request.socket.localAddress);
    if (!local || !sameSubnet(remote, local.address, local.netmask)) throw problem(403, 'Connect both devices to the same private network.');
    const action = match[2];
    if (action === 'pair' && request.method === 'POST') {
      if (current.phase !== 'waiting' || !authorized(request, current.scan)) throw problem(403, 'This pairing code is no longer available.');
      current.phone = newSecret();
      current.scan = undefined;
      current.remote = remote;
      current.phase = 'connecting';
      current.phoneSeen = now();
      current.commandAt = current.phoneSeen;
      return reply(response, 200, { phone: current.phone });
    }
    if (current.remote !== remote || !authorized(request, current.phone)) throw problem(403, 'Scan a new pairing code.');
    current.phoneSeen = now();
    if ((!action && request.method === 'GET') || (action === 'ready' && request.method === 'POST')) {
      current.torch = request.headers['x-camera-torch'] === '1' ? current.torch ?? false : undefined;
    }
    if (!action && request.method === 'GET') return reply(response, 200, snapshot(current));
    if (request.method !== 'POST') throw problem(405, 'Unsupported camera action.');
    if (action === 'disconnect') { discard(current); return reply(response, 200, {}); }
    if (action === 'start' || action === 'photo') {
      beginTake(current, action === 'start' ? 'video' : 'photo', true);
      return reply(response, 200, snapshot(current));
    }
    if (action === 'ready') {
      current.phoneReady = true;
      if (current.phase === 'connecting') { current.phase = 'ready'; current.message = undefined; }
    } else if (action === 'pause') {
      current.phoneReady = false;
      if (current.phase !== 'received') returnToIdle(current, 'Open Web Camera on the phone to resume.');
    } else if (torchActions.has(action)) {
      setTorch(current, action);
    } else {
      const take = current.take;
      if (!take || request.headers['x-camera-take'] !== take.id) throw problem(409, 'That recording is no longer active.');
      if (action === 'recording' && ['starting', 'recording'].includes(current.phase)) current.phase = 'recording';
      else if (action === 'stop') stopRecording(current, take);
      else if ((action === 'video' && take.kind === 'video') || (action === 'image' && take.kind === 'photo')) await receiveTake(request, current, take);
      else if (action === 'failed' && current.phase !== 'received') returnToIdle(current, take.kind === 'photo' ? 'The phone could not take that photo. Try again.' : 'The phone stopped recording. Start a new take.');
      else throw problem(409, 'That camera command is no longer active.');
    }
    return reply(response, 200, snapshot(current));
  }

  const serve = handler => createServer(async (request, response) => {
    refresh();
    try { await handler(request, response); }
    catch (error) {
      if (!response.headersSent && !response.destroyed) reply(response, error.status || 500, { message: error.status ? error.message : 'Local camera request failed. Try again.' });
    }
  });
  const desktopServer = serve(desktop);
  const phoneServer = serve(phone);
  const expiry = setInterval(refresh, 5000).unref();
  return { desktopServer, phoneServer, close() { clearInterval(expiry); discard(session); desktopServer.close(); phoneServer.close(); } };
}

if (require.main === module) {
  const bridge = createCameraBridge();
  let claims;
  const stop = () => { bridge.close(); claims?.kill(); };
  const listen = (server, port, address) => new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, address, resolve);
  });
  const failed = error => { console.error(`Phone camera bridge: ${error.message}`); stop(); process.exitCode = 1; };
  void Promise.all([listen(bridge.desktopServer, DESKTOP_PORT, '127.0.0.1'), listen(bridge.phoneServer, PHONE_PORT, '0.0.0.0')]).then(() => {
    console.log('Phone camera bridge ready. Open Meesho Claims → Original evidence → Connect phone.');
    if (process.argv.includes('--with-claims')) {
      claims = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3000'], { stdio: 'inherit', windowsHide: true });
      claims.on('error', failed);
      claims.on('exit', code => { bridge.close(); process.exitCode = code || 0; });
    }
  }).catch(failed);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop);
}

module.exports = { createCameraBridge, sameSubnet };

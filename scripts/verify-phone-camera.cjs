/* eslint-disable @typescript-eslint/no-require-imports -- Local Node verification. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { networkInterfaces } = require('node:os');
const { readFileSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const scanner = require('zxing-wasm/reader');
const { createCameraBridge, desktopOrigins, sameSubnet } = require('./phone-camera-bridge.cjs');

test('the production Vercel app and explicitly configured origins can use the laptop bridge', () => {
  assert.equal(desktopOrigins().has('https://listing-tool-three.vercel.app'), true);
  assert.equal(desktopOrigins('https://claims.example.test,not a URL').has('https://claims.example.test'), true);
  assert.equal(desktopOrigins('not a URL').has('not a URL'), false);
});

test('only a matching private subnet can use the phone endpoint', () => {
  assert.equal(sameSubnet('192.168.10.22', '192.168.10.5', '255.255.255.0'), true);
  assert.equal(sameSubnet('192.168.11.22', '192.168.10.5', '255.255.255.0'), false);
  assert.equal(sameSubnet('127.0.0.1', '192.168.10.5', '255.255.255.0'), false);
  assert.equal(sameSubnet('8.8.8.8', '192.168.10.5', '0.0.0.0'), false);
});

const network = Object.entries(networkInterfaces()).flatMap(([name, adapters]) => adapters.map(item => ({ ...item, name })))
  .find(item => !item.internal && item.family === 'IPv4' && /^(?:192\.168\.|10\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(item.address));

test('one QR lets the laptop and phone record, review and trim takes', { skip: !network }, async () => {
  const adapter = { name: network.name, address: network.address, netmask: network.netmask };
  let time = Date.now();
  const bridge = createCameraBridge({ interfaces: () => [adapter], now: () => time });
  const listen = (server, ip) => new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, ip, () => resolve(server.address().port));
  });
  try {
    const [localPort, phonePort] = await Promise.all([listen(bridge.desktopServer, '127.0.0.1'), listen(bridge.phoneServer, network.address)]);
    const localBase = `http://127.0.0.1:${localPort}`;
    const origin = { Origin: 'https://listing-tool-three.vercel.app' };
    assert.equal((await fetch(`${localBase}/session`, { method: 'POST', headers: { Origin: 'https://example.com' } })).status, 403);
    assert.equal((await fetch(`${localBase}/session`, { method: 'POST', headers: origin })).status, 201);
    assert.equal((await fetch(`${localBase}/session`, { method: 'POST', headers: origin })).status, 409);
    assert.equal((await fetch(`${localBase}/session/reset`, { method: 'POST', headers: origin })).status, 200);
    const created = await fetch(`${localBase}/session`, { method: 'POST', headers: origin });
    assert.equal(created.status, 201);
    const { id, controller, codes } = await created.json();

    scanner.prepareZXingModule({ overrides: { wasmBinary: readFileSync(require.resolve('zxing-wasm/reader/zxing_reader.wasm')) } });
    const qr = new Blob([Buffer.from(codes[0].qr.split(',')[1], 'base64')], { type: 'image/png' });
    const [decoded] = await scanner.readBarcodes(qr);
    const pairing = new URL(decoded.text);
    assert.equal(pairing.protocol, 'webcamera:');
    assert.equal(pairing.hostname, 'pair');
    assert.equal(pairing.searchParams.get('ip'), network.address);
    assert.equal(pairing.searchParams.get('id'), id);
    const scanToken = pairing.searchParams.get('code');
    const phoneBase = `http://${network.address}:${phonePort}/phone/${id}`;
    const auth = token => ({ Authorization: `Bearer ${token}` });
    const start = await fetch(`${phoneBase}/pair`, { method: 'POST', headers: auth(scanToken) });
    assert.equal(start.status, 200);
    const { phone } = await start.json();
    assert.equal((await fetch(`${phoneBase}/pair`, { method: 'POST', headers: auth(scanToken) })).status, 403);
    const handset = async (action = '', take, body, supportsTorch = true) => fetch(phoneBase + action, {
      method: action ? 'POST' : 'GET',
      headers: { ...auth(phone), ...(take ? { 'X-Camera-Take': take } : {}), ...(supportsTorch ? { 'X-Camera-Torch': '1' } : {}) }, body,
    });
    const desktop = async (action = '', method = 'GET', take) => fetch(`${localBase}/session/${id}${action}`, {
      method, headers: { ...origin, ...auth(controller), ...(take ? { 'X-Camera-Take': take } : {}) },
    });
    const assertPhase = async (result, phase) => {
      const response = await result;
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.phase, phase);
      return data;
    };

    assert.equal((await desktop('/start', 'POST')).status, 409);
    assert.equal((await desktop('/torch-on', 'POST')).status, 409);
    assert.equal((await assertPhase(handset('/ready', undefined, undefined, false), 'ready')).torch, undefined);
    assert.equal((await desktop('/torch-on', 'POST')).status, 409);
    assert.equal((await assertPhase(handset(), 'ready')).torch, false);
    assert.equal((await assertPhase(desktop('/torch-on', 'POST'), 'ready')).torch, true);
    assert.equal((await assertPhase(handset(), 'ready')).torch, true);
    assert.equal((await assertPhase(handset('/torch-off'), 'ready')).torch, false);
    assert.equal((await assertPhase(desktop(), 'ready')).torch, false);
    const first = (await assertPhase(desktop('/start', 'POST'), 'starting')).take;
    assert.equal((await assertPhase(handset(), 'starting')).take, first);
    await assertPhase(handset('/recording', first), 'recording');
    assert.equal((await fetch(`${localBase}/session/reset`, { method: 'POST', headers: origin })).status, 409);
    assert.equal((await assertPhase(desktop('/torch-on', 'POST'), 'recording')).torch, true);
    assert.equal((await assertPhase(handset(), 'recording')).torch, true);
    assert.equal((await handset('/video', first, Buffer.from('unused'))).status, 409);
    await assertPhase(desktop('/stop', 'POST', first), 'stopping');
    await assertPhase(handset(), 'stopping');

    const ffmpeg = require('ffmpeg-static');
    const encoded = execFileSync(ffmpeg, [
      '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=90x160:d=2', '-c:v', 'libx264',
      '-movflags', 'empty_moov+frag_keyframe', '-f', 'mov', 'pipe:1',
    ], { windowsHide: true });
    const quicktime = execFileSync(ffmpeg, [
      '-v', 'error', '-display_rotation:v:0', '90', '-f', 'mov', '-i', 'pipe:0', '-c', 'copy',
      '-movflags', 'empty_moov+frag_keyframe', '-f', 'mov', 'pipe:1',
    ], { input: encoded, windowsHide: true });
    assert.equal(quicktime.toString('ascii', 8, 12), 'qt  ');
    await assertPhase(handset('/video', first, quicktime), 'received');
    const result = await desktop('/video', 'GET', first);
    assert.equal(result.headers.get('content-type'), 'video/mp4');
    const mp4 = Buffer.from(await result.arrayBuffer());
    assert.equal(mp4.toString('ascii', 4, 8), 'ftyp');
    assert.notEqual(mp4.toString('ascii', 8, 12), 'qt  ');
    const landscapeFrame = clip => {
      const png = execFileSync(ffmpeg, [
        '-v', 'error', '-f', 'mov', '-i', 'pipe:0', '-frames:v', '1', '-c:v', 'png', '-f', 'image2pipe', 'pipe:1',
      ], { input: clip, windowsHide: true });
      return [png.readUInt32BE(16), png.readUInt32BE(20)];
    };
    assert.deepEqual(landscapeFrame(mp4), [160, 90]);

    assert.equal((await desktop('/trim?start=1.5&end=0.3', 'POST', first)).status, 400);
    assert.equal((await desktop('/trim?start=10&end=11', 'POST', first)).status, 422);
    const trimmed = await desktop('/trim?start=0.4&end=1.2', 'POST', first);
    assert.equal(trimmed.status, 200);
    assert.equal(trimmed.headers.get('content-type'), 'video/mp4');
    const clip = Buffer.from(await trimmed.arrayBuffer());
    assert.deepEqual(landscapeFrame(clip), [160, 90]);
    const decodedFrames = execFileSync(ffmpeg, ['-v', 'error', '-f', 'mov', '-i', 'pipe:0', '-pix_fmt', 'gray', '-f', 'rawvideo', 'pipe:1'], { input: clip, windowsHide: true });
    assert.equal(decodedFrames.length / (160 * 90), 20);
    assert.deepEqual(Buffer.from(await (await desktop('/video', 'GET', first)).arrayBuffer()), mp4);
    assert.equal((await assertPhase(desktop('/release', 'POST', first), 'ready')).torch, true);
    assert.equal((await assertPhase(handset('/torch-off'), 'ready')).torch, false);

    await assertPhase(handset('/pause'), 'connecting');
    await assertPhase(handset('/ready'), 'ready');
    assert.equal((await fetch(`${phoneBase}/start`, { method: 'POST', headers: auth(scanToken) })).status, 403);
    const second = (await assertPhase(handset('/start'), 'starting')).take;
    assert.notEqual(second, first);
    assert.equal((await assertPhase(desktop(), 'starting')).take, second);
    assert.equal((await handset('/start')).status, 409);
    assert.equal((await desktop('/start', 'POST')).status, 409);
    assert.equal((await handset('/recording', first)).status, 409);
    await assertPhase(handset('/recording', second), 'recording');
    for (let elapsed = 0; elapsed < 48_000; elapsed += 12_000) {
      time += 12_000;
      await assertPhase(handset(), 'recording');
    }
    assert.equal((await handset('/stop', first)).status, 409);
    await assertPhase(handset('/stop', second), 'stopping');
    await assertPhase(desktop('/stop', 'POST', second), 'stopping');
    await assertPhase(handset('/video', second, mp4), 'received');
    assert.deepEqual(Buffer.from(await (await desktop('/video', 'GET', second)).arrayBuffer()), mp4);
    await assertPhase(desktop('/release', 'POST', second), 'ready');

    const jpg = await require('sharp')({ create: { width: 120, height: 80, channels: 3, background: '#7954b3' } }).jpeg().toBuffer();
    const phoneShot = await assertPhase(handset('/photo'), 'photographing');
    assert.equal(phoneShot.kind, 'photo');
    assert.equal((await desktop('/start', 'POST')).status, 409);
    assert.equal((await handset('/stop', phoneShot.take)).status, 409);
    assert.equal((await handset('/video', phoneShot.take, jpg)).status, 409);
    const receivedPhoto = await assertPhase(handset('/image', phoneShot.take, jpg), 'received');
    assert.equal(receivedPhoto.kind, 'photo');
    const image = await desktop('/image', 'GET', phoneShot.take);
    assert.equal(image.headers.get('content-type'), 'image/jpeg');
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), jpg);
    assert.equal((await desktop('/trim?start=0&end=1', 'POST', phoneShot.take)).status, 409);
    await assertPhase(desktop('/release', 'POST', phoneShot.take), 'ready');

    const laptopShot = await assertPhase(desktop('/photo', 'POST'), 'photographing');
    assert.equal((await assertPhase(handset(), 'photographing')).take, laptopShot.take);
    assert.equal((await handset('/image', laptopShot.take, Buffer.from('invalid JPEG'))).status, 415);
    await assertPhase(desktop(), 'ready');
    assert.equal((await desktop('', 'DELETE')).status, 200);
    assert.equal((await handset()).status, 404);
  } finally { bridge.close(); }
});

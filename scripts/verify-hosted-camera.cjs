/* eslint-disable @typescript-eslint/no-require-imports -- Local Node verification. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');
const scanner = require('zxing-wasm/reader');

test('the hosted QR authorizes a native phone to answer but keeps the controller private', async () => {
  const route = readFileSync(join(__dirname, '../app/api/phone-camera/pair/route.ts'), 'utf8');
  const { outputText } = ts.transpileModule(route, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  const routeModule = { exports: {} };
  runInNewContext(outputText, { exports: routeModule.exports, require, URL, Response, process: { env: { NODE_ENV: 'development' } } });
  const { POST } = routeModule.exports;
  const origin = 'https://listing-tool-three.vercel.app';
  const host = 'listing-tool-three.vercel.app';
  const sameOrigin = { Origin: origin, 'Sec-Fetch-Site': 'same-origin' };
  const crossOrigin = { Origin: 'https://another.example', 'Sec-Fetch-Site': 'cross-site' };
  const offer = 'v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n';
  const answer = `${offer}a=setup:active\r\n`;
  const send = (action, fields, headers = {}) => POST(new Request(`${origin}/api/phone-camera/pair`, {
    method: 'POST',
    headers: { Host: host, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ action, ...fields }),
  }));

  assert.equal((await send('create', { sdp: offer })).status, 403);
  assert.equal((await send('create', { sdp: offer }, crossOrigin)).status, 403);
  const created = await send('create', { sdp: offer }, sameOrigin);
  assert.equal(created.status, 201);
  const pair = await created.json();

  scanner.prepareZXingModule({ overrides: { wasmBinary: readFileSync(require.resolve('zxing-wasm/reader/zxing_reader.wasm')) } });
  const qr = new Blob([Buffer.from(pair.qr.split(',')[1], 'base64')], { type: 'image/png' });
  const [decoded] = await scanner.readBarcodes(qr);
  const cameraUrl = new URL(decoded.text);
  assert.equal(cameraUrl.origin, origin);
  assert.equal(cameraUrl.pathname, '/camera');
  const [, id, key] = /^#([\w-]{32})\.([\w-]{32})$/.exec(cameraUrl.hash);
  const phone = { id, key };
  assert.equal(phone.id, pair.id);

  const controller = { id: pair.id, key: pair.laptop };
  assert.equal((await send('offer', controller)).status, 404);
  assert.equal((await send('offer', phone, crossOrigin)).status, 403);
  assert.equal((await send('offer', phone, { 'Content-Type': 'text/plain' })).status, 403);
  const onPhone = await send('offer', phone);
  assert.equal(onPhone.status, 200);
  assert.equal((await onPhone.json()).sdp, offer);
  assert.equal((await send('answer', controller)).status, 403);
  assert.equal((await send('answer', phone, sameOrigin)).status, 404);
  assert.equal((await send('join', { ...phone, sdp: answer })).status, 200);
  assert.equal((await send('join', { ...phone, sdp: `${answer}a=ice-ufrag:other\r\n` })).status, 409);
  const polled = await send('answer', controller, sameOrigin);
  assert.equal(polled.status, 200);
  assert.equal((await polled.json()).sdp, answer);
  assert.equal((await send('close', controller, sameOrigin)).status, 200);
  assert.equal((await send('offer', phone)).status, 404);
});

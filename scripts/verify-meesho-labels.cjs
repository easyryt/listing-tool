/* eslint-disable @typescript-eslint/no-require-imports -- Node verification harness. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const testModule = { exports: {} }, context = vm.createContext({ module: testModule, exports: testModule.exports });
vm.runInContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/meesho-label-reader.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const { extractClaimIdentifiers: read, labelAutofillChanges: changes } = testModule.exports;
const blank = () => ({ subOrderNumber: '', awbNumber: '', packetId: '' });
const plain = value => JSON.parse(JSON.stringify(value));

test('a shipping label supplies the named order, courier AWB and Packet ID', () => {
  const result = read('MEESHO RETURN\nSub Order No: 123456789012345_1    AWB Number: SF123456789IN\nPacket ID: P12345678\nPhone: 9876543210\nPIN: 201305', 92);
  assert.deepEqual(plain(result.candidates), { subOrderNumber: ['123456789012345_1'], awbNumber: ['SF123456789IN'], packetId: ['P12345678'] });
  assert.deepEqual(plain(changes(result, blank(), blank())), { subOrderNumber: '123456789012345_1', awbNumber: 'SF123456789IN', packetId: 'P12345678' });
});

test('labels may wrap, repeat, use tracking synonyms or contain grouped digits', () => {
  const result = read('Sub-order number\n123456789012_1\nReturn AWB No.\n14 9071 0688 60582\nPacket ID: NA\nAWB: 149071068860582');
  assert.deepEqual(plain(result.candidates), { subOrderNumber: ['123456789012_1'], awbNumber: ['149071068860582'], packetId: ['NA'] });
  assert.equal(read('Tracking ID: 123ABC456789').candidates.awbNumber[0], '123ABC456789');
});

test('the supplied Red Tape product barcode is never guessed to be a claim identifier', () => {
  const result = read('LAK000914 - PRODUCT: Red Tape Men’s Sneaker - Grey\nSize: 6, Quantity: 1, MRP: 7,499.00\nMfg. Date: August 2025\nSector-90, Noida, Uttar Pradesh - 201305\n149071068860582');
  assert.deepEqual(plain(result.candidates), { subOrderNumber: [], awbNumber: [], packetId: [] });
  assert.deepEqual(plain(result.unlabelled), ['149071068860582']);
  assert.deepEqual(plain(changes(result, blank(), blank())), {});
});

test('a barcode provides a selectable alphanumeric ID when OCR misses it', () => {
  const result = read('Unreadable barcode\n981234567890', 40, ['PKTDEMO123456', 'PKTDEMO123456', 'https://example.com/PKTDEMO123456', 'invalid code']);
  assert.deepEqual(plain(result.barcodeValues), ['PKTDEMO123456']);
  assert.deepEqual(plain(result.unlabelled), ['PKTDEMO123456', '981234567890']);
  assert.deepEqual(plain(changes(result, blank(), blank())), {});
  assert.deepEqual(plain(read('Unreadable barcode', 100, ['PKTDEMO123456']).candidates.packetId), []);
});

test('a standalone printed ID is selectable and a labelled ID is listed only once', () => {
  const result = read('RETURN PACKAGE\nPKTDEMO123456\nAWB: 980123456789', 91, ['980123456789']);
  assert.deepEqual(plain(result.unlabelled), ['PKTDEMO123456']);
  assert.deepEqual(plain(changes(result, blank(), blank())), { awbNumber: '980123456789' });
});

test('ambiguous labels, unclear OCR and missing label values require review', () => {
  const ambiguous = read('AWB: 123456789012\nAWB: 987654321098');
  assert.equal(ambiguous.candidates.awbNumber.length, 2);
  assert.deepEqual(plain(changes(ambiguous, blank(), blank())), {});
  assert.deepEqual(plain(changes(read('AWB: 123456789012', 40), blank(), blank())), {});
  assert.deepEqual(plain(read('Sub Order No:\nAWB: 123456789012').candidates.subOrderNumber), []);
  assert.deepEqual(plain(read('Packet ID:\nProduct: REDTAPE').candidates.packetId), []);
});

test('automatic detection preserves existing values and edits made while a scan runs', () => {
  const result = read('Sub Order No: 123456789012_1\nAWB: 123456789012\nPacket ID: P12345678');
  const existing = { subOrderNumber: 'MANUALLY-ENTERED', awbNumber: '', packetId: 'NA' };
  assert.deepEqual(plain(changes(result, existing, existing)), { awbNumber: '123456789012' });
  assert.deepEqual(plain(changes(result, blank(), { subOrderNumber: 'ANOTHER-ORDER', awbNumber: 'EDITED', packetId: '' })), { packetId: 'P12345678' });
  assert.deepEqual(plain(changes(result, existing, blank())), { awbNumber: '123456789012' });
});

test('a missed underscore never silently joins a sub-order suffix to its digits', () => {
  const before = blank();
  const result = read('Sub Order Number: 123456789012345 1\nAWB Number: SF123456789IN\nPacket ID: P12345678', 94);
  assert.deepEqual(plain(result.candidates.subOrderNumber), []);
  assert.match(result.warnings.join(' '), /missing underscore/);
  assert.deepEqual(plain(changes(result, before, before)), { awbNumber: 'SF123456789IN', packetId: 'P12345678' });
  assert.equal(read('Sub Order Number: 123456789012345 _ 1').candidates.subOrderNumber[0], '123456789012345_1');
});

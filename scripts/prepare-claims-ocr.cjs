/* eslint-disable @typescript-eslint/no-require-imports -- Build-time asset preparation. */
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..'), target = path.join(root, 'public', 'claims-ocr');
const packageDir = name => path.dirname(require.resolve(name + '/package.json'));
fs.mkdirSync(target, { recursive: true });
const tesseract = packageDir('tesseract.js'), core = packageDir('tesseract.js-core'), english = packageDir('@tesseract.js-data/eng');
const copy = (from, to) => {
  if (!fs.existsSync(to) || !fs.readFileSync(from).equals(fs.readFileSync(to))) fs.copyFileSync(from, to);
};
copy(path.join(tesseract, 'dist', 'worker.min.js'), path.join(target, 'worker.min.js'));
// Include every WASM loader so the worker can choose the supported SIMD build.
for (const name of fs.readdirSync(core).filter(name => /^tesseract-core.*\.wasm\.js$/.test(name))) copy(path.join(core, name), path.join(target, name));
copy(path.join(english, '4.0.0_best_int', 'eng.traineddata.gz'), path.join(target, 'eng.traineddata.gz'));
copy(path.join(tesseract, 'LICENSE.md'), path.join(target, 'TESSERACT-LICENSE.txt'));
copy(path.join(core, 'LICENSE'), path.join(target, 'CORE-LICENSE.txt'));
const barcodeWasm = require.resolve('zxing-wasm/reader/zxing_reader.wasm');
copy(barcodeWasm, path.join(target, 'zxing_reader.wasm'));
copy(path.resolve(path.dirname(barcodeWasm), '../../LICENSE'), path.join(target, 'ZXING-LICENSE.txt'));
console.log('Prepared local claims OCR and barcode reader assets.');

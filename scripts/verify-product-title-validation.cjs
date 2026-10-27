/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS verification harness. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { createRequire } = require("node:module");

const root = path.resolve(__dirname, "..");
function load(relative, overrides = {}, requireOverrides = {}) {
  const filename = path.join(root, relative);
  const cjs = { exports: {} };
  const originalRequire = createRequire(filename);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, {
    module: cjs, exports: cjs.exports, Buffer, File, FormData, Request, Response, URL, AbortSignal, Blob, JSON, SyntaxError,
    console: { error() {} },
    process: { env: { OPENAI_API_KEY: "verification-only", GEMINI_API_KEY: "verification-only", IMAGEKIT_PRIVATE_KEY: "verification-only" } },
    require: (name) => {
      if (Object.hasOwn(requireOverrides, name)) return requireOverrides[name];
      if (name === "@/lib/product-title-validation" || name === "./product-title-validation") return rules;
      if (name === "next/server") return { NextResponse: { json: (data, options) => Response.json(data, options) } };
      return originalRequire(name);
    }, ...overrides,
  });
  return cjs.exports;
}
const rules = load("lib/product-title-validation.ts");
const model = "APPLE iPhone 13";
const productType = "Designer Mobile Cover";
const safeA = "Clear Designer Mobile Cover for APPLE iPhone 13 with Red Cherry Pattern";
const safeB = "Transparent Designer Mobile Cover for APPLE iPhone 13 with Daisy Pattern";
const unsafe = "Clear Designer Mobile Cover for APPLE iPhone 13 with Floral Elements";
const parentTitle = "Transparent Designer Mobile Cover for APPLE iPhone 13 with Red Cherry Artwork";
const existing = "Clear Designer Mobile Cover for APPLE iPhone 13 with Ribbon Pattern";
const plain = (value) => JSON.parse(JSON.stringify(value));

function checkRules() {
  for (const value of [unsafe, unsafe.replace("Elements", "ELEMENTS"), unsafe.replace("Elements", "El\u200bements"), unsafe.replace("Elements", "Ｅｌｅｍｅｎｔｓ")]) {
    assert.deepEqual(plain(rules.productTitleKeywordIssues(value).errors), ["Elements"]);
    assert.deepEqual(plain(rules.validGeneratedProductTitles([value], { count: 1, model, productType })), []);
  }
  assert.equal(rules.productTitleKeywordIssues("Elemental floral decoration").errors.length, 0, "Do not block unrelated substrings");
  assert.deepEqual(plain(rules.productTitleWarnings([safeA, "Elegant Minimalist Butterfly Chic design", safeB])), ["iPhone", "Minimalist", "Elegant", "Butterfly", "Chic"]);
  assert.deepEqual(plain(rules.validGeneratedProductTitles([safeA, safeA.toUpperCase(), unsafe, safeB], { count: 2, model, productType })), [safeA, safeB]);
  for (const value of [null, 123, "short", safeA.replace(model, "Samsung Galaxy S24"), safeA.replace(model, "APPLE iPhone 130"), safeA.replace(productType, "Phone Case"), safeA + " extra".repeat(20), safeA + " 🌸"]) {
    assert.equal(rules.validGeneratedProductTitles([value], { count: 1, model, productType }).length, 0, `Reject invalid AI title: ${value}`);
  }
  assert.equal(rules.normalizeProductTitle("x".repeat(101)).length, 101, "Never silently truncate AI titles");
  assert.equal(rules.validGeneratedProductTitles([safeA], { count: 0, model, productType }).length, 0);
  assert.equal(rules.validGeneratedProductTitles([safeA], { count: 1, model, productType, usedTitles: [safeA.toUpperCase()] }).length, 0);
  assert.equal(rules.validGeneratedProductTitles([safeA], { count: 1, model, productType, forCharm: true, usedTitles: [safeA + " With Charms"] }).length, 0);
  assert.equal(rules.validGeneratedProductTitles([safeA + " With Charms"], { count: 1, model, productType, forCharm: true }).length, 0);
  const longCharm = safeA + " Fine Artwork Detail";
  assert.ok(longCharm.length > 88 && longCharm.length <= 100);
  assert.equal(rules.validGeneratedProductTitles([longCharm], { count: 1, model, productType, forCharm: true }).length, 0);
  assert.equal(rules.validGeneratedProductTitles([safeA], { count: 1, model, productType, forCharm: true }).length, 1);
  assert.throws(() => rules.assertProductTitlesForExport([{ productName: unsafe, sku: "TEST-1" }]), /TEST-1.*Elements/);
  assert.throws(() => rules.assertProductTitlesForExport([{ productName: "x".repeat(101) }]), /longer than 100/);
  assert.doesNotThrow(() => rules.assertProductTitlesForExport([{ productName: safeA }]), "A known warning is not a hard error");
}

function mockAi(provider, sequence) {
  const calls = { ai: [], uploads: 0, saves: 0 };
  const fetch = async (url, options) => {
    if (url === "https://upload.imagekit.io/api/v1/files/upload") {
      calls.uploads += 1;
      return Response.json({ fileId: "qa-image", url: "https://example.com/qa.png", thumbnailUrl: "https://example.com/qa.png" });
    }
    if (String(url).endsWith("/api/designs")) {
      calls.saves += 1;
      return Response.json({ success: true, created: true, design: { id: "qa-design", designName: "Cherry Bloom", designCode: "CHRBLOM", imageUrl: "https://example.com/qa.png", thumbnailUrl: "https://example.com/qa.png" } });
    }
    assert.ok(provider === "openai" ? String(url).startsWith("https://api.openai.com/") : String(url).startsWith("https://generativelanguage.googleapis.com/"), "No real or unexpected service calls");
    const body = JSON.parse(options.body);
    const prompt = provider === "openai" ? (typeof body.input === "string" ? body.input : body.input[0].content.find((part) => part.type === "input_text").text)
      : body.contents[0].parts.find((part) => typeof part.text === "string").text;
    const item = sequence[Math.min(calls.ai.length, sequence.length - 1)];
    calls.ai.push({ prompt, body });
    if (item && item.providerError) return Response.json({ error: { message: "Verification provider unavailable" } }, { status: 429 });
    const text = typeof item === "string" ? item : JSON.stringify(item);
    return Response.json(provider === "openai" ? { output_text: text } : { candidates: [{ content: { parts: [{ text }] } }] });
  };
  return { calls, fetch };
}

function imageRequest(provider, changes = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ provider, category: "Mobile Cases & Covers", model, theme: "Floral", productType, titleCount: "1", ...changes })) form.set(key, value);
  form.set("image", new File([new Uint8Array([1, 2, 3])], "qa-only.png", { type: "image/png" }));
  return new Request("http://localhost/api/ai/product-copy", { method: "POST", body: form });
}
const details = (title) => ({ titleOptions: [title], color: "Transparent", material: "Not specified", designName: "Cherry Bloom", designCode: "CHRBLOM" });
function variantRequest(provider, changes = {}) {
  return new Request("http://localhost/api/ai/variant-titles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, parentTitle, category: "Mobile Cases & Covers", model, theme: "Floral", productType, count: 2, usedTitles: [existing], ...changes }) });
}

async function checkRoutes(provider) {
  const image = mockAi(provider, [details(unsafe), details(safeA)]);
  const parentRoute = load("app/api/ai/product-copy/route.ts", { fetch: image.fetch });
  const result = await parentRoute.POST(imageRequest(provider));
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.deepEqual(body.titleOptions, [safeA]);
  assert.deepEqual(body.titleWarnings, ["iPhone"]);
  assert.equal(image.calls.ai.length, 2);
  assert.match(image.calls.ai[1].prompt, /Correction:.*Elements/);
  assert.equal(image.calls.uploads, 1, "Upload only after accepting valid titles");
  assert.equal(image.calls.saves, 1, "No invalid parent design is saved");

  for (const malformed of ["not json", "null", "[]"]) {
    const retry = mockAi(provider, [malformed, details(safeA)]);
    const response = await load("app/api/ai/product-copy/route.ts", { fetch: retry.fetch }).POST(imageRequest(provider));
    assert.equal(response.status, 200, "Malformed JSON is retried");
    assert.equal(retry.calls.ai.length, 2);
  }
  const failed = mockAi(provider, [details(unsafe)]);
  const failure = await load("app/api/ai/product-copy/route.ts", { fetch: failed.fetch }).POST(imageRequest(provider));
  assert.equal(failure.status, 422);
  assert.equal(failed.calls.ai.length, 3, "AI correction attempts are bounded");
  assert.equal(failed.calls.uploads + failed.calls.saves, 0);
  assert.equal((await failure.json()).titleOptions, undefined);

  const variants = mockAi(provider, [{ titles: [unsafe, parentTitle, existing, safeA, safeA] }, { titles: [safeB] }]);
  const variantResponse = await load("app/api/ai/variant-titles/route.ts", { fetch: variants.fetch }).POST(variantRequest(provider));
  assert.equal(variantResponse.status, 200);
  assert.deepEqual((await variantResponse.json()).titles, [safeA, safeB]);
  assert.equal(variants.calls.ai.length, 2);
  assert.match(variants.calls.ai[1].prompt, /Create exactly 1 distinct/);
  assert.ok(variants.calls.ai[1].prompt.includes(safeA), "Accepted titles are excluded from the retry");
  assert.equal(variants.calls.uploads + variants.calls.saves, 0);

  const invalidVariants = mockAi(provider, [{ titles: [unsafe, existing, parentTitle] }]);
  const invalidVariantResponse = await load("app/api/ai/variant-titles/route.ts", { fetch: invalidVariants.fetch }).POST(variantRequest(provider));
  assert.equal(invalidVariantResponse.status, 422);
  assert.equal(invalidVariants.calls.ai.length, 3);
  assert.equal((await invalidVariantResponse.json()).titles, undefined);

  const charm = mockAi(provider, [{ titles: [safeA + " With Charms", longTitle()] }, { titles: [safeB] }]);
  const charmResponse = await load("app/api/ai/variant-titles/route.ts", { fetch: charm.fetch }).POST(variantRequest(provider, { forCharm: true, count: 1 }));
  assert.equal(charmResponse.status, 200);
  const charmTitle = (await charmResponse.json()).titles[0];
  assert.ok((charmTitle + " With Charms").length <= 100);
  assert.equal(charm.calls.ai.length, 2);

  const brokenJson = mockAi(provider, ["null", { titles: [safeB] }]);
  assert.equal((await load("app/api/ai/variant-titles/route.ts", { fetch: brokenJson.fetch }).POST(variantRequest(provider, { count: 1 }))).status, 200);
  const providerFailure = mockAi(provider, [{ providerError: true }]);
  assert.equal((await load("app/api/ai/variant-titles/route.ts", { fetch: providerFailure.fetch }).POST(variantRequest(provider))).status, 500);
  assert.equal(providerFailure.calls.ai.length, 1, "Do not retry provider/network failures blindly");
  const badSelection = mockAi(provider, [details(safeA)]);
  assert.equal((await load("app/api/ai/product-copy/route.ts", { fetch: badSelection.fetch }).POST(imageRequest(provider, { productType: "Elements" }))).status, 400);
  assert.equal(badSelection.calls.ai.length, 0);
  console.log(`PASS ${provider}: parent and variant keyword rejection, correction retries, model/type checks, warnings, malformed JSON, duplicate exclusions, charm length, and no invalid saves.`);
}
function longTitle() { return safeA + " Fine Artwork Detail"; }

function checkNotice() {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const Notice = load("components/ProductTitleNotice.tsx").default;
  const warning = renderToStaticMarkup(React.createElement(Notice, { titles: [safeA] }));
  assert.match(warning, /role="status"/);
  assert.match(warning, /iPhone/);
  assert.match(warning, /Final approval is decided by Meesho/);
  const error = renderToStaticMarkup(React.createElement(Notice, { titles: [unsafe] }));
  assert.match(error, /role="alert"/);
  assert.match(error, /Elements/);
  assert.equal(renderToStaticMarkup(React.createElement(Notice, { titles: ["Plain floral case"] })), "");
}

async function checkExport() {
  const ExcelJS = require("exceljs");
  let fetched = 0;
  let downloaded;
  const exporter = load("lib/excel.ts", {
    fetch: async () => { fetched += 1; return { ok: true, arrayBuffer: async () => fs.readFileSync(path.join(root, "public/meesho-template.xlsx")) }; },
  }, {
    "file-saver": { saveAs: (blob) => { downloaded = blob; } },
    "./columnMap": load("lib/columnMap.ts"), "./pricing": load("lib/pricing.ts"), "./sku": { generateSKU: () => "TEST-SKU" },
  });
  const product = { productName: unsafe, price: 122, wrongDefectiveReturnsPrice: 1, models: [{ model }], sku: "TEST-SKU" };
  await assert.rejects(exporter.exportExcel([product]), /Elements/);
  assert.equal(fetched, 0, "Block a known title error before loading/downloading a workbook");
  await exporter.exportExcel([{ ...product, productName: safeA }]);
  const output = new ExcelJS.Workbook();
  await output.xlsx.load(Buffer.from(await downloaded.arrayBuffer()));
  assert.equal(output.worksheets[0].getCell("D6").value, safeA);
  assert.equal(output.worksheets[0].getCell("F6").value, 122);
  assert.equal(output.worksheets[0].getCell("G6").value, 1, "The requested title-only fix must not change pricing");
  console.log("PASS export and review notice: known title errors blocked; warnings remain reviewable; pricing unchanged.");
}

(async () => {
  checkRules(); checkNotice();
  await checkRoutes("openai");
  await checkRoutes("gemini");
  await checkExport();
})().catch((error) => { console.error(error); process.exitCode = 1; });

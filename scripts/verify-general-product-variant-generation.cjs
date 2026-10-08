/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS regression test. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
function load(relativePath, fetcher) {
  const filename = path.join(root, relativePath);
  const testModule = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    module: testModule, exports: testModule.exports, Request, Response, JSON, Error, SyntaxError,
    fetch: fetcher, process: { env: { OPENAI_API_KEY: "test-only", GEMINI_API_KEY: "test-only" } },
    require: (name) => name === "next/server"
      ? { NextResponse: { json: (value, options) => Response.json(value, options) } }
      : load(name.startsWith("@/") ? `${name.slice(2)}.ts`
        : path.relative(root, path.resolve(path.dirname(filename), `${name}.ts`)), fetcher),
  });
  return testModule.exports;
}

const parentTitle = "Universal Transparent Mobile Case Lanyard Insert Tabs Phone Charms Holder (Pack of 10)";
const input = {
  parentTitle, category: "Beads & Charms", genericName: "Beads & Charms",
  productType: "Phone Charms Holder", quantity: "10", provider: "openai",
  color: "Transparent", material: "Plastic", includedComponents: "10 Pcs of Charms Holder",
};
const descriptors = ["Transparent", "Clear", "Mobile Case", "Lanyard Insert", "Attachment", "Metal Eyelet", "Phone Case", "Charm Attachment", "Clear Plastic", "Transparent Plastic"];
const uses = ["Tabs for Lanyards", "Inserts for Mobile Cases", "Tabs for Phone Charms", "Lanyard Attachment Tabs", "Clear Insert Tabs"];
const pool = descriptors.flatMap((descriptor) => uses.map((use) => `${descriptor} Phone Charms Holder ${use} (Pack of 10)`));
const request = (count, changes = {}) => new Request("http://localhost/api/ai/general-product-variant-titles", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ...input, count, usedTitles: [parentTitle], ...changes }),
});
const aiResponse = (titles) => Response.json({ output_text: JSON.stringify({ titles }) });

async function verify() {
  let calls = 0;
  const accumulated = load("app/api/ai/general-product-variant-titles/route.ts", async (_url, options) => {
    const body = JSON.parse(options.body);
    calls += 1;
    const items = body.text.format.schema.properties.titles;
    assert.equal(items.items.maxLength, 100);
    if (calls === 1) {
      assert.equal(items.minItems, 4);
      return aiResponse([pool[0], pool[1], parentTitle, pool[2].replace("Pack of 10", "Pack of 20")]);
    }
    assert.equal(items.minItems, 2, "Request only missing titles, not the full batch again");
    assert.ok(body.input.includes(pool[0]) && body.input.includes(pool[1]), "Exclude accepted titles on retries");
    assert.ok(body.input.includes("correction attempt 2"));
    return aiResponse([pool[2], pool[3]]);
  });
  const accumulatedResponse = await accumulated.POST(request(4));
  assert.equal(accumulatedResponse.status, 200);
  assert.deepEqual((await accumulatedResponse.json()).titles, pool.slice(0, 4));
  assert.equal(calls, 2);

  let partialCalls = 0;
  const partial = load("app/api/ai/general-product-variant-titles/route.ts", async () => aiResponse([pool[partialCalls++]]));
  const partialResponse = await partial.POST(request(10));
  assert.equal(partialResponse.status, 200, "An incomplete valid batch must not become a 500 or lose titles");
  const partialBody = await partialResponse.json();
  assert.deepEqual(partialBody.titles, pool.slice(0, 3));
  assert.equal(partialBody.remaining, 7);

  const duplicates = load("app/api/ai/general-product-variant-titles/route.ts", async () => aiResponse([parentTitle, parentTitle.toUpperCase()]));
  assert.equal((await duplicates.POST(request(2, { usedTitles: [] }))).status, 422, "The parent must always be excluded, even if omitted by the caller");
  let jsonCalls = 0;
  const malformed = load("app/api/ai/general-product-variant-titles/route.ts", async () => {
    jsonCalls += 1;
    return jsonCalls === 1 ? Response.json({ output_text: '{"titles":[' }) : aiResponse([pool[0]]);
  });
  assert.equal((await malformed.POST(request(1))).status, 200);
  assert.equal(jsonCalls, 2, "Retry malformed model JSON");

  const gemini = load("app/api/ai/general-product-variant-titles/route.ts", async (url) => {
    assert.ok(url.startsWith("https://generativelanguage.googleapis.com/"));
    return Response.json({ candidates: [{ content: { parts: [{ text: "```json\n" + JSON.stringify({ titles: ["1. " + pool[0].replace("(Pack of 10)", "( pack of 10 ).")] }) + "\n```" }] } }] });
  });
  const geminiResponse = await gemini.POST(request(1, { provider: "gemini" }));
  assert.equal(geminiResponse.status, 200);
  assert.deepEqual((await geminiResponse.json()).titles, [pool[0]], "Normalize formatting without changing the confirmed pack count");

  let errorCalls = 0;
  const providerError = load("app/api/ai/general-product-variant-titles/route.ts", async () => {
    errorCalls += 1;
    return errorCalls === 1 ? aiResponse([pool[0]]) : Response.json({ error: { message: "Provider quota exceeded" } }, { status: 429 });
  });
  const errorResponse = await providerError.POST(request(2));
  assert.equal(errorResponse.status, 500, "A real provider error is still reported");
  const errorBody = await errorResponse.json();
  assert.deepEqual(errorBody.titles, [pool[0]], "Keep accepted titles even when a subsequent provider call fails");
  assert.match(errorBody.error, /quota exceeded/);

  const { generateGeneralProductVariantTitles } = load("lib/general-product-variant-generation.ts");
  let saved = [];
  const counts = [];
  const thirty = await generateGeneralProductVariantTitles({
    input, requested: 30, usedTitles: [], onProgress: (titles) => { saved = [...titles]; },
    fetcher: async (_url, options) => {
      const body = JSON.parse(options.body);
      counts.push(body.count);
      const available = pool.filter((title) => !body.usedTitles.includes(title));
      // A partial first response must be retained and completed automatically.
      return Response.json({ titles: available.slice(0, counts.length === 1 ? 4 : body.count) });
    },
  });
  assert.equal(thirty.length, 30);
  assert.equal(new Set(thirty.map((title) => title.toLowerCase())).size, 30);
  assert.deepEqual(counts, [10, 10, 10, 6]);
  assert.equal(saved.length, 30);

  let clientCalls = 0;
  saved = [];
  await assert.rejects(generateGeneralProductVariantTitles({
    input, requested: 30, usedTitles: [], onProgress: (titles) => { saved = [...titles]; },
    fetcher: async () => {
      clientCalls += 1;
      return clientCalls === 1 ? Response.json({ titles: pool.slice(0, 10) })
        : Response.json({ titles: [pool[10]], error: "Provider unavailable" }, { status: 500 });
    },
  }), /11 of 30 titles are saved/);
  assert.equal(saved.length, 11, "Preserve successful earlier batches and partial error responses");
  const resumedCounts = [];
  const resumed = await generateGeneralProductVariantTitles({
    input, requested: 30, usedTitles: [], preparedTitles: saved, onProgress: (titles) => { saved = [...titles]; },
    fetcher: async (_url, options) => {
      const body = JSON.parse(options.body);
      resumedCounts.push(body.count);
      return Response.json({ titles: pool.filter((title) => !body.usedTitles.includes(title)).slice(0, body.count) });
    },
  });
  assert.equal(resumed.length, 30);
  assert.deepEqual(resumedCounts, [10, 9], "Resume only the remaining 19 titles");

  let stagnantCalls = 0;
  await assert.rejects(generateGeneralProductVariantTitles({
    input, requested: 30, usedTitles: [], onProgress: () => {},
    fetcher: async () => { stagnantCalls += 1; return Response.json({ titles: [parentTitle] }); },
  }), /no new valid titles/);
  assert.equal(stagnantCalls, 1, "Do not run an endless paid retry loop when the model makes no progress");

  console.log("Variant generation verified: incremental retries, partial results, both providers, safe formatting, 30 unique titles, preserved failure progress, resumable batches, and bounded retries.");
}
verify().catch((error) => { console.error(error); process.exitCode = 1; });

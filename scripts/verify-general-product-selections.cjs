const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { createRequire } = require("node:module");

const root = path.resolve(__dirname, "..");
const expectedTitle = "Universal Transparent Mobile Case Lanyard Insert Tabs Phone Charms Holder (Pack of 10)";
const selections = {
  category: "Beads & Charms", genericName: "Beads & Charms",
  productType: "Phone Charms Holder", quantity: "10",
};

function load(relativePath, overrides = {}) {
  const filename = path.join(root, relativePath);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const originalRequire = createRequire(filename);
  vm.runInNewContext(source, {
    exports: module.exports, module, Buffer, File, FormData, Request, Response, URL, AbortSignal,
    SyntaxError, console,
    process: { env: { OPENAI_API_KEY: "verification-only", GEMINI_API_KEY: "verification-only" } },
    require: (name) => name === "@/lib/general-product-listing"
      ? helpers
      : name === "next/server"
        ? { NextResponse: { json: (value, options) => Response.json(value, options) } }
        : originalRequire(name),
    ...overrides,
  });
  return module.exports;
}

const helpers = load("lib/general-product-listing.ts");

function imageRequest(provider = "openai", changes = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ ...selections, provider, ...changes })) {
    form.set(key, value);
  }
  form.set("image", new File([new Uint8Array([1, 2, 3])], "MBRO-CHM-HLDR-GLD-10PC-V1.png", { type: "image/png" }));
  return new Request("http://localhost/api/ai/general-product-copy", { method: "POST", body: form });
}

function aiResult(title) {
  return {
    title, category: "AI guessed category", genericName: "ID Card Holders",
    productType: "ID Card Holders", netQuantity: "5", variation: "Free Size",
    color: "Transparent", material: "Not specified", theme: "Not specified",
    includedComponents: "10 Phone Charms Holders", weightGrams: "",
    description: "Transparent lanyard insert tabs for attaching phone charms to mobile cases.",
    skuCodes: { productCode: "HLDR", colorCode: "GLD" },
  };
}

async function verify() {
  const parsed = helpers.parseGeneralProductImageName("MBRO-CHM-HLDR-GLD-10PC-V1.png");
  assert.ok(parsed);
  assert.equal(parsed.quantity, "10");
  assert.equal(helpers.createGeneralProductSku(parsed.codes, parsed.quantity), "MBRO-CHM-HLDR-GLD-10PC-V1");
  assert.equal(helpers.createGeneralProductSku(parsed.codes, "30", 31), "MBRO-CHM-HLDR-GLD-30PC-V31");
  assert.equal(helpers.createGeneralProductSku(parsed.codes, "0"), "");
  assert.equal(helpers.normalizeGeneralProductSku("  MBRO-JWL-NCKL-GRN-10PC-V1.D  "), "MBRO-JWL-NCKL-GRN-10PC-V1");
  assert.equal(helpers.generalProductSkuError("MY-OWN_001"), "");
  assert.ok(helpers.generalProductSkuError("=INVALID"));
  assert.equal(helpers.parseGeneralProductImageName("MBRO-JWL-NCKL-GRN-10PC-V1.D.png").quantity, "10", "Legacy image filenames remain readable");
  assert.equal(helpers.parseGeneralProductImageName("product.png"), null);
  assert.equal(helpers.selectedProductTitle(expectedTitle, selections), expectedTitle);
  assert.equal(helpers.selectedProductTitle("Transparent ID Card Holders (Pack of 10)", selections), "");
  assert.equal(helpers.selectedProductTitle("Phone Charms Holder for ID Cards (Pack of 10)", selections), "");
  assert.equal(helpers.selectedProductTitle(expectedTitle.replace("Pack of 10", "Pack of 20"), selections), "");
  const holderCodes = helpers.generalProductSkuCodesForListing({ productName: expectedTitle.replace("Pack of 10", "Pack of 3"),
    category: "Beads & Charms", productType: "Phone Charms Holder", color: "Transparent" }, { productCode: "HLDR", colorCode: "GLD" });
  assert.equal(helpers.createGeneralProductSku(holderCodes, "3"), "MBRO-CHM-HLDR-GLD-3PC-V1");
  assert.equal(helpers.createGeneralProductSku(holderCodes, "3", 2), "MBRO-CHM-HLDR-GLD-3PC-V2");
  const beadsCodes = helpers.generalProductSkuCodesForListing({ productName: "Blue Craft Beads for Jewellery Making (Pack of 3)",
    category: "Beads & Charms", productType: "Craft Beads", color: "Blue" }, { productCode: "HLDR", colorCode: "GLD" });
  assert.equal(helpers.createGeneralProductSku(beadsCodes, "3"), "MBRO-CHM-BEAD-BLU-3PC-V1", "Title and selected identity override stale holder/gold codes");
  const customCodes = helpers.generalProductSkuCodesForListing({ productName: "Red Desk Cable Clips for Organizing Wires (Pack of 3)",
    category: "Stationery", productType: "Desk Cable Clips", color: "Red", brandCode: "ACME" }, { productCode: "CBCL", colorCode: "RED" });
  assert.equal(helpers.createGeneralProductSku(customCodes, "3"), "ACME-STN-CBCL-RED-3PC-V1");
  const fallbackCodes = helpers.generalProductSkuCodesForListing({ productName: expectedTitle,
    category: "Beads & Charms", productType: "Phone Charms Holder", color: "Silver" }, { productCode: "bad-code", colorCode: "invalid-code-long" });
  assert.equal(helpers.createGeneralProductSku(fallbackCodes, "10"), "MBRO-CHM-HLDR-SLV-10PC-V1");

  let calls = 0;
  const openai = load("app/api/ai/general-product-copy/route.ts", {
    fetch: async (url, options) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      const body = JSON.parse(options.body);
      const prompt = body.input[0].content[0].text;
      assert.ok(prompt.includes('"productType":"Phone Charms Holder"'));
      assert.ok(prompt.includes('"quantity":"10"'));
      assert.ok(body.input[0].content[1].image_url.startsWith("data:image/png;base64,"));
      const schema = body.text.format.schema;
      assert.ok(schema.required.includes("skuCodes"));
      assert.equal(schema.properties.skuCodes.additionalProperties, false);
      assert.deepEqual(schema.properties.skuCodes.required, ["productCode", "colorCode"]);
      assert.ok(prompt.includes("MBRO-CHM-HLDR-GLD-3PC-V1"));
      calls += 1;
      return Response.json({ output: [{ content: [{
        type: "output_text",
        text: JSON.stringify(aiResult(calls === 1 ? "Transparent ID Card Holders (Pack of 10)" : expectedTitle)),
      }] }] });
    },
  });
  const openaiResponse = await openai.POST(imageRequest());
  assert.equal(openaiResponse.status, 200);
  const openaiBody = await openaiResponse.json();
  assert.equal(calls, 2, "Retry the misclassified title");
  assert.equal(openaiBody.title, expectedTitle);
  assert.equal(openaiBody.category, selections.category);
  assert.equal(openaiBody.genericName, selections.genericName);
  assert.equal(openaiBody.productType, selections.productType);
  assert.equal(openaiBody.netQuantity, "10", "Use seller pack quantity instead of visible item count");
  assert.equal(openaiBody.sku, "MBRO-CHM-HLDR-GLD-10PC-V1");
  assert.equal(openaiBody.styleId, openaiBody.sku);
  assert.equal(openaiBody.skuCodes.colorCode, "GLD");

  const missingResponse = await openai.POST(imageRequest("openai", { category: "" }));
  assert.equal(missingResponse.status, 400);
  assert.equal(calls, 2, "Validate selections before making any AI calls");
  const badQuantityResponse = await openai.POST(imageRequest("openai", { quantity: "1.5" }));
  assert.equal(badQuantityResponse.status, 400);

  const gemini = load("app/api/ai/general-product-copy/route.ts", {
    fetch: async (url, options) => {
      assert.ok(url.startsWith("https://generativelanguage.googleapis.com/"));
      const body = JSON.parse(options.body);
      assert.ok(body.contents[0].parts[1].text.includes('"productType":"Phone Charms Holder"'));
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(aiResult(expectedTitle)) }] } }] });
    },
  });
  const geminiResponse = await gemini.POST(imageRequest("gemini"));
  assert.equal(geminiResponse.status, 200);
  assert.equal((await geminiResponse.json()).sku, "MBRO-CHM-HLDR-GLD-10PC-V1");

  for (const provider of ["openai", "gemini"]) {
    const threePiece = load("app/api/ai/general-product-copy/route.ts", {
      fetch: async (_url, options) => {
        const body = JSON.parse(options.body);
        const prompt = provider === "openai" ? body.input[0].content[0].text : body.contents[0].parts[1].text;
        assert.ok(prompt.includes('"quantity":"3"'));
        const result = aiResult(expectedTitle.replace("Pack of 10", "Pack of 3"));
        result.netQuantity = "10"; // Visible sample count must not override the chosen pack.
        return Response.json(provider === "openai" ? { output_text: JSON.stringify(result) }
          : { candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }] });
      },
    });
    const response = await threePiece.POST(imageRequest(provider, { quantity: "3" }));
    assert.equal(response.status, 200);
    const product = await response.json();
    assert.equal(product.netQuantity, "3");
    assert.equal(product.sku, "MBRO-CHM-HLDR-GLD-3PC-V1");
    assert.equal(product.styleId, product.sku);
  }

  const hostedUrl = "https://upload.meeshosupplyassets.com/cataloging/1782304788897/MBRO-CHM-HLDR-GLD-10PC-V1.png";
  let hostedCalls = 0;
  const hosted = load("app/api/ai/general-product-copy/route.ts", {
    fetch: async (url, options) => {
      hostedCalls += 1;
      if (url === hostedUrl) {
        assert.equal(options.redirect, "error", "Do not follow redirects to private or unknown hosts");
        return new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/png" } });
      }
      assert.equal(url, "https://api.openai.com/v1/responses");
      return Response.json({ output_text: JSON.stringify(aiResult(expectedTitle)) });
    },
  });
  const hostedRequest = (url) => {
    const form = new FormData();
    for (const [key, value] of Object.entries({ ...selections, provider: "openai", imageUrl: url })) form.set(key, value);
    return new Request("http://localhost/api/ai/general-product-copy", { method: "POST", body: form });
  };
  const hostedResponse = await hosted.POST(hostedRequest(hostedUrl));
  assert.equal(hostedResponse.status, 200);
  assert.equal((await hostedResponse.json()).imageUrl, hostedUrl, "Keep the already-hosted image without another upload");
  assert.equal(hostedCalls, 2);
  for (const unsafeUrl of ["http://127.0.0.1/image.png", "https://localhost/image.png", "https://upload.meeshosupplyassets.com.evil.example/image.png", "https://upload.meeshosupplyassets.com:444/image.png"]) {
    assert.equal((await hosted.POST(hostedRequest(unsafeUrl))).status, 400);
  }
  assert.equal(hostedCalls, 2, "Reject unsafe image URLs before fetching or using AI");

  const titles = [
    "Transparent Lanyard Insert Tabs Phone Charms Holder (Pack of 10)",
    "Universal Mobile Case Attachment Tabs Phone Charms Holder (Pack of 10)",
  ];
  let variantCalls = 0;
  const variants = load("app/api/ai/general-product-variant-titles/route.ts", {
    fetch: async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.ok(body.input.includes("Confirmed pack quantity: 10"));
      variantCalls += 1;
      return Response.json({ output_text: JSON.stringify({
        titles: variantCalls === 1 ? [expectedTitle, titles[0].replace("Pack of 10", "Pack of 20")] : titles,
      }) });
    },
  });
  const variantsResponse = await variants.POST(new Request("http://localhost/api/ai/general-product-variant-titles", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...selections, parentTitle: expectedTitle, count: 2, provider: "openai", usedTitles: [expectedTitle] }),
  }));
  assert.equal(variantsResponse.status, 200);
  assert.equal(variantCalls, 2, "Reject reused titles and incorrect pack quantities");
  assert.deepEqual((await variantsResponse.json()).titles, titles);

  console.log("General product selections verified: both providers, AI product/colour SKU codes, exact 3PC example, variable product types, title/pack agreement, safe fallbacks, matching IDs, and unique variants.");
}

verify().catch((error) => { console.error(error); process.exitCode = 1; });

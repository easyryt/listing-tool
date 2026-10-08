const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const ExcelJS = require("exceljs");

async function verify() {
  const projectRoot = path.resolve(__dirname, "..");
  const templatePath = path.join(projectRoot, "public", "general-products-template.xlsx");
  const template = fs.readFileSync(templatePath);
  const source = fs.readFileSync(path.join(projectRoot, "lib", "general-product-excel.ts"), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  let downloadedBlob;
  const columnsModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(projectRoot, "lib", "general-product-columns.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module: columnsModule, exports: columnsModule.exports });
  const exporter = { exports: {} };
  vm.runInNewContext(compiled, {
    exports: exporter.exports,
    module: exporter,
    Blob,
    fetch: async (url) => {
      assert.equal(url, "/general-products-template.xlsx");
      return { ok: true, arrayBuffer: async () => template };
    },
    require: (name) => name === "file-saver"
      ? { saveAs: (blob) => { downloadedBlob = blob; } }
      : name === "./general-product-columns" ? columnsModule.exports : require(name),
  });

  const product = Object.fromEntries([
    "id", "productName", "category", "variation", "price", "wrongDefectiveReturnsPrice",
    "mrp", "gst", "hsn", "weight", "inventory", "country", "manufacturer",
    "manufacturerAddress", "manufacturerPincode", "packer", "packerAddress",
    "packerPincode", "importer", "importerAddress", "importerPincode", "color",
    "genericName", "includedComponents", "material", "quantity", "length", "width",
    "theme", "productType", "image1", "image2", "image3", "image4", "styleId", "sku",
    "brand", "groupId", "description",
  ].map((field) => [field, ""]));
  Object.assign(product, {
    id: "verification-parent",
    productName: "Decorative Craft Beads for Jewellery Making and Art Projects",
    category: "Beads & Charms",
    genericName: "Beads & Charms",
    includedComponents: "30 craft beads",
    variation: "Free Size",
    price: "99",
    wrongDefectiveReturnsPrice: "98",
    mrp: "199",
    gst: "18",
    hsn: "003296",
    quantity: "30",
    image1: "https://example.com/craft-beads.png",
    styleId: "CRAFTBEADS",
    sku: "CRAFTBEADS-V1",
    brand: "Example",
    groupId: "1",
    description: "Decorative beads for craft projects.",
  });

  await exporter.exports.exportGeneralProductExcel([product]);
  assert.ok(downloadedBlob, "Export should download a workbook");

  const output = new ExcelJS.Workbook();
  await output.xlsx.load(Buffer.from(await downloadedBlob.arrayBuffer()));
  const input = new ExcelJS.Workbook();
  await input.xlsx.load(template);
  assert.deepEqual(output.worksheets.map((sheet) => sheet.name), input.worksheets.map((sheet) => sheet.name));
  const previewColumns = await exporter.exports.readGeneralProductTemplateColumns({ arrayBuffer: async () => template });
  assert.deepEqual(JSON.parse(JSON.stringify(previewColumns)), JSON.parse(JSON.stringify(columnsModule.exports.GENERAL_PRODUCT_TEMPLATE_COLUMNS)), "Preview field names and order match the included Excel sheet");
  assert.equal(previewColumns.length, 31);
  assert.ok(previewColumns.every(({ field }) => !["category", "productType", "length", "width", "color", "material", "theme"].includes(field)));
  if (process.argv[2]) {
    const suppliedTemplate = fs.readFileSync(path.resolve(process.argv[2]));
    const suppliedColumns = await exporter.exports.readGeneralProductTemplateColumns({ arrayBuffer: async () => suppliedTemplate });
    assert.deepEqual(JSON.parse(JSON.stringify(suppliedColumns)), JSON.parse(JSON.stringify(previewColumns)), "The supplied workbook and included template have the same preview columns");
  }
  assert.equal(columnsModule.exports.generalProductColumnForHeader("\n\nERROR STATUS\n\nFor system use"), undefined, "System fields are never preview/edit columns");
  assert.equal(columnsModule.exports.generalProductColumnForHeader("\n\nSeller SKU ID\n\nExplanation").field, "sku");
  assert.equal(columnsModule.exports.generalProductColumnForHeader("Net Weight (g)").numeric, true);
  assert.deepEqual(JSON.parse(JSON.stringify(columnsModule.exports.generalProductPreviewColumns([
    { field: "width", label: "Width" }, { field: "sku", label: "SKU ID" }, { field: "length", label: "Length" },
  ]))), [{ field: "sku", label: "SKU ID" }], "Dimensions are excluded even if another template contains them");

  const listing = output.getWorksheet("Beads---Charms-Fill this");
  assert.ok(listing, "Must use the listing tab after the Instructions tab");
  for (const [index, column] of previewColumns.entries()) {
    assert.equal(listing.getCell(5, index + 4).text, product[column.field], `${column.label} preview value must land in the matching Excel column`);
  }
  assert.equal(listing.getCell("D5").value, product.productName);
  assert.equal(listing.getCell("F5").value, 99);
  assert.equal(listing.getCell("G5").value, 98);
  assert.equal(listing.getCell("J5").value, "003296", "HSN identifiers must retain leading zeroes");
  assert.equal(listing.getCell("W5").value, "Beads & Charms");
  assert.equal(listing.getCell("X5").value, "30 craft beads");
  assert.equal(listing.getCell("Y5").value, 30);
  assert.equal(listing.getCell("Z5").value, product.image1);
  assert.equal(listing.getCell("AD5").value, "CRAFTBEADS");
  assert.equal(listing.getCell("AE5").value, "CRAFTBEADS-V1");
  assert.equal(listing.getCell("AF5").value, "Example");
  assert.equal(listing.getCell("AG5").value, "1", "Numeric group identifier matches preview");
  assert.equal(listing.getCell("AH5").value, product.description);
  assert.equal(listing.getCell("D6").value, null, "Must remove unused sample listings");
  assert.equal(output.getWorksheet("Instructions").getCell("A3").text, input.getWorksheet("Instructions").getCell("A3").text);
  assert.deepEqual(listing.getCell("E5").dataValidation, input.getWorksheet("Beads---Charms-Fill this").getCell("E5").dataValidation);
  assert.equal(output.getWorksheet("Validation Sheet").getCell("W3").value, "Beads & Charms");

  const variants = Array.from({ length: 30 }, (_, index) => ({
    ...product,
    id: `verification-variant-${index + 2}`,
    groupId: String(index + 2),
    productName: `Decorative Craft Beads for Art Projects Variant ${index + 2}`,
    sku: `CRAFTBEADS-V${index + 2}`,
  }));
  await exporter.exports.exportGeneralProductExcel([product, ...variants]);
  const batch = new ExcelJS.Workbook();
  await batch.xlsx.load(Buffer.from(await downloadedBlob.arrayBuffer()));
  const batchListing = batch.getWorksheet("Beads---Charms-Fill this");
  assert.equal(batchListing.getCell("AE35").value, "CRAFTBEADS-V31");
  assert.equal(batchListing.getCell("D36").value, null);

  const helperModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(
    fs.readFileSync(path.join(projectRoot, "lib", "general-product-listing.ts"), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText, { exports: helperModule.exports, module: helperModule });
  const { codes } = helperModule.exports.parseGeneralProductImageName("MBRO-CHM-HLDR-GLD-10PC-V1.png");
  const holderRows = Array.from({ length: 31 }, (_, index) => {
    const sku = helperModule.exports.createGeneralProductSku(codes, "10", index + 1);
    return {
      ...product,
      id: `holder-${index + 1}`,
      groupId: String(index + 1),
      productName: "Universal Transparent Mobile Case Lanyard Insert Tabs Phone Charms Holder (Pack of 10)",
      genericName: "Beads & Charms",
      quantity: "10",
      includedComponents: "10 Phone Charms Holders",
      styleId: sku,
      sku,
    };
  });
  await exporter.exports.exportGeneralProductExcel(holderRows);
  const holderWorkbook = new ExcelJS.Workbook();
  await holderWorkbook.xlsx.load(Buffer.from(await downloadedBlob.arrayBuffer()));
  const holderListing = holderWorkbook.getWorksheet("Beads---Charms-Fill this");
  for (let index = 0; index < holderRows.length; index += 1) {
    const expectedSku = `MBRO-CHM-HLDR-GLD-10PC-V${index + 1}`;
    assert.equal(holderListing.getCell(`AD${index + 5}`).value, expectedSku);
    assert.equal(holderListing.getCell(`AE${index + 5}`).value, expectedSku);
    assert.equal(holderListing.getCell(`Y${index + 5}`).value, 10);
    assert.equal(holderListing.getCell(`AG${index + 5}`).value, String(index + 1));
  }

  const mixedProducts = [holderRows[0], { ...holderRows[1], price: "70" }, {
    ...holderRows[0], id: "second-parent", quantity: "15", price: "84", wrongDefectiveReturnsPrice: "83",
    productName: holderRows[0].productName.replace("Pack of 10", "Pack of 15"),
    includedComponents: "15 Pcs of Charms Holder", groupId: "3",
    sku: "MBRO-CHM-HLDR-GLD-15PC-V1", styleId: "MBRO-CHM-HLDR-GLD-15PC-V1",
  }];
  await exporter.exports.exportGeneralProductExcel(mixedProducts);
  const mixedWorkbook = new ExcelJS.Workbook();
  await mixedWorkbook.xlsx.load(Buffer.from(await downloadedBlob.arrayBuffer()));
  const mixedListing = mixedWorkbook.getWorksheet("Beads---Charms-Fill this");
  assert.equal(mixedListing.getCell("F6").value, 70, "Keep edited variant pricing");
  assert.equal(mixedListing.getCell("F7").value, 84);
  assert.equal(mixedListing.getCell("G7").value, 83, "Export the actual returns price, not the phone listing discount");
  assert.equal(mixedListing.getCell("Y7").value, 15);
  assert.equal(mixedListing.getCell("AE7").value, "MBRO-CHM-HLDR-GLD-15PC-V1");
  assert.equal(mixedListing.getCell("AG5").value, "1");
  assert.equal(mixedListing.getCell("AG6").value, "2", "Variant has its own group");
  assert.equal(mixedListing.getCell("AG7").value, "3");
  assert.equal(mixedListing.getCell("D8").value, null);

  const customSkuRows = [
    { ...holderRows[0], sku: "SELLER-PARENT_001", styleId: "SELLER-PARENT_001" },
    { ...holderRows[1], sku: "SELLER-VARIANT_002", styleId: "SELLER-VARIANT_002" },
  ];
  await exporter.exports.exportGeneralProductExcel(customSkuRows);
  const customWorkbook = new ExcelJS.Workbook();
  await customWorkbook.xlsx.load(Buffer.from(await downloadedBlob.arrayBuffer()));
  const customListing = customWorkbook.getWorksheet("Beads---Charms-Fill this");
  assert.equal(customListing.getCell("AD5").value, "SELLER-PARENT_001");
  assert.equal(customListing.getCell("AE5").value, "SELLER-PARENT_001");
  assert.equal(customListing.getCell("AD6").value, "SELLER-VARIANT_002");
  assert.equal(customListing.getCell("AE6").value, "SELLER-VARIANT_002");

  console.log("General product export verified: multiple parents and pack sizes, editable variant prices, 30 variants, matching  IDs, exact columns, numeric prices, identifiers, dropdowns, and unchanged reference tabs.");
}

verify().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

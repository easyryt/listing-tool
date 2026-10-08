import type {
  CellFormulaValue,
  CellSharedFormulaValue,
  Worksheet,
} from "exceljs";
import { saveAs } from "file-saver";
import { generalProductColumnForHeader, generalProductPreviewColumns, type GeneralProductColumn } from "./general-product-columns";

export type GeneralProductListing = {
  id: string;
  productName: string;
  category: string;
  variation: string;
  price: string;
  wrongDefectiveReturnsPrice: string;
  mrp: string;
  gst: string;
  hsn: string;
  weight: string;
  inventory: string;
  country: string;
  manufacturer: string;
  manufacturerAddress: string;
  manufacturerPincode: string;
  packer: string;
  packerAddress: string;
  packerPincode: string;
  importer: string;
  importerAddress: string;
  importerPincode: string;
  color: string;
  genericName: string;
  includedComponents: string;
  material: string;
  quantity: string;
  length: string;
  width: string;
  theme: string;
  productType: string;
  image1: string;
  image2: string;
  image3: string;
  image4: string;
  styleId: string;
  sku: string;
  brand: string;
  groupId: string;
  description: string;
};

function materializeSharedFormulas(worksheet: Worksheet) {
  const formulas: Array<{
    address: string;
    formula: string;
    result?: CellFormulaValue["result"];
  }> = [];

  worksheet.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (!cell.formulaType) return;

      const value = cell.value as CellFormulaValue | CellSharedFormulaValue;
      formulas.push({
        address: cell.address,
        formula: cell.formula,
        result: value.result,
      });
    });
  });

  for (const { address, formula, result } of formulas) {
    const value: CellFormulaValue = { formula };
    if (result !== undefined) value.result = result;
    worksheet.getCell(address).value = value;
  }
}

function excelValue(value: string) {
  const trimmed = value.trim();

  if (!trimmed) return "";

  const numeric = Number(trimmed);
  return Number.isFinite(numeric) && /^\d+(\.\d+)?$/.test(trimmed)
    ? numeric
    : trimmed;
}

type ExportField = Exclude<keyof GeneralProductListing, "id">;
type ColumnMap = Partial<Record<ExportField, string>>;

function columnsFromTemplate(worksheet: Worksheet) {
  const found = new Map<ExportField, GeneralProductColumn & { column: string; index: number }>();
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber > 4) return;
    row.eachCell({ includeEmpty: false }, (cell, index) => {
      const definition = generalProductColumnForHeader(cell.text);
      if (definition && !found.has(definition.field)) {
        found.set(definition.field, { ...definition, column: cell.address.replace(/\d+$/, ""), index });
      }
    });
  });
  return [...found.values()].sort((left, right) => left.index - right.index);
}

function columnMapFromTemplate(worksheet: Worksheet): ColumnMap {
  return Object.fromEntries(columnsFromTemplate(worksheet).map(({ field, column }) => [field, column]));
}

export async function readGeneralProductTemplateColumns(file: File): Promise<GeneralProductColumn[]> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const supported = workbook.worksheets.filter((sheet) => {
    const map = columnMapFromTemplate(sheet);
    return sheet.state === "visible" && map.productName && map.sku;
  });
  const sheet = supported.find((entry) => /fill\s*this/i.test(entry.name))
    || supported.find((entry) => !/example|sample/i.test(entry.name)) || supported[0];
  if (!sheet) throw new Error("Choose a marketplace listing template containing Product Name and SKU ID columns.");
  return generalProductPreviewColumns(columnsFromTemplate(sheet).map(({ field, label, numeric }) => ({ field, label, numeric })));
}

function writeCell(
  row: ReturnType<Worksheet["getRow"]>,
  columns: ColumnMap,
  field: ExportField,
  value: string,
  numeric = false,
) {
  const column = columns[field];
  if (!column) return;
  row.getCell(column).value = numeric ? excelValue(value) : value;
}

export async function exportGeneralProductExcel(
  products: GeneralProductListing[],
  fileName = "general-product-listings.xlsx",
  templateFile?: File | null,
) {
  if (!products.length) {
    throw new Error("Create at least one product or variant before exporting.");
  }

  const ExcelJS = (await import("exceljs")).default;
  let templateBuffer: ArrayBuffer;

  if (templateFile) {
    templateBuffer = await templateFile.arrayBuffer();
  } else {
    const response = await fetch("/general-products-template.xlsx");
    if (!response.ok) throw new Error("Unable to load the listing template.");
    templateBuffer = await response.arrayBuffer();
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBuffer);

  const supportedSheets = workbook.worksheets
    .map((worksheet) => ({ worksheet, columns: columnMapFromTemplate(worksheet) }))
    .filter(({ worksheet, columns }) =>
      worksheet.state === "visible" && columns.productName && columns.sku,
    );
  const listingSheet =
    supportedSheets.find(({ worksheet }) => /fill\s*this/i.test(worksheet.name)) ||
    supportedSheets.find(({ worksheet }) => !/example|sample/i.test(worksheet.name)) ||
    supportedSheets[0];

  if (!listingSheet) {
    throw new Error(
      "This workbook is not a supported listing template. Upload the marketplace category template that contains Product Name and SKU ID columns.",
    );
  }

  const { worksheet, columns } = listingSheet;
  materializeSharedFormulas(worksheet);

  const firstDataRow = 5;
  const existingDataLastRow = Array.from(
    { length: Math.max(worksheet.rowCount - firstDataRow + 1, 0) },
    (_, index) => firstDataRow + index,
  ).reduce((lastRow, candidate) => {
    const title = worksheet
      .getRow(candidate)
      .getCell(columns.productName as string)
      .text.trim();

    return title ? candidate : lastRow;
  }, firstDataRow - 1);

  let rowNumber = firstDataRow;

  for (const product of products) {
    const row = worksheet.getRow(rowNumber);

    writeCell(row, columns, "productName", product.productName);
    writeCell(row, columns, "variation", product.variation);
    writeCell(row, columns, "price", product.price, true);
    writeCell(row, columns, "wrongDefectiveReturnsPrice", product.wrongDefectiveReturnsPrice, true);
    writeCell(row, columns, "mrp", product.mrp, true);
    writeCell(row, columns, "gst", product.gst, true);
    writeCell(row, columns, "hsn", product.hsn);
    writeCell(row, columns, "weight", product.weight, true);
    writeCell(row, columns, "inventory", product.inventory, true);
    writeCell(row, columns, "country", product.country);
    writeCell(row, columns, "manufacturer", product.manufacturer);
    writeCell(row, columns, "manufacturerAddress", product.manufacturerAddress);
    writeCell(row, columns, "manufacturerPincode", product.manufacturerPincode);
    writeCell(row, columns, "packer", product.packer);
    writeCell(row, columns, "packerAddress", product.packerAddress);
    writeCell(row, columns, "packerPincode", product.packerPincode);
    writeCell(row, columns, "importer", product.importer);
    writeCell(row, columns, "importerAddress", product.importerAddress);
    writeCell(row, columns, "importerPincode", product.importerPincode);
    writeCell(row, columns, "color", product.color);
    writeCell(row, columns, "genericName", product.genericName);
    writeCell(row, columns, "includedComponents", product.includedComponents);
    writeCell(row, columns, "material", product.material);
    writeCell(row, columns, "quantity", product.quantity, true);
    writeCell(row, columns, "length", product.length);
    writeCell(row, columns, "width", product.width);
    writeCell(row, columns, "theme", product.theme);
    writeCell(row, columns, "productType", product.productType);
    writeCell(row, columns, "image1", product.image1);
    writeCell(row, columns, "image2", product.image2);
    writeCell(row, columns, "image3", product.image3);
    writeCell(row, columns, "image4", product.image4);
    writeCell(row, columns, "styleId", product.styleId);
    writeCell(row, columns, "sku", product.sku);
    writeCell(row, columns, "brand", product.brand);
    writeCell(row, columns, "groupId", product.groupId);
    writeCell(row, columns, "description", product.description);
    row.commit();

    rowNumber += 1;
  }

  // Marketplace templates often include one or two filled sample rows. Remove
  // only the remaining source rows in the listing columns, while leaving their
  // validation rules and all system columns intact.
  const populatedColumns = Array.from(new Set(Object.values(columns)));
  for (let clearRow = rowNumber; clearRow <= existingDataLastRow; clearRow += 1) {
    const row = worksheet.getRow(clearRow);
    for (const column of populatedColumns) {
      row.getCell(column).value = null;
    }
    row.commit();
  }

  const output = await workbook.xlsx.writeBuffer();
  saveAs(
    new Blob([output], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    fileName,
  );
}

import { MODEL_CODES } from "./models";

// =====================================
// Brand Codes
// =====================================

const BRAND_CODES: Record<string, string> = {
  Mobiro: "MBRO",
};

// =====================================
// Category Codes
// =====================================

const CATEGORY_CODES: Record<string, string> = {
  "Mobile Cases & Covers": "MC",
};

// =====================================
// Color Codes
// =====================================

const COLOR_CODES: Record<string, string> = {
  Transparent: "TRNSPT",
  Black: "BLK",
  White: "WHT",
  Blue: "BLU",
  Pink: "PNK",
  Red: "RED",
  Green: "GRN",
  Purple: "PPL",
  Yellow: "YLW",
  Grey: "GRY",
};

// =====================================
// Helper Functions
// =====================================

function getBrandCode(brand: string) {
  return BRAND_CODES[brand.trim()] ?? brand.trim().toUpperCase();
}

function getCategoryCode(category: string) {
  return (
    CATEGORY_CODES[category.trim()] ??
    category.trim().toUpperCase()
  );
}

function getModelCode(model: string) {
  return MODEL_CODES[model.trim()] ?? model.trim();
}

function getColorCode(color: string) {
  return (
    COLOR_CODES[color.trim()] ??
    color.trim().toUpperCase()
  );
}

// =====================================
// SKU Generator
// =====================================

type SKUProps = {
  brand?: string;
  category?: string;
  model?: string;
  color?: string;
  printType?: string;
  finish?: string;
  designCode?: string;
  designNumber?: string;
  version?: string;
};

export function generateSKU({
  brand,
  category,
  model,
  color,
  printType,
  finish,
  designCode,
  designNumber,
  version,
}: SKUProps) {
  return [
    getBrandCode(brand ?? ""),
    getCategoryCode(category ?? ""),
    getModelCode(model ?? ""),
    (printType ?? "UVV").toUpperCase(),
    (designCode ?? "DESIGN")
      .toUpperCase()
      .replace(/\s+/g, ""),
    (finish ?? "WL").toUpperCase(),
    getColorCode(color ?? ""),
    `${designNumber ?? "001"}.1.V${version ?? "1"}`,
  ].join("-");
}
// =====================================
// Phone Models
// =====================================

export const PHONE_MODELS = [
  // Apple
  "iPhone 11",
  "iPhone 12",
  "iPhone 13",
  "iPhone 14",
  "iPhone 15",
  "iPhone 16",

  // Samsung
  "Samsung S23",
  "Samsung S24",
  "Samsung S25",

  // OnePlus
  "OnePlus 12",
  "OnePlus 13",

  // Vivo
  "Vivo V40",
  "Vivo V50",

  // Realme
  "Realme 13",
  "Realme 14",

  // Redmi
  "Redmi Note 13",
  "Redmi Note 14",
] as const;

// =====================================
// SKU Model Codes
// =====================================

export const MODEL_CODES: Record<string, string> = {
  // Apple
  "iPhone 11": "AP-IP11",
  "iPhone 12": "AP-IP12",
  "iPhone 13": "AP-IP13",
  "iPhone 14": "AP-IP14",
  "iPhone 15": "AP-IP15",
  "iPhone 16": "AP-IP16",

  // Samsung
  "Samsung S23": "SAM-S23",
  "Samsung S24": "SAM-S24",
  "Samsung S25": "SAM-S25",

  // OnePlus
  "OnePlus 12": "OP-12",
  "OnePlus 13": "OP-13",

  // Vivo
  "Vivo V40": "VV40",
  "Vivo V50": "VV50",

  // Realme
  "Realme 13": "RM13",
  "Realme 14": "RM14",

  // Redmi
  "Redmi Note 13": "RN13",
  "Redmi Note 14": "RN14",
};

// =====================================
// Helper
// =====================================

export function getModelCode(model: string): string {
  const key = model.trim();
  return MODEL_CODES[key] ?? key;
}
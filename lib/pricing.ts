export const DEFAULT_WRONG_DEFECTIVE_RETURN_DISCOUNT = 2;
export const DEFAULT_PRODUCT_PRICE = 191;

export function getWrongDefectiveReturnDiscount(value: unknown) {
  if (
    value === undefined ||
    value === null ||
    (typeof value === "string" && !value.trim())
  ) {
    return DEFAULT_WRONG_DEFECTIVE_RETURN_DISCOUNT;
  }

  const numericValue = Number(value);

  return Number.isFinite(numericValue) &&
    numericValue >= 0 &&
    numericValue <= 30
    ? numericValue
    : DEFAULT_WRONG_DEFECTIVE_RETURN_DISCOUNT;
}

const VARIANT_PRICE_CYCLE_LENGTH = 5;

export function getVariantPrice(basePrice: number, variantNumber: unknown) {
  const numericVariantNumber = Number(variantNumber);
  const normalizedVariantNumber =
    Number.isInteger(numericVariantNumber) && numericVariantNumber > 0
      ? numericVariantNumber
      : 1;

  return basePrice + (normalizedVariantNumber - 1) % VARIANT_PRICE_CYCLE_LENGTH;
}

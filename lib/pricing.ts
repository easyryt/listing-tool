export const DEFAULT_WRONG_DEFECTIVE_RETURN_DISCOUNT = 2;

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

const VARIANT_PRICE_CYCLE = [191, 192, 193, 194, 195] as const;

export function getVariantPrice(variantNumber: unknown) {
  const numericVariantNumber = Number(variantNumber);
  const normalizedVariantNumber =
    Number.isInteger(numericVariantNumber) && numericVariantNumber > 0
      ? numericVariantNumber
      : 1;

  return VARIANT_PRICE_CYCLE[
    (normalizedVariantNumber - 1) % VARIANT_PRICE_CYCLE.length
  ];
}

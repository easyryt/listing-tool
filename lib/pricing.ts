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

export function getVariantPrice(
  firstPrice: unknown,
  variantNumber: unknown = 1,
) {
  const numericFirstPrice = Number(firstPrice);
  const numericVariantNumber = Number(variantNumber);

  const normalizedFirstPrice =
    Number.isFinite(numericFirstPrice) && numericFirstPrice >= 0
      ? numericFirstPrice
      : 191;

  const normalizedVariantNumber =
    Number.isInteger(numericVariantNumber) && numericVariantNumber > 0
      ? numericVariantNumber
      : 1;

  return normalizedFirstPrice + (normalizedVariantNumber - 1);
}

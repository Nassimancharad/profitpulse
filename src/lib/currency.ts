export const DEFAULT_LOCALE = "en-US";

export function normalizeCurrencyCode(value: string | null | undefined) {
  if (!value) return null;
  const cleaned = value.trim().toUpperCase();
  return cleaned.length ? cleaned : null;
}

export function getCurrencyFormatter({
  currency,
  locale = DEFAULT_LOCALE,
  options,
}: {
  currency?: string | null;
  locale?: string;
  options?: Intl.NumberFormatOptions;
}) {
  const currencyCode = normalizeCurrencyCode(currency);
  if (currencyCode) {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
      ...options,
    });
  }

  return new Intl.NumberFormat(locale, {
    style: "decimal",
    ...options,
  });
}

export function getNumberFormatter(
  locale: string = DEFAULT_LOCALE,
  options?: Intl.NumberFormatOptions,
) {
  return new Intl.NumberFormat(locale, options);
}

export function getPercentFormatter(
  locale: string = DEFAULT_LOCALE,
  options?: Intl.NumberFormatOptions,
) {
  return new Intl.NumberFormat(locale, { style: "percent", ...options });
}

export function getSharedCurrency(currencies: Array<string | null | undefined>) {
  const normalized = currencies.map((currency) => normalizeCurrencyCode(currency));
  const nonNull = normalized.filter((currency): currency is string => Boolean(currency));
  if (nonNull.length === 0) return null;
  if (nonNull.length !== normalized.length) return null;
  const [first] = nonNull;
  return nonNull.every((currency) => currency === first) ? first : null;
}

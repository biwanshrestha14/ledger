import { useMe } from './queries';

const digitsCache = new Map<string, number>();
export function currencyDigits(currency: string) {
  if (!digitsCache.has(currency)) {
    digitsCache.set(currency, new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2);
  }
  return digitsCache.get(currency)!;
}

/** Parse user-typed text ("1,234.56", "12") into integer minor units, or null if invalid. */
export function parseMoney(text: string, currency: string): number | null {
  const cleaned = text.replace(/[^\d.,-]/g, '').replace(/,(?=\d{3}(\D|$))/g, '').replace(',', '.');
  if (!cleaned || cleaned === '.' || cleaned === '-') return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10 ** currencyDigits(currency));
}

export function toMajor(minor: number, currency: string) {
  return minor / 10 ** currencyDigits(currency);
}

export function formatMoney(
  minor: number, currency: string, locale = 'en-IN',
  opts: { sign?: boolean; compact?: boolean; hideCents?: boolean } = {},
) {
  const major = toMajor(minor, currency);
  const f = new Intl.NumberFormat(locale, {
    style: 'currency', currency, currencyDisplay: 'narrowSymbol',
    notation: opts.compact ? 'compact' : 'standard',
    maximumFractionDigits: opts.compact ? 1 : opts.hideCents ? 0 : undefined,
    minimumFractionDigits: opts.hideCents || opts.compact ? 0 : undefined,
    signDisplay: opts.sign ? 'exceptZero' : 'auto',
  });
  return f.format(major).replace('-', '−');
}

/** Hook that returns a formatter bound to the signed-in user's currency and locale. */
export function useMoney() {
  const { data: me } = useMe();
  const currency = me?.currency ?? 'NPR';
  const locale = me?.locale ?? 'en-IN';
  const fmt = (minor: number, opts?: Parameters<typeof formatMoney>[3]) => formatMoney(minor, currency, locale, opts);
  fmt.currency = currency;
  fmt.locale = locale;
  fmt.parse = (t: string) => parseMoney(t, currency);
  fmt.toInput = (minor: number) => (minor ? toMajor(minor, currency).toFixed(currencyDigits(currency)) : '');
  fmt.symbol = new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? currency;
  return fmt;
}

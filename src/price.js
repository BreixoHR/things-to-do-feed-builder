/**
 * Precios en el formato de Google (google.type.Money): { currency_code, units, nanos }.
 *
 * Validación estricta de la entrada: parseFloat() acepta en silencio "1.2.3" (→ 1.2), "12abc" (→ 12)
 * o "1,234.50" (→ 1.234) y el precio publicado sale mal sin ningún aviso. Aquí cualquier importe
 * ambiguo devuelve null y el formulario lo marca. "19,99" → { units: 19, nanos: 990000000 }.
 *
 * Script UMD: lo usan el servidor (validación) y el navegador (formulario).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Price = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PRICE_RE = /^\s*(-)?(\d{1,12})(?:[.,](\d{1,9}))?\s*$/;

  /** "19,99" | "19.99" | "20" → { units, nanos } ; null si no es un importe válido. */
  function parseAmount(input) {
    const m = PRICE_RE.exec(String(input ?? ''));
    if (!m) return null;
    const sign = m[1] ? -1 : 1;
    const units = Number(m[2]);
    const nanos = Number((m[3] || '').padEnd(9, '0'));
    // En Money, units y nanos llevan el mismo signo
    return { units: sign * units, nanos: units === 0 && nanos === 0 ? 0 : sign * nanos };
  }

  function toMoney(input, currencyCode = 'EUR') {
    const amount = parseAmount(input);
    return amount && { currency_code: currencyCode, units: String(amount.units), nanos: amount.nanos };
  }

  /** { units, nanos } → "19.99" (sin ceros sobrantes). */
  function formatAmount(money) {
    if (!money) return '';
    const units = Number(money.units || 0);
    const nanos = Number(money.nanos || 0);
    const negative = units < 0 || nanos < 0;
    const frac = String(Math.abs(nanos)).padStart(9, '0').replace(/0+$/, '');
    return `${negative ? '-' : ''}${Math.abs(units)}${frac ? '.' + frac.padEnd(2, '0') : ''}`;
  }

  return { parseAmount, toMoney, formatAmount };
});

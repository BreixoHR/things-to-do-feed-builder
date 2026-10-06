'use strict';

/**
 * Validación de productos del feed de Google Things To Do (formato JSON de Product).
 *
 * Comprueba las reglas que más rechazos provocan al subir un feed: IDs duplicados, textos sin
 * localizar, landing pages que no son HTTPS, precios mal formados, valoraciones fuera de rango...
 * Devuelve errores (el feed sería rechazado) y avisos (se acepta pero pierde calidad o visibilidad).
 */

const LANG_RE = /^[a-z]{2,3}(-[A-Z]{2})?$/;
const ID_RE = /^[\w.-]{1,255}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const LIMITS = { title: 150, description: 16000, priceTitle: 150 };

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function checkLocalized(value, path, { required = false, max } = {}, report) {
  const texts = value?.localized_texts;
  if (!Array.isArray(texts) || texts.length === 0) {
    if (required) report.error(path, 'texto obligatorio sin traducciones');
    return;
  }
  const seen = new Set();
  texts.forEach((t, i) => {
    const p = `${path}.localized_texts[${i}]`;
    if (!LANG_RE.test(t?.language_code || '')) report.error(p, `language_code no válido: "${t?.language_code}"`);
    else if (seen.has(t.language_code)) report.error(p, `idioma duplicado: ${t.language_code}`);
    else seen.add(t.language_code);
    if (!t?.text || !String(t.text).trim()) report.error(p, 'texto vacío');
    else if (max && t.text.length > max) report.error(p, `supera ${max} caracteres (${t.text.length})`);
  });
  if (required && !seen.has('en')) report.warn(path, 'sin versión en inglés: menor alcance internacional');
}

function checkMoney(price, path, report) {
  if (!price) return report.error(path, 'precio obligatorio');
  if (!CURRENCY_RE.test(price.currency_code || '')) report.error(path, `currency_code no válido: "${price.currency_code}"`);
  const units = Number(price.units ?? 0);
  const nanos = Number(price.nanos ?? 0);
  if (!Number.isInteger(units)) report.error(path, 'units debe ser entero');
  if (!Number.isInteger(nanos) || Math.abs(nanos) > 999999999) report.error(path, 'nanos debe ser un entero entre -999999999 y 999999999');
  if ((units > 0 && nanos < 0) || (units < 0 && nanos > 0)) report.error(path, 'units y nanos deben tener el mismo signo');
  if (units < 0 || nanos < 0) report.error(path, 'precio negativo');
}

function validateProduct(product, report, prefix) {
  if (!ID_RE.test(product?.id || '')) report.error(`${prefix}.id`, 'id obligatorio (máx. 255: letras, números, _ . -)');
  checkLocalized(product.title, `${prefix}.title`, { required: true, max: LIMITS.title }, report);
  checkLocalized(product.description, `${prefix}.description`, { max: LIMITS.description }, report);

  if (product.rating) {
    const { average_value: avg, rating_count: count } = product.rating;
    if (typeof avg !== 'number' || avg < 1 || avg > 5) report.error(`${prefix}.rating.average_value`, 'debe estar entre 1 y 5');
    if (!Number.isInteger(count) || count < 0) report.error(`${prefix}.rating.rating_count`, 'debe ser un entero ≥ 0');
    if (count === 0) report.warn(`${prefix}.rating`, 'valoración sin reseñas: Google no la mostrará');
  }

  (product.related_media || []).forEach((m, i) => {
    if (!isHttpsUrl(m?.url)) report.error(`${prefix}.related_media[${i}].url`, 'debe ser una URL https');
  });
  if (!product.related_media?.length) report.warn(`${prefix}.related_media`, 'sin imágenes: los productos sin foto apenas se muestran');

  const options = product.options;
  if (!Array.isArray(options) || options.length === 0) {
    report.error(`${prefix}.options`, 'al menos una opción');
    return;
  }
  const optionIds = new Set();
  options.forEach((o, i) => {
    const p = `${prefix}.options[${i}]`;
    if (!ID_RE.test(o?.id || '')) report.error(`${p}.id`, 'id de opción obligatorio');
    else if (optionIds.has(o.id)) report.error(`${p}.id`, `id de opción duplicado: ${o.id}`);
    else optionIds.add(o.id);

    checkLocalized(o.title, `${p}.title`, { required: true, max: LIMITS.title }, report);
    if (!isHttpsUrl(o.landing_page?.url)) report.error(`${p}.landing_page.url`, 'landing page https obligatoria');
    if (o.duration_sec != null && (!Number.isInteger(o.duration_sec) || o.duration_sec <= 0)) {
      report.error(`${p}.duration_sec`, 'debe ser un entero positivo (segundos)');
    }

    const prices = o.price_options || [];
    if (prices.length === 0) report.warn(`${p}.price_options`, 'sin precios: no aparecerá en los resultados con precio');
    const priceIds = new Set();
    prices.forEach((po, j) => {
      const pp = `${p}.price_options[${j}]`;
      if (!po?.id) report.error(`${pp}.id`, 'id obligatorio');
      else if (priceIds.has(po.id)) report.error(`${pp}.id`, `id de precio duplicado: ${po.id}`);
      else priceIds.add(po.id);
      if (!po?.title) report.error(`${pp}.title`, 'título obligatorio (p. ej. "Adulto")');
      else if (po.title.length > LIMITS.priceTitle) report.error(`${pp}.title`, `supera ${LIMITS.priceTitle} caracteres`);
      checkMoney(po?.price, `${pp}.price`, report);
    });

    const refund = o.cancellation_policy?.refund_conditions;
    (refund || []).forEach((r, j) => {
      if (r.refund_percent != null && (r.refund_percent < 0 || r.refund_percent > 100)) {
        report.error(`${p}.cancellation_policy.refund_conditions[${j}].refund_percent`, 'debe estar entre 0 y 100');
      }
    });

    for (const [k, rel] of (o.related_locations || []).entries()) {
      if (!rel?.location?.location?.place_id && !rel?.location?.location?.address) {
        report.error(`${p}.related_locations[${k}]`, 'ubicación sin place_id ni dirección');
      }
    }
  });
}

/** Valida un feed completo. → { valid, errors[], warnings[] } con rutas tipo "products[3].options[0].landing_page.url" */
function validateFeed(feed) {
  const errors = [];
  const warnings = [];
  const report = {
    error: (path, message) => errors.push({ path, message }),
    warn: (path, message) => warnings.push({ path, message }),
  };

  if (!feed?.feed_metadata) report.error('feed_metadata', 'obligatorio');
  const products = Array.isArray(feed?.products) ? feed.products : [];
  if (!Array.isArray(feed?.products)) report.error('products', 'debe ser una lista');

  const ids = new Set();
  products.forEach((product, i) => {
    if (product?.id && ids.has(product.id)) report.error(`products[${i}].id`, `id de producto duplicado: ${product.id}`);
    ids.add(product?.id);
    validateProduct(product || {}, report, `products[${i}]`);
  });

  return { valid: errors.length === 0, errors, warnings, products: products.length };
}

module.exports = { validateFeed };

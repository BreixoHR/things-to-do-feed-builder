const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseAmount, toMoney, formatAmount } = require('../src/price');
const { validateFeed } = require('../src/validate');
const demo = require('../examples/feed-demo.json');

test('parseAmount: conversión exacta a units/nanos', () => {
  assert.deepEqual(parseAmount('19,99'), { units: 19, nanos: 990000000 });
  assert.deepEqual(parseAmount('19.99'), { units: 19, nanos: 990000000 });
  assert.deepEqual(parseAmount('0.29'), { units: 0, nanos: 290000000 });
  assert.deepEqual(parseAmount('1234.5'), { units: 1234, nanos: 500000000 });
  assert.deepEqual(parseAmount('20'), { units: 20, nanos: 0 });
  assert.deepEqual(parseAmount('-2.5'), { units: -2, nanos: -500000000 });
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount('1.2.3'), null);
  assert.equal(parseAmount(''), null);
});

test('rechaza importes que parseFloat aceptaba en silencio', () => {
  // parseFloat('1.2.3') === 1.2, parseFloat('12abc') === 12, parseFloat('1.234.50') === 1.234
  for (const input of ['1.2.3', '12abc', '1.234,50', '1,234.50', '€12', '12 €']) {
    assert.equal(parseAmount(input), null, input);
  }
});

test('toMoney / formatAmount', () => {
  assert.deepEqual(toMoney('36,99'), { currency_code: 'EUR', units: '36', nanos: 990000000 });
  assert.equal(formatAmount({ units: '36', nanos: 990000000 }), '36.99');
  assert.equal(formatAmount({ units: '20', nanos: 500000000 }), '20.50');
  assert.equal(formatAmount({ units: '7' }), '7');
});

test('validateFeed: el feed de ejemplo es válido (con avisos)', () => {
  const r = validateFeed(demo);
  assert.equal(r.valid, true, JSON.stringify(r.errors));
  assert.equal(r.products, 2);
  assert.ok(r.warnings.some((w) => /sin imágenes/.test(w.message)));
});

test('validateFeed: detecta los errores típicos de rechazo', () => {
  const p = structuredClone(demo.products[0]);
  const broken = {
    feed_metadata: demo.feed_metadata,
    products: [
      p,
      { ...structuredClone(p) }, // id duplicado
      {
        id: 'bad product id!',
        title: { localized_texts: [{ language_code: 'english', text: '' }] },
        rating: { average_value: 7, rating_count: -1 },
        related_media: [{ url: 'http://insecure.example/img.jpg' }],
        options: [
          {
            id: 'o1',
            title: { localized_texts: [{ language_code: 'es', text: 'x'.repeat(151) }] },
            landing_page: { url: 'http://example.com' },
            duration_sec: -5,
            price_options: [
              { id: 'a', title: 'Adulto', price: { currency_code: 'euro', units: '10', nanos: -5 } },
              { id: 'a', title: '', price: { currency_code: 'EUR', units: '1.5' } },
            ],
            cancellation_policy: { refund_conditions: [{ refund_percent: 150 }] },
            related_locations: [{ location: { location: {} } }],
          },
          { id: 'o1', title: { localized_texts: [{ language_code: 'es', text: 'Dup' }] }, landing_page: { url: 'https://ok.example' } },
        ],
      },
      { id: 'no-options', title: { localized_texts: [{ language_code: 'en', text: 'T' }] }, options: [] },
    ],
  };
  const r = validateFeed(broken);
  const at = (path) => r.errors.filter((e) => e.path === path).map((e) => e.message).join(' | ');

  assert.equal(r.valid, false);
  assert.match(at('products[1].id'), /duplicado/);
  assert.match(at('products[2].id'), /obligatorio/);
  assert.match(at('products[2].title.localized_texts[0]'), /language_code/);
  assert.match(at('products[2].rating.average_value'), /entre 1 y 5/);
  assert.match(at('products[2].rating.rating_count'), /entero/);
  assert.match(at('products[2].related_media[0].url'), /https/);
  assert.match(at('products[2].options[0].title.localized_texts[0]'), /150/);
  assert.match(at('products[2].options[0].landing_page.url'), /https/);
  assert.match(at('products[2].options[0].duration_sec'), /positivo/);
  assert.match(at('products[2].options[0].price_options[0].price'), /currency_code.*\| .*mismo signo|currency_code/);
  assert.match(at('products[2].options[0].price_options[1].id'), /duplicado/);
  assert.match(at('products[2].options[0].price_options[1].title'), /obligatorio/);
  assert.match(at('products[2].options[0].price_options[1].price'), /entero/);
  assert.match(at('products[2].options[0].cancellation_policy.refund_conditions[0].refund_percent'), /0 y 100/);
  assert.match(at('products[2].options[0].related_locations[0]'), /place_id/);
  assert.match(at('products[2].options[1].id'), /duplicado/);
  assert.match(at('products[3].options'), /al menos una/);
});

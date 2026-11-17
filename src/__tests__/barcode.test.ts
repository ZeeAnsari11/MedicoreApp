import { barRuns, barcodeValueFor, barcodeSvgMarkup, buildLabelsHtml, clampLabelCount, encodeBarcode, tryEncodeBarcode, validateBarcodeValue } from '@/features/products/barcode';

describe('barcode labels', () => {
  it('EAN-13 requires 12-13 digits (web rule)', () => {
    expect(validateBarcodeValue('123456789012', 'EAN13')).toBeNull();
    expect(validateBarcodeValue('1234567890123', 'EAN13')).toBeNull();
    expect(validateBarcodeValue('12345', 'EAN13')).toMatch(/12 or 13 digit/);
    expect(validateBarcodeValue('ABC-1', 'EAN13')).not.toBeNull();
    expect(validateBarcodeValue('ABC-1', 'CODE128')).toBeNull();
  });

  it('falls back to the product id when there is no barcode', () => {
    expect(barcodeValueFor({ id: 'p1', barcode: ' ' })).toEqual({ value: 'p1', usingFallback: true });
    expect(barcodeValueFor({ id: 'p1', barcode: '8901' })).toEqual({ value: '8901', usingFallback: false });
  });

  it('encodes Code 128 as a start..stop module pattern', () => {
    const { bits, text } = encodeBarcode('ABC123', 'CODE128');
    expect(text).toBe('ABC123');
    expect(bits).toMatch(/^[01]+$/);
    expect(bits.endsWith('1100011101011')).toBe(true); // Code 128 stop pattern
  });

  it('encodes EAN-13 (95 modules) and appends the check digit to a 12-digit value', () => {
    const a = encodeBarcode('590123412345', 'EAN13');
    expect(a.bits).toHaveLength(95);
    expect(a.text).toBe('5901234123457');
    expect(encodeBarcode('5901234123457', 'EAN13').bits).toBe(a.bits);
  });

  it('rejects an EAN-13 with a wrong check digit and non-numeric input', () => {
    expect(() => encodeBarcode('5901234123450', 'EAN13')).toThrow(/check digit/);
    expect(() => encodeBarcode('abc', 'EAN13')).toThrow(/12 or 13 digit/);
  });

  it('tryEncodeBarcode returns a message instead of throwing', () => {
    expect(tryEncodeBarcode('abc', 'EAN13')).toEqual({ ok: false, message: expect.stringMatching(/12 or 13 digit/) });
    expect(tryEncodeBarcode('ABC123', 'CODE128')).toMatchObject({ ok: true });
  });

  it('turns modules into bar runs', () => {
    expect(barRuns('0110111000')).toEqual([[1, 2], [4, 3]]);
  });

  it('clamps label count to 1..100', () => {
    expect([clampLabelCount(0), clampLabelCount(5), clampLabelCount(500), clampLabelCount(NaN)]).toEqual([1, 5, 100, 1]);
  });

  it('builds printable HTML with the requested number of labels and escapes the name', () => {
    const encoded = encodeBarcode('ABC123', 'CODE128');
    const html = buildLabelsHtml({ name: 'A <b>&', tp: 10 }, encoded, 3);
    expect(html.match(/class="label"/g)).toHaveLength(3);
    expect(html).toContain('A &lt;b&gt;&amp;');
    expect(html).toContain('10.00');
    expect(barcodeSvgMarkup(encoded)).toContain('<rect');
  });
});

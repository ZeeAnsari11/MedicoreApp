import CODE128 from 'jsbarcode/bin/barcodes/CODE128/CODE128_AUTO.js';
import EAN13 from 'jsbarcode/bin/barcodes/EAN_UPC/EAN13.js';

import type { Product } from '@/types/medicore';

export type BarcodeFormat = 'CODE128' | 'EAN13';
export const MAX_LABELS = 100;

/** Same check as the web label dialog: EAN-13 needs a 12 or 13 digit numeric value. */
export function validateBarcodeValue(value: string, format: BarcodeFormat): string | null {
  if (format === 'EAN13' && !/^\d{12,13}$/.test(value)) {
    return "EAN-13 needs a 12 or 13 digit numeric barcode; this value doesn't qualify. Use Code 128 instead, or set a numeric barcode on the product.";
  }
  return null;
}

/** The value a label encodes: the product barcode, else its internal id (as the web does). */
export function barcodeValueFor(product: Pick<Product, 'barcode' | 'id'>): { value: string; usingFallback: boolean } {
  const barcode = product.barcode?.trim();
  return { value: barcode || product.id, usingFallback: !barcode };
}

export const clampLabelCount = (n: number) => Math.max(1, Math.min(MAX_LABELS, Math.floor(n) || 1));

function ean13CheckDigit(digits12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(digits12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}

export interface EncodedBarcode {
  /** Module pattern: '1' = bar, '0' = space. */
  bits: string;
  /** Human-readable text printed under the bars. */
  text: string;
}

/** Throws a user-readable Error when the value cannot be encoded in the chosen format. */
export function encodeBarcode(value: string, format: BarcodeFormat): EncodedBarcode {
  const invalid = validateBarcodeValue(value, format);
  if (invalid) throw new Error(invalid);
  if (format === 'EAN13') {
    const encoder = new EAN13(value, {});
    if (!encoder.valid()) throw new Error('This EAN-13 value has an invalid check digit.');
    return { bits: encoder.encode().map((s) => s.data).join(''), text: value.length === 12 ? value + ean13CheckDigit(value) : value };
  }
  const encoder = new CODE128(value, {});
  if (!encoder.valid()) throw new Error('This value cannot be encoded as Code 128.');
  const { data } = encoder.encode();
  return { bits: data, text: value };
}

export type EncodeResult = { ok: true; data: EncodedBarcode } | { ok: false; message: string };

/** Non-throwing variant for UI: either the encoding or the message to show the user. */
export function tryEncodeBarcode(value: string, format: BarcodeFormat): EncodeResult {
  try {
    return { ok: true, data: encodeBarcode(value, format) };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'This value cannot be encoded.' };
  }
}

/** Consecutive bars as [startModule, widthInModules] runs; used by both the on-screen SVG and the printed HTML. */
export function barRuns(bits: string): [number, number][] {
  const runs: [number, number][] = [];
  let i = 0;
  while (i < bits.length) {
    if (bits[i] === '1') {
      let j = i;
      while (j < bits.length && bits[j] === '1') j++;
      runs.push([i, j - i]);
      i = j;
    } else {
      i++;
    }
  }
  return runs;
}

const QUIET_ZONE = 10;
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function barcodeSvgMarkup(encoded: EncodedBarcode, heightPx = 60): string {
  const width = encoded.bits.length + QUIET_ZONE * 2;
  const rects = barRuns(encoded.bits).map(([x, w]) => `<rect x="${x + QUIET_ZONE}" y="0" width="${w}" height="${heightPx}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${heightPx}" width="${width * 1.6}" height="${heightPx}" fill="#000" shape-rendering="crispEdges">${rects}</svg>`;
}

/** Printable page of `count` identical labels (name, bars, value, TP), like the web's print area. */
export function buildLabelsHtml(product: Pick<Product, 'name' | 'tp'>, encoded: EncodedBarcode, count: number): string {
  const label = `<div class="label"><div class="name">${escapeHtml(product.name)}</div>${barcodeSvgMarkup(encoded)}<div class="text">${escapeHtml(encoded.text)}</div><div class="price">${product.tp.toFixed(2)}</div></div>`;
  return `<html><head><meta charset="utf-8"/><style>
    body{font-family:sans-serif;margin:8px}
    .grid{display:flex;flex-wrap:wrap;gap:8px}
    .label{width:31%;border:1px solid #bbb;padding:6px;text-align:center;page-break-inside:avoid}
    .name{font-size:11px;font-weight:600}.text{font-size:10px}.price{font-size:10px;color:#555}
    svg{max-width:100%;height:auto}
  </style></head><body><div class="grid">${Array.from({ length: clampLabelCount(count) }, () => label).join('')}</div></body></html>`;
}

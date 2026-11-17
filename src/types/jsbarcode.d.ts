// jsbarcode ships no types for its internal encoders; only the small surface used by features/products/barcode.ts.
declare module 'jsbarcode/bin/barcodes/CODE128/CODE128_AUTO.js' {
  export default class CODE128AUTO {
    constructor(data: string, options: Record<string, unknown>);
    valid(): boolean;
    encode(): { text: string; data: string };
  }
}
declare module 'jsbarcode/bin/barcodes/EAN_UPC/EAN13.js' {
  export default class EAN13 {
    constructor(data: string, options: Record<string, unknown>);
    valid(): boolean;
    encode(): { data: string; text?: string }[];
  }
}

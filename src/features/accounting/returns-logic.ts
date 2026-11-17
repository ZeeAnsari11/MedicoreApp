import type { CreatePurchaseReturnItemRequest, CreateSaleReturnItemRequest, ReturnablePurchaseItem, ReturnableSaleItem } from '@/types/medicore';

export type ReturnMode = 'sale' | 'purchase';
/** Quantities typed per `productId:batchId`, kept as numbers like the web. */
export type ReturnQuantities = Record<string, number>;

export const qtyKey = (productId: string, batchId: string) => `${productId}:${batchId}`;

/** Web `setQty`: never below 0 and never above what can still be returned. */
export const clampQty = (value: number, max: number) => Math.max(0, Math.min(Number.isFinite(value) ? value : 0, max));

export const hasAnyQty = (q: ReturnQuantities) => Object.values(q).some((v) => v > 0);

/** Sale lines grouped by product with only the batches that have a quantity (web `handleSubmit`). */
export function saleReturnItems(items: readonly ReturnableSaleItem[], q: ReturnQuantities): CreateSaleReturnItemRequest[] {
  return items
    .map((item) => ({
      productId: item.productId,
      batchAllocations: item.batchAllocations.filter((b) => (q[qtyKey(item.productId, b.batchId)] ?? 0) > 0).map((b) => ({ batchId: b.batchId, quantity: q[qtyKey(item.productId, b.batchId)] })),
    }))
    .filter((item) => item.batchAllocations.length > 0);
}

export function purchaseReturnItems(items: readonly ReturnablePurchaseItem[], q: ReturnQuantities): CreatePurchaseReturnItemRequest[] {
  return items
    .filter((item) => (q[qtyKey(item.productId, item.batchId)] ?? 0) > 0)
    .map((item) => ({ productId: item.productId, batchId: item.batchId, quantity: q[qtyKey(item.productId, item.batchId)] }));
}

import { BranchOwnedEntity } from './base';
import { ProductStatus } from './enums';

export interface Product extends BranchOwnedEntity {
  name: string;
  genericName?: string;
  manufacturerId: string;
  manufacturer?: { id: string; name: string };
  categoryId?: string;
  category?: { id: string; name: string };
  barcode?: string;
  unit: string;
  packing?: string;
  /** Trade price: default sale price. */
  tp: number;
  /** Cost price: purchase price and the floor for sale prices. */
  cp: number;
  /** Retail price printed on the pack (reference only). */
  rp: number;
  status: ProductStatus;
  minStockLevel?: number;
}

export interface CreateProductRequest {
  /** Branch the product belongs to; branch users are pinned to their own. */
  branchId?: string;
  name: string;
  genericName: string;
  manufacturerId: string;
  categoryId?: string;
  barcode?: string;
  unit: string;
  packing?: string;
  /** Trade price: default sale price. */
  tp: number;
  /** Cost price: purchase price and the floor for sale prices. */
  cp: number;
  /** Retail price printed on the pack (reference only). */
  rp: number;
  minStockLevel?: number;
}

export interface UpdateProductRequest {
  name?: string;
  genericName?: string;
  manufacturerId?: string;
  categoryId?: string;
  barcode?: string;
  unit?: string;
  packing?: string;
  tp?: number;
  cp?: number;
  rp?: number;
  minStockLevel?: number;
}

export interface UpdateProductStatusRequest {
  status: ProductStatus;
}

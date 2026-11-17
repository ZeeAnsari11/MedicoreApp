import { TenantOwnedEntity } from './base';

export interface VendorProduct extends TenantOwnedEntity {
  vendorId: string;
  vendor?: { id: string; company: string };
  productId: string;
  product?: { id: string; name: string };
  vendorSku?: string;
  purchasePrice: number;
  /** What this vendor was last actually paid, set on every purchase. */
  lastPurchasePrice?: number;
  isPreferred: boolean;
  isActive: boolean;
}

/** Active vendors (cheapest first) offering a product; one row per product. */
export interface ProductVendorSummary {
  productId: string;
  vendors: Array<{ vendorId: string; company: string; purchasePrice: number }>;
}

export interface CreateVendorProductRequest {
  vendorId: string;
  productId: string;
  vendorSku?: string;
  purchasePrice: number;
  isPreferred?: boolean;
}

export interface UpdateVendorProductRequest {
  vendorSku?: string;
  purchasePrice?: number;
  isPreferred?: boolean;
  isActive?: boolean;
}

/** One vendor that sells a product matching a name search, with the matching products and prices. */
export interface VendorProductSearchResult {
  vendorId: string;
  company: string;
  matches: Array<{
    linkId: string;
    productId: string;
    productName: string;
    purchasePrice: number;
    isActive: boolean;
  }>;
}

import { pickBySeed, type IconName } from '@/components/ui/list-row';

const PRODUCT_ICONS: readonly IconName[] = ['pill', 'pill-multiple', 'bottle-tonic-plus-outline', 'medication-outline', 'needle'];

/** List icon for a product, stable per product id, so Products and Inventory show the same tile for it. */
export const productIcon = (productId: string) => pickBySeed(productId, PRODUCT_ICONS);

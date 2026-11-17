import { router, Stack, useLocalSearchParams } from 'expo-router';

import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { useAuth } from '@/features/auth/use-auth';
import { ProductForm } from '@/features/products/product-form';
import { buildCreateProduct, buildUpdateProduct } from '@/features/products/schema';
import { useProducts } from '@/features/products/use-products';
import { VendorPricingSection } from '@/features/products/vendor-pricing-section';
import { useVendorProductsForProduct } from '@/features/vendor-products/use-vendor-products';

export default function ProductFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const mode = id ? 'edit' : 'create';
  const { has } = useAuth();
  const api = useProducts();
  const linkApi = useVendorProductsForProduct(null);
  const product = id ? api.products.find((p) => p.id === id) : undefined;

  if (!has(mode === 'create' ? 'products:create' : 'products:update')) {
    return <EmptyState title="No access" message="You don't have permission to do this." />;
  }
  if (mode === 'edit') {
    if (api.isLoading) return <LoadingState />;
    if (api.error && !product) return <ErrorState error={api.error} onRetry={() => api.refetch()} />;
    if (!product) return <EmptyState title="Product not found" />;
  }

  return (
    <>
      <Stack.Screen options={{ title: mode === 'create' ? 'Create Product' : 'Edit Product' }} />
      <ProductForm
        mode={mode}
        product={product}
        showVendor={mode === 'create' && has('vendors:create')}
        onSubmit={async (values) => {
          try {
            if (mode === 'create') {
              const created = await api.create(buildCreateProduct(values));
              if (values.vendorId) {
                // The product is saved; a failed link is reported by the mutation's own toast.
                await linkApi.create({ vendorId: values.vendorId, productId: created.id, purchasePrice: created.cp }).catch(() => undefined);
              }
            } else if (product) {
              await api.update(product.id, buildUpdateProduct(values, { priceLocked: !has('products:edit_prices') }));
            }
            router.back();
          } catch {
            // The mutation already toasted the server's message; stay on the form so nothing typed is lost.
          }
        }}
      >
        {mode === 'edit' && product && has('vendors:read') ? <VendorPricingSection productId={product.id} branchId={product.branchId} /> : null}
      </ProductForm>
    </>
  );
}

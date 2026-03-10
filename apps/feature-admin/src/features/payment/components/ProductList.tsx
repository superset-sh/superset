import { ProductCard } from './ProductCard';
import { useProductsWithLoading } from '../hooks';
import { useCreateCheckout } from '../hooks/use-checkout';
import { Alert, AlertDescription } from '@superbuilder/feature-ui/shadcn/alert';
import { Skeleton } from '@superbuilder/feature-ui/shadcn/skeleton';

export function ProductList() {
  const { products, isLoading, error } = useProductsWithLoading();
  const { createCheckout, isLoading: isCheckoutLoading } = useCreateCheckout();

  const handleSelectProduct = async (variantId: string) => {
    await createCheckout({ variantId });
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-64" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Failed to load products: {error.message}</AlertDescription>
      </Alert>
    );
  }

  if (products.length === 0) {
    return (
      <Alert>
        <AlertDescription>No products available at the moment.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product as any}
          onSelect={handleSelectProduct}
          isLoading={isCheckoutLoading}
        />
      ))}
    </div>
  );
}

import { ProductList } from '../components';

export function ProductsPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Products</h1>
        <p className="text-muted-foreground mt-2">
          Choose a product or subscription plan that fits your needs.
        </p>
      </div>

      <ProductList />
    </div>
  );
}

import { Button } from '@superbuilder/feature-ui/shadcn/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@superbuilder/feature-ui/shadcn/card';
import type { Product } from '@superbuilder/drizzle';

interface ProductCardProps {
  product: Product;
  onSelect: (variantId: string) => void;
  isLoading?: boolean;
}

export function ProductCard({ product, onSelect, isLoading }: ProductCardProps) {
  const priceText = product.isSubscription
    ? `$${product.price.toLocaleString("en-US", { minimumFractionDigits: 2 })} / ${product.subscriptionInterval}`
    : `$${product.price.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{product.name}</CardTitle>
        <CardDescription>{product.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{priceText}</div>
        {product.hasLicense && (
          <p className="text-sm text-muted-foreground mt-2">
            Includes license key valid for {product.licenseLengthValue} {product.licenseLengthUnit}
          </p>
        )}
      </CardContent>
      <CardFooter>
        <Button
          onClick={() => onSelect(product.externalId)}
          disabled={isLoading || product.status !== 'published'}
          className="w-full"
        >
          {product.isSubscription ? 'Subscribe' : 'Buy Now'}
        </Button>
      </CardFooter>
    </Card>
  );
}

import { Button } from '@superbuilder/feature-ui/shadcn/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@superbuilder/feature-ui/shadcn/card';
import { Badge } from '@superbuilder/feature-ui/shadcn/badge';
import type { SubscriptionWithProduct } from '@superbuilder/features-server/payment';

interface SubscriptionCardProps {
  subscription: SubscriptionWithProduct;
  onCancel: (id: string) => void;
  onManage: (urls: any) => void;
  isLoading?: boolean;
}

export function SubscriptionCard({ subscription, onCancel, onManage, isLoading }: SubscriptionCardProps) {
  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'success' | 'warning' | 'destructive'> = {
      active: 'success',
      on_trial: 'default',
      paused: 'warning',
      cancelled: 'destructive',
      expired: 'destructive',
    };

    return <Badge variant={variants[status] || 'default'}>{subscription.statusFormatted}</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{subscription.product?.name || 'Subscription'}</CardTitle>
          {getStatusBadge(subscription.status)}
        </div>
        {subscription.product?.description && (
          <CardDescription>{subscription.product.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Price:</span>
          <span className="font-medium">
            ${subscription.price.toLocaleString()} / {subscription.interval}
          </span>
        </div>
        {subscription.renewsAt && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Renews:</span>
            <span>{new Date(subscription.renewsAt).toLocaleDateString()}</span>
          </div>
        )}
        {subscription.trialEndsAt && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Trial ends:</span>
            <span>{new Date(subscription.trialEndsAt).toLocaleDateString()}</span>
          </div>
        )}
        {subscription.endsAt && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Ends:</span>
            <span>{new Date(subscription.endsAt).toLocaleDateString()}</span>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex gap-2">
        {(subscription.urls as any)?.customer_portal && (
          <Button variant="outline" onClick={() => onManage(subscription.urls)} className="flex-1">
            Manage
          </Button>
        )}
        {subscription.status === 'active' && (
          <Button
            variant="destructive"
            onClick={() => onCancel(subscription.externalId)}
            disabled={isLoading}
            className="flex-1"
          >
            Cancel
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

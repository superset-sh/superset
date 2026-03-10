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
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{subscription.product?.name || '구독'}</CardTitle>
          <StatusBadge status={subscription.status} formatted={subscription.statusFormatted} />
        </div>
        {subscription.product?.description && (
          <CardDescription>{subscription.product.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">가격</span>
          <span className="font-medium">
            {formatSubscriptionPrice(subscription.price, subscription.currency, subscription.interval)}
          </span>
        </div>
        {subscription.renewsAt && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">다음 갱신일</span>
            <span>{new Date(subscription.renewsAt).toLocaleDateString('ko-KR')}</span>
          </div>
        )}
        {subscription.trialEndsAt && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">체험 종료일</span>
            <span>{new Date(subscription.trialEndsAt).toLocaleDateString('ko-KR')}</span>
          </div>
        )}
        {subscription.endsAt && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">구독 종료일</span>
            <span>{new Date(subscription.endsAt).toLocaleDateString('ko-KR')}</span>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex gap-2">
        {(subscription.urls as any)?.customer_portal && (
          <Button variant="outline" onClick={() => onManage(subscription.urls)} className="flex-1">
            관리
          </Button>
        )}
        {subscription.status === 'active' && (
          <Button
            variant="destructive"
            onClick={() => onCancel(subscription.externalId)}
            disabled={isLoading}
            className="flex-1"
          >
            구독 취소
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

const STATUS_MAP: Record<string, { variant: 'success' | 'warning' | 'destructive' | 'default'; label: string }> = {
  active: { variant: 'success', label: '활성' },
  on_trial: { variant: 'default', label: '체험 중' },
  paused: { variant: 'warning', label: '일시정지' },
  past_due: { variant: 'warning', label: '결제 지연' },
  cancelled: { variant: 'destructive', label: '취소됨' },
  expired: { variant: 'destructive', label: '만료됨' },
};

function StatusBadge({ status, formatted }: { status: string; formatted?: string | null }) {
  const info = STATUS_MAP[status] ?? { variant: 'default' as const, label: formatted ?? status };
  return <Badge variant={info.variant}>{info.label}</Badge>;
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

function formatSubscriptionPrice(price: number, currency: string, interval: string): string {
  const cur = currency.toUpperCase();
  const intervalLabel = interval === 'year' ? '년' : '월';

  if (cur === 'KRW') {
    return `₩${price.toLocaleString()} / ${intervalLabel}`;
  }
  return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2 })} / ${intervalLabel}`;
}

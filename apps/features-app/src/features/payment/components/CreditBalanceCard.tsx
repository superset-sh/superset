import { Card, CardContent, CardHeader, CardTitle } from '@superbuilder/feature-ui/shadcn/card';
import { Badge } from '@superbuilder/feature-ui/shadcn/badge';
import { Skeleton } from '@superbuilder/feature-ui/shadcn/skeleton';
import { Link } from '@tanstack/react-router';

interface Props {
  balance: number;
  monthlyAllocation: number;
  autoRecharge: boolean;
  isLoading?: boolean;
}

export function CreditBalanceCard({ balance, monthlyAllocation, autoRecharge, isLoading }: Props) {
  if (isLoading) {
    return <Skeleton className="h-40" />;
  }

  const usagePercent =
    monthlyAllocation > 0
      ? Math.round(((monthlyAllocation - balance) / monthlyAllocation) * 100)
      : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-medium">AI 크레딧</CardTitle>
          {autoRecharge && <Badge variant="outline">자동충전</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold">{balance.toLocaleString()}</span>
          {monthlyAllocation > 0 && (
            <span className="text-muted-foreground">
              / {monthlyAllocation.toLocaleString()} 크레딧
            </span>
          )}
        </div>
        {monthlyAllocation > 0 && (
          <div className="space-y-1">
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${Math.min(usagePercent, 100)}%` }}
              />
            </div>
            <p className="text-sm text-muted-foreground">{usagePercent}% 사용됨</p>
          </div>
        )}
        <Link to="/payment/credits" className="text-sm text-primary hover:underline">
          사용 내역 보기 →
        </Link>
      </CardContent>
    </Card>
  );
}

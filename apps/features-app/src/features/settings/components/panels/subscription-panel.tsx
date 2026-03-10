import { Link } from "@tanstack/react-router";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { useMySubscription } from "@/features/payment/hooks/use-subscription";
import { useMyBalance } from "@/features/payment/hooks/use-credits";
import { useSettingsModal } from "../../hooks/use-settings-modal";

interface Props {}

export function SubscriptionPanel({}: Props) {
  const { data: subscription, isLoading: subLoading } = useMySubscription();
  const { data: balance, isLoading: balLoading } = useMyBalance();
  const { setOpen } = useSettingsModal();

  return (
    <div className="flex flex-col gap-8">
      {/* 구독 정보 */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-medium">구독 플랜</h3>
          <Button
            variant="outline"
            size="sm"
            render={<Link to="/pricing" />}
            onClick={() => setOpen(false)}
          >
            플랜 변경
          </Button>
        </div>
        {subLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
        ) : subscription ? (
          <SubscriptionInfo subscription={subscription} />
        ) : (
          <div className="rounded-lg bg-muted/30 p-4">
            <p className="text-sm font-medium">Free 플랜</p>
            <p className="text-sm text-muted-foreground mt-1">
              현재 무료 플랜을 사용 중입니다.
            </p>
          </div>
        )}
      </section>

      <Separator />

      {/* 크레딧 잔액 */}
      <section className="flex flex-col gap-3">
        <h3 className="text-base font-medium">AI 크레딧</h3>
        {balLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-4 w-40" />
          </div>
        ) : balance ? (
          <div className="rounded-lg bg-muted/30 p-4">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{balance.balance.toLocaleString()}</span>
              <span className="text-sm text-muted-foreground">크레딧</span>
            </div>
            {balance.monthlyAllocation > 0 && (
              <p className="text-sm text-muted-foreground mt-1">
                월 배정: {balance.monthlyAllocation.toLocaleString()} 크레딧
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">크레딧 정보를 불러올 수 없습니다.</p>
        )}
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface SubscriptionInfoProps {
  subscription: {
    status: string;
    price: number;
    currency: string;
    interval: string;
    product?: { name?: string } | null;
    renewsAt?: string | Date | null;
    endsAt?: string | Date | null;
  };
}

function SubscriptionInfo({ subscription }: SubscriptionInfoProps) {
  return (
    <div className="rounded-lg bg-muted/30 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">
          {subscription.product?.name ?? "구독"}
        </span>
        <StatusBadge status={subscription.status} />
      </div>

      <p className="text-sm text-muted-foreground">
        {formatPrice(subscription.price, subscription.currency)} /{" "}
        {subscription.interval === "year" ? "년" : "월"}
      </p>

      {subscription.renewsAt && (
        <p className="text-sm text-muted-foreground">
          다음 갱신일: {new Date(subscription.renewsAt).toLocaleDateString("ko-KR")}
        </p>
      )}

      {subscription.endsAt && (
        <p className="text-sm text-muted-foreground">
          만료일: {new Date(subscription.endsAt).toLocaleDateString("ko-KR")}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

function formatPrice(price: number, currency: string): string {
  const cur = currency.toUpperCase();
  if (cur === "KRW") {
    return `₩${price.toLocaleString()}`;
  }
  return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

interface StatusBadgeProps {
  status: string;
}

function StatusBadge({ status }: StatusBadgeProps) {
  switch (status) {
    case "active":
      return <Badge>활성</Badge>;
    case "on_trial":
      return <Badge>체험 중</Badge>;
    case "cancelled":
      return <Badge variant="secondary">취소됨</Badge>;
    case "expired":
      return <Badge variant="secondary">만료됨</Badge>;
    case "paused":
      return <Badge variant="secondary">일시정지</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

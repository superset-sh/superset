import { Link } from "@tanstack/react-router";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { PageHeader } from "@superbuilder/feature-ui/components/page-header";
import { ExternalLink } from "lucide-react";
import { useMySubscription, useCancelSubscription } from "@/features/payment/hooks/use-subscription";
import { useMyBalance } from "@/features/payment/hooks/use-credits";

interface Props {}

export function PlanManagementPage({}: Props) {
  const { data: subscription, isLoading: subLoading } = useMySubscription();
  const { data: balance, isLoading: balLoading } = useMyBalance();
  const { cancelSubscription, isLoading: cancelLoading } = useCancelSubscription();

  const handleCancel = async () => {
    if (!subscription?.externalId) return;
    const confirmed = window.confirm("정말 구독을 취소하시겠습니까?");
    if (confirmed) {
      await cancelSubscription(subscription.externalId);
    }
  };

  return (
    <div className="flex flex-col gap-8 p-6">
      <PageHeader
        title="내 플랜"
        description="구독 및 크레딧을 관리합니다"
        actions={
          <Button variant="outline" render={<Link to="/pricing" />}>
            플랜 변경
          </Button>
        }
      />

      {/* 구독 정보 */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">구독 정보</h2>
        {subLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
        ) : subscription ? (
          <SubscriptionDetail
            subscription={subscription}
            onCancel={handleCancel}
            cancelLoading={cancelLoading}
          />
        ) : (
          <div className="rounded-lg bg-muted/30 p-6">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base font-medium">Free 플랜</span>
              <Badge variant="outline">무료</Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              현재 무료 플랜을 사용 중입니다.
            </p>
            <Button variant="outline" size="sm" render={<Link to="/pricing" />}>
              플랜 선택하기
            </Button>
          </div>
        )}
      </section>

      <Separator />

      {/* AI 크레딧 */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">AI 크레딧</h2>
        {balLoading ? (
          <Skeleton className="h-24" />
        ) : balance ? (
          <div className="rounded-lg bg-muted/30 p-6">
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-2xl font-bold">
                {balance.balance.toLocaleString()}
              </span>
              <span className="text-sm text-muted-foreground">크레딧</span>
            </div>
            {balance.monthlyAllocation > 0 && (
              <p className="text-sm text-muted-foreground">
                월 배정: {balance.monthlyAllocation.toLocaleString()} 크레딧
              </p>
            )}
            {balance.currentPeriodEnd && (
              <p className="text-sm text-muted-foreground mt-1">
                갱신일:{" "}
                {new Date(balance.currentPeriodEnd).toLocaleDateString("ko-KR")}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            크레딧 정보를 불러올 수 없습니다.
          </p>
        )}
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface SubscriptionDetailProps {
  subscription: {
    status: string;
    product?: { name?: string; price?: number; currency?: string } | null;
    price: number;
    currency: string;
    interval: string | null;
    renewsAt?: string | null;
    endsAt?: string | null;
    urls?: unknown;
    externalId?: string | null;
  };
  onCancel: () => void;
  cancelLoading: boolean;
}

function SubscriptionDetail({
  subscription,
  onCancel,
  cancelLoading,
}: SubscriptionDetailProps) {
  const urls = subscription.urls as Record<string, string> | null;

  return (
    <div className="rounded-lg bg-muted/30 p-6 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-base font-medium">
          {subscription.product?.name ?? "구독"}
        </span>
        <SubscriptionStatusBadge status={subscription.status} />
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">
          {formatPrice(subscription.price, subscription.currency)} /{" "}
          {subscription.interval === "year" ? "년" : "월"}
        </p>
        {subscription.renewsAt && (
          <p className="text-sm text-muted-foreground">
            다음 갱신일:{" "}
            {new Date(subscription.renewsAt).toLocaleDateString("ko-KR")}
          </p>
        )}
        {subscription.endsAt && (
          <p className="text-sm text-muted-foreground">
            만료일:{" "}
            {new Date(subscription.endsAt).toLocaleDateString("ko-KR")}
          </p>
        )}
      </div>

      <div className="flex gap-2">
        {urls?.customer_portal && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(urls.customer_portal, "_blank")}
          >
            <ExternalLink className="mr-2 size-4" />
            고객 포털
          </Button>
        )}
        {subscription.status === "active" && (
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={cancelLoading}
          >
            {cancelLoading ? "처리 중..." : "구독 취소"}
          </Button>
        )}
      </div>
    </div>
  );
}

interface SubscriptionStatusBadgeProps {
  status: string;
}

function SubscriptionStatusBadge({ status }: SubscriptionStatusBadgeProps) {
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

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

function formatPrice(price: number, currency?: string | null): string {
  const cur = (currency ?? "USD").toUpperCase();
  if (cur === "KRW") {
    return `₩${price.toLocaleString()}`;
  }
  return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

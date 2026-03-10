import { Badge } from "@superbuilder/feature-ui/shadcn/badge";

interface Props {
  subscription: {
    status: string;
    planName?: string | null;
    price?: number;
    interval?: string | null;
    renewsAt?: string | null;
  } | null;
}

export function CurrentPlanBanner({ subscription }: Props) {
  if (!subscription) {
    return (
      <div className="rounded-lg bg-muted/30 p-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">현재 플랜:</span>
          <Badge variant="outline">Free</Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          유료 플랜으로 업그레이드하면 더 많은 크레딧과 기능을 이용할 수 있습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-muted/30 p-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">현재 플랜:</span>
        <Badge>{subscription.planName ?? "구독 중"}</Badge>
        <StatusBadge status={subscription.status} />
      </div>
      {subscription.renewsAt && (
        <p className="text-sm text-muted-foreground mt-1">
          다음 갱신일: {new Date(subscription.renewsAt).toLocaleDateString("ko-KR")}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface StatusBadgeProps {
  status: string;
}

function StatusBadge({ status }: StatusBadgeProps) {
  switch (status) {
    case "active":
      return <Badge variant="outline">활성</Badge>;
    case "on_trial":
      return <Badge variant="outline">체험 중</Badge>;
    case "cancelled":
      return <Badge variant="secondary">취소됨</Badge>;
    default:
      return null;
  }
}

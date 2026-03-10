import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Check } from "lucide-react";
import { cn } from "@superbuilder/feature-ui/lib/utils";

interface Props {
  plan: {
    id: string;
    name: string;
    slug: string;
    tier: string;
    price: number;
    currency: string | null;
    interval: string | null;
    monthlyCredits: number;
    features: string[] | null;
    isPerSeat: boolean;
    providerVariantId: string | null;
  };
  currentPlanTier?: string | null;
  hasSubscription: boolean;
  isAuthenticated: boolean;
  onSelect: (plan: Props["plan"]) => void;
  isLoading?: boolean;
}

export function PlanCard({
  plan,
  currentPlanTier,
  hasSubscription,
  isAuthenticated,
  onSelect,
  isLoading,
}: Props) {
  const isCurrentPlan = currentPlanTier === plan.tier;
  const isRecommended = plan.tier === "pro";

  const { label, disabled } = getCtaState({
    isAuthenticated,
    hasSubscription,
    isCurrentPlan,
    currentPlanTier: currentPlanTier ?? null,
    targetTier: plan.tier,
    isFree: plan.price === 0,
  });

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg p-6 gap-6",
        isRecommended
          ? "ring-2 ring-primary bg-muted/30"
          : "bg-muted/30",
      )}
    >
      {/* 헤더 */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-medium">{plan.name}</h3>
          {isRecommended && <Badge>추천</Badge>}
          {isCurrentPlan && <Badge variant="outline">현재 플랜</Badge>}
        </div>

        {/* 가격 */}
        <div className="flex items-baseline gap-1">
          {plan.tier === "enterprise" ? (
            <span className="text-2xl font-bold">별도 협의</span>
          ) : plan.price === 0 ? (
            <span className="text-2xl font-bold">무료</span>
          ) : (
            <>
              <span className="text-2xl font-bold">
                {formatPrice(plan.price, plan.currency)}
              </span>
              <span className="text-sm text-muted-foreground">
                / {plan.interval === "year" ? "년" : "월"}
                {plan.isPerSeat ? "/명" : ""}
              </span>
            </>
          )}
        </div>

        {/* 월 크레딧 */}
        <p className="text-sm text-muted-foreground">
          {plan.monthlyCredits.toLocaleString()} 크레딧/월
        </p>
      </div>

      {/* Features 목록 */}
      {plan.features && plan.features.length > 0 && (
        <ul className="flex flex-col gap-2 flex-1">
          {plan.features.map((feature, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <Check className="size-4 mt-0.5 shrink-0 text-primary" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      )}

      {/* CTA 버튼 */}
      <Button
        className="w-full"
        variant={isRecommended && !isCurrentPlan ? "default" : "outline"}
        disabled={disabled || isLoading}
        onClick={() => onSelect(plan)}
      >
        {isLoading ? "처리 중..." : label}
      </Button>
    </div>
  );
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

const TIER_ORDER: Record<string, number> = {
  free: 0,
  pro: 1,
  team: 2,
  enterprise: 3,
};

function getCtaState(params: {
  isAuthenticated: boolean;
  hasSubscription: boolean;
  isCurrentPlan: boolean;
  currentPlanTier: string | null;
  targetTier: string;
  isFree: boolean;
}) {
  const { isAuthenticated, hasSubscription, isCurrentPlan, currentPlanTier, targetTier, isFree } = params;

  // Enterprise는 항상 "문의하기" (계약 기반)
  if (targetTier === "enterprise") {
    if (isCurrentPlan) return { label: "현재 플랜", disabled: true };
    return { label: "문의하기", disabled: false };
  }

  if (!isAuthenticated) {
    return { label: "시작하기", disabled: false };
  }

  if (isCurrentPlan) {
    return { label: "현재 플랜", disabled: true };
  }

  if (!hasSubscription && isFree) {
    return { label: "현재 플랜", disabled: true };
  }

  if (!hasSubscription) {
    return { label: "구독하기", disabled: false };
  }

  const currentOrder = TIER_ORDER[currentPlanTier ?? "free"] ?? 0;
  const targetOrder = TIER_ORDER[targetTier] ?? 0;

  if (targetOrder > currentOrder) {
    return { label: "업그레이드", disabled: false };
  }

  return { label: "다운그레이드", disabled: false };
}

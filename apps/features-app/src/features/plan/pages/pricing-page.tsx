import { useNavigate } from "@tanstack/react-router";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { useAtomValue } from "jotai";
import { toast } from "sonner";
import { authenticatedAtom } from "@superbuilder/features-client/core/auth";
import { usePlans } from "../hooks/use-plans";
import { useMySubscription } from "@/features/payment/hooks/use-subscription";
import { useCreateCheckout } from "@/features/payment/hooks/use-checkout";
import { useChangePlan } from "../hooks/use-plan-actions";
import { PlanCard } from "../components/plan-card";
import { CurrentPlanBanner } from "../components/current-plan-banner";

const CONTACT_EMAIL = "support@featureatlas.io";

interface Props {}

export function PricingPage({}: Props) {
  const navigate = useNavigate();
  const isAuthenticated = !!useAtomValue(authenticatedAtom);

  const { data: plans, isLoading: plansLoading } = usePlans();
  const { data: subscription } = useMySubscription();
  const { createCheckout, isLoading: checkoutLoading } = useCreateCheckout();
  const { changePlan, isLoading: changeLoading } = useChangePlan();

  const hasSubscription = !!subscription && subscription.status === "active";

  // 현재 구독의 tier 추출 (product name 기반 매칭)
  const currentPlanTier = getCurrentTier(subscription, plans ?? []);

  const handleSelectPlan = async (plan: PlanType) => {
    // 미로그인 → 로그인 페이지
    if (!isAuthenticated) {
      navigate({ to: "/sign-in" });
      return;
    }

    // Enterprise → 문의 이메일
    if (plan.tier === "enterprise") {
      window.location.href = `mailto:${CONTACT_EMAIL}?subject=Enterprise 플랜 문의`;
      return;
    }

    // Free 플랜 선택
    if (plan.tier === "free" || plan.price === 0) {
      if (hasSubscription) {
        toast.error("무료 플랜으로 변경하려면 먼저 현재 구독을 취소해주세요.");
      }
      return;
    }

    // 유료 플랜인데 LS variant 미설정 → 안내
    if (!plan.providerVariantId) {
      toast.error("이 플랜은 아직 결제 설정이 완료되지 않았습니다.");
      return;
    }

    try {
      // 구독 없음 + 유료 플랜 → LS Checkout
      if (!hasSubscription) {
        // 결제 후 돌아올 URL 전달
        const redirectUrl = `${window.location.origin}/plan`;
        await createCheckout({
          variantId: plan.providerVariantId,
          redirectUrl,
        });
        return;
      }

      // 구독 있음 + 플랜 변경
      const confirmed = window.confirm(
        `${plan.name} 플랜으로 변경하시겠습니까?`,
      );
      if (confirmed) {
        await changePlan(plan.id);
        toast.success(`${plan.name} 플랜으로 변경되었습니다.`);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "플랜 처리 중 오류가 발생했습니다.";
      toast.error(message);
    }
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex flex-col gap-8">
        {/* 헤더 */}
        <div className="text-center">
          <h1 className="text-3xl font-bold">플랜 선택</h1>
          <p className="text-muted-foreground mt-2">
            나에게 맞는 플랜을 선택하세요
          </p>
        </div>

        {/* 현재 플랜 배너 (로그인 시만) */}
        {isAuthenticated && (
          <CurrentPlanBanner
            subscription={
              subscription
                ? {
                    status: subscription.status,
                    planName: subscription.product?.name,
                    price: subscription.price,
                    interval: subscription.interval,
                    renewsAt: subscription.renewsAt,
                  }
                : null
            }
          />
        )}

        {/* 플랜 카드 그리드 */}
        {plansLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[400px] rounded-lg" />
            ))}
          </div>
        ) : plans && plans.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                currentPlanTier={currentPlanTier}
                hasSubscription={hasSubscription}
                isAuthenticated={isAuthenticated}
                onSelect={handleSelectPlan}
                isLoading={checkoutLoading || changeLoading}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg bg-muted/30 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              현재 이용 가능한 플랜이 없습니다.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

type PlanType = {
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

function getCurrentTier(
  subscription: { product?: { name?: string } | null; status?: string } | null | undefined,
  plans: PlanType[],
): string | null {
  if (!subscription || subscription.status !== "active") return null;

  const productName = subscription.product?.name;
  if (!productName) return null;

  // product name으로 플랜 매칭
  const matched = plans.find(
    (p) => p.name.toLowerCase() === productName.toLowerCase(),
  );

  return matched?.tier ?? null;
}

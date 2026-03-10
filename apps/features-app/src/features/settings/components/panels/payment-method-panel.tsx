import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { ExternalLink } from "lucide-react";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { useMySubscription } from "@/features/payment/hooks/use-subscription";

interface Props {}

export function PaymentMethodPanel({}: Props) {
  const { data: subscription, isLoading } = useMySubscription();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <h3 className="text-base font-medium">결제 방법</h3>
        <Skeleton className="h-24" />
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="flex flex-col gap-3">
        <h3 className="text-base font-medium">결제 방법</h3>
        <div className="rounded-lg bg-muted/30 p-4">
          <p className="text-sm text-muted-foreground">
            활성 구독이 없습니다. 플랜을 구독하면 결제 방법을 관리할 수 있습니다.
          </p>
        </div>
      </div>
    );
  }

  const urls = subscription.urls as Record<string, string> | null;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h3 className="text-base font-medium">결제 방법</h3>
        <p className="text-sm text-muted-foreground">
          결제 수단 변경 및 관리는 고객 포털에서 진행할 수 있습니다.
        </p>
        <div className="flex flex-col gap-2">
          {urls?.update_payment_method && (
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => window.open(urls.update_payment_method, "_blank")}
            >
              <ExternalLink className="mr-2 size-4" />
              결제 수단 변경
            </Button>
          )}
          {urls?.customer_portal && (
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => window.open(urls.customer_portal, "_blank")}
            >
              <ExternalLink className="mr-2 size-4" />
              고객 포털
            </Button>
          )}
          {!urls?.update_payment_method && !urls?.customer_portal && (
            <p className="text-sm text-muted-foreground">
              결제 수단 관리 링크가 아직 준비되지 않았습니다.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

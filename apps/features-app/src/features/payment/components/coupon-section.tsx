import { useState } from "react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@superbuilder/feature-ui/shadcn/card";
import { Ticket, X } from "lucide-react";
import {
  useMyRedemption,
  useValidateCoupon,
  useApplyCoupon,
  useCancelCoupon,
} from "../hooks/use-coupon";

interface Props {
  subscriptionId: string;
}

export function CouponSection({ subscriptionId }: Props) {
  const [code, setCode] = useState("");
  const { data: redemptions } = useMyRedemption();
  const validateMutation = useValidateCoupon();
  const applyMutation = useApplyCoupon() as ReturnType<typeof useApplyCoupon> & { mutate: (...args: any[]) => void };
  const cancelMutation = useCancelCoupon() as ReturnType<typeof useCancelCoupon> & { mutate: (...args: any[]) => void };

  const activeRedemption = redemptions?.find(
    (r) => r.subscriptionId === subscriptionId,
  );

  const handleValidate = () => {
    if (!code.trim()) return;
    validateMutation.mutate({ code: code.trim() });
  };

  const handleApply = () => {
    if (!code.trim()) return;
    applyMutation.mutate(
      { code: code.trim(), subscriptionId },
      {
        onSuccess: () => {
          setCode("");
          validateMutation.reset();
        },
      },
    );
  };

  const handleCancel = (redemptionId: string) => {
    cancelMutation.mutate(redemptionId);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ticket className="h-5 w-5" />
          할인 쿠폰
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {activeRedemption ? (
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Badge variant="default">적용 중</Badge>
              <p className="mt-1 text-sm font-medium">
                {activeRedemption.discountPercent}% 할인
              </p>
              <p className="text-xs text-muted-foreground">
                만료일:{" "}
                {new Date(activeRedemption.expiresAt).toLocaleDateString()}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCancel(activeRedemption.id)}
              disabled={cancelMutation.isPending}
            >
              <X className="h-4 w-4" />
              해제
            </Button>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <Input
                placeholder="쿠폰 코드 입력"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="font-mono"
              />
              <Button
                variant="outline"
                onClick={handleValidate}
                disabled={!code.trim() || validateMutation.isPending}
              >
                확인
              </Button>
            </div>

            {validateMutation.data ? (
              validateMutation.data.valid ? (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                  <p className="text-sm font-medium text-green-800">
                    {validateMutation.data.discountPercent}% 할인 /{" "}
                    {validateMutation.data.durationMonths}개월
                  </p>
                  <Button
                    size="sm"
                    className="mt-2"
                    onClick={handleApply}
                    disabled={applyMutation.isPending}
                  >
                    {applyMutation.isPending ? "적용 중..." : "쿠폰 적용"}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-destructive">
                  {validateMutation.data.error}
                </p>
              )
            ) : null}

            {applyMutation.isError ? (
              <p className="text-sm text-destructive">
                {(applyMutation.error as unknown as Error).message}
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

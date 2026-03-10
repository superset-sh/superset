/**
 * Refund Preview Dialog
 *
 * 환불 미리보기 + 취소 확인 다이얼로그
 */
import { useState } from "react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@superbuilder/feature-ui/shadcn/dialog";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { useRefundPreview, useCancelBooking } from "../hooks";

interface Props {
  bookingId: string;
  onSuccess?: () => void;
}

export function RefundPreviewDialog({ bookingId, onSuccess }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { data: preview, isLoading } = useRefundPreview(
    open ? bookingId : "",
  );
  const cancelBooking = useCancelBooking();

  const handleCancel = () => {
    cancelBooking.mutate(
      { bookingId, reason: reason || undefined },
      {
        onSuccess: () => {
          setOpen(false);
          setReason("");
          onSuccess?.();
        },
      },
    );
  };

  return (
    <>
      <Button
        variant="outline"
        className="text-destructive"
        onClick={() => setOpen(true)}
      >
        예약 취소
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
        <DialogHeader>
          <DialogTitle>예약 취소</DialogTitle>
          <DialogDescription>
            예약을 취소하시겠습니까? 취소 후에는 되돌릴 수 없습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 환불 정보 */}
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-40" />
            </div>
          ) : preview ? (
            <div className="rounded-lg bg-muted/30 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">환불 금액</span>
                <span className="font-medium">
                  {formatPrice(preview.refundAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">환불 비율</span>
                <span className="font-medium">
                  {preview.refundPercentage}%
                </span>
              </div>
              {preview.appliedRule && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">적용 규정</span>
                  <span className="text-sm text-muted-foreground">
                    {preview.appliedRule.hours_before}시간 전 취소 시{" "}
                    {preview.appliedRule.refund_percentage}% 환불
                  </span>
                </div>
              )}
              <p className="text-sm text-muted-foreground pt-2">
                {preview.reason}
              </p>
            </div>
          ) : null}

          {/* 취소 사유 */}
          <div className="space-y-2">
            <label htmlFor="cancel-reason" className="text-sm font-medium">
              취소 사유 (선택)
            </label>
            <Textarea
              id="cancel-reason"
              placeholder="취소 사유를 입력해주세요..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            돌아가기
          </Button>
          <Button
            variant="destructive"
            onClick={handleCancel}
            disabled={cancelBooking.isPending}
          >
            {cancelBooking.isPending ? "처리 중..." : "취소 확인"}
          </Button>
        </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

function formatPrice(amount: number): string {
  return new Intl.NumberFormat("ko-KR").format(amount) + "원";
}

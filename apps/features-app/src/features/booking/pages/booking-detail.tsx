/**
 * Booking Detail - 예약 상세 (Auth)
 */
import { useParams, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Monitor,
  MapPin,
  Repeat,
  ExternalLink,
  CircleDot,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { toast } from "sonner";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { useBookingById, useConfirmPayment } from "../hooks";
import { BookingStatusBadge } from "../components/booking-status-badge";
import { RefundPreviewDialog } from "../components/refund-preview-dialog";

export function BookingDetail() {
  const { bookingId } = useParams({ strict: false });
  const navigate = useNavigate();
  const { data: booking, isLoading, error } = useBookingById(bookingId ?? "");
  const confirmPayment = useConfirmPayment();

  const handleConfirmPayment = () => {
    if (!bookingId) return;
    // 임시 결제 참조 번호 (실제 결제 연동 시 변경)
    const paymentRef = `PAY-${Date.now()}`;
    confirmPayment.mutate(
      { bookingId, paymentReference: paymentRef },
      {
        onSuccess: () => toast.success("결제가 확인되었습니다."),
        onError: (err) => toast.error(err.message || "결제 확인에 실패했습니다."),
      },
    );
  };

  if (isLoading) {
    return <BookingDetailSkeleton />;
  }

  if (error || !booking) {
    return (
      <div className="text-center py-12 space-y-4">
        <p className="text-muted-foreground">예약 정보를 찾을 수 없습니다.</p>
        <Button
          variant="outline"
          onClick={() => navigate({ to: "/my/bookings" })}
        >
          목록으로 돌아가기
        </Button>
      </div>
    );
  }

  const modeConfig = CONSULTATION_MODES[booking.consultationMode];
  const timelineSteps = getTimelineSteps(booking.status);

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* 뒤로가기 */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate({ to: "/my/bookings" })}
        className="gap-2"
      >
        <ArrowLeft className="size-4" />
        내 예약
      </Button>

      {/* 헤더 */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">예약 상세</h1>
            <BookingStatusBadge status={booking.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            예약일: {formatDateTime(booking.createdAt)}
          </p>
        </div>
      </div>

      {/* 상담 정보 */}
      <div className="rounded-lg bg-muted/30 p-6 space-y-4">
        <h2 className="text-lg font-medium">상담 정보</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoRow label="상담사" value={booking.providerName} />
          <InfoRow label="상품" value={booking.productName} />
          <InfoRow
            label="날짜"
            value={formatDate(booking.sessionDate)}
            icon={<Calendar className="size-4" />}
          />
          <InfoRow
            label="시간"
            value={`${booking.startTime} - ${booking.endTime} (${booking.durationMinutes}분)`}
            icon={<Clock className="size-4" />}
          />
          {modeConfig && (
            <InfoRow
              label="상담 방식"
              value={modeConfig.label}
              icon={<modeConfig.icon className="size-4" />}
            />
          )}
          <InfoRow label="결제 금액" value={formatPrice(booking.paymentAmount)} />
        </div>

        {/* 미팅 링크 / 장소 */}
        {booking.meetingLink && (
          <div className="flex items-center gap-2 pt-2">
            <ExternalLink className="size-4 text-muted-foreground" />
            <a
              href={booking.meetingLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline"
            >
              미팅 참가하기
            </a>
          </div>
        )}
        {booking.location && (
          <div className="flex items-center gap-2 pt-2">
            <MapPin className="size-4 text-muted-foreground" />
            <span className="text-sm">{booking.location}</span>
          </div>
        )}
      </div>

      {/* 환불 정보 */}
      {booking.refundAmount != null && booking.refundAmount > 0 && (
        <div className="rounded-lg bg-muted/30 p-6 space-y-2">
          <h2 className="text-lg font-medium">환불 정보</h2>
          <InfoRow
            label="환불 금액"
            value={formatPrice(booking.refundAmount)}
          />
          {booking.cancellationReason && (
            <InfoRow label="취소 사유" value={booking.cancellationReason} />
          )}
        </div>
      )}

      <Separator />

      {/* 타임라인 */}
      <div className="space-y-4">
        <h2 className="text-lg font-medium">진행 상태</h2>
        <div className="space-y-0">
          {timelineSteps.map((tStep, i) => (
            <TimelineItem
              key={tStep.label}
              label={tStep.label}
              status={tStep.status}
              isLast={i === timelineSteps.length - 1}
            />
          ))}
        </div>
      </div>

      <Separator />

      {/* 액션 버튼 */}
      <div className="flex items-center gap-3">
        {booking.status === "pending_payment" && (
          <Button
            onClick={handleConfirmPayment}
            disabled={confirmPayment.isPending}
          >
            {confirmPayment.isPending ? "처리 중..." : "결제 확인"}
          </Button>
        )}
        {booking.status === "confirmed" && bookingId && (
          <RefundPreviewDialog
            bookingId={bookingId}
            onSuccess={() => navigate({ to: "/my/bookings" })}
          />
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface InfoRowProps {
  label: string;
  value: string;
  icon?: React.ReactNode;
}

function InfoRow({ label, value, icon }: InfoRowProps) {
  return (
    <div className="flex items-start gap-2">
      {icon && <span className="mt-0.5 text-muted-foreground">{icon}</span>}
      <div>
        <span className="text-sm text-muted-foreground">{label}</span>
        <p className="font-medium">{value}</p>
      </div>
    </div>
  );
}

interface TimelineItemProps {
  label: string;
  status: "completed" | "current" | "pending";
  isLast: boolean;
}

function TimelineItem({ label, status, isLast }: TimelineItemProps) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center">
        {status === "completed" ? (
          <CheckCircle2 className="size-5 text-green-600" />
        ) : status === "current" ? (
          <CircleDot className="size-5 text-primary" />
        ) : (
          <XCircle className="size-5 text-muted-foreground/50" />
        )}
        {!isLast && (
          <div
            className={cn(
              "w-px h-6",
              status === "completed" ? "bg-green-600/30" : "bg-muted",
            )}
          />
        )}
      </div>
      <span
        className={cn(
          "text-sm pb-6",
          status === "completed"
            ? "text-foreground"
            : status === "current"
              ? "font-medium text-foreground"
              : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </div>
  );
}

function BookingDetailSkeleton() {
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <Skeleton className="h-8 w-24" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-32" />
      </div>
      <div className="rounded-lg bg-muted/30 p-6 space-y-4">
        <Skeleton className="h-6 w-24" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
      <Skeleton className="h-px w-full" />
      <div className="space-y-4">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

function formatPrice(amount: number): string {
  return new Intl.NumberFormat("ko-KR").format(amount) + "원";
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

interface TimelineStep {
  label: string;
  status: "completed" | "current" | "pending";
}

function getTimelineSteps(bookingStatus: string): TimelineStep[] {
  const step0: TimelineStep = { label: "예약 생성", status: "pending" };
  const step1: TimelineStep = { label: "결제 완료", status: "pending" };
  const step2: TimelineStep = { label: "상담 예정", status: "pending" };
  const step3: TimelineStep = { label: "상담 완료", status: "pending" };

  switch (bookingStatus) {
    case "pending_payment":
      step0.status = "completed";
      step1.status = "current";
      break;
    case "confirmed":
      step0.status = "completed";
      step1.status = "completed";
      step2.status = "current";
      break;
    case "completed":
      step0.status = "completed";
      step1.status = "completed";
      step2.status = "completed";
      step3.status = "completed";
      break;
    case "cancelled_by_user":
    case "cancelled_by_provider":
    case "refunded":
      step0.status = "completed";
      step1.status = "completed";
      return [
        step0,
        step1,
        { label: "취소/환불됨", status: "current" as const },
      ];
    case "no_show":
      step0.status = "completed";
      step1.status = "completed";
      step2.status = "completed";
      return [
        step0,
        step1,
        step2,
        { label: "노쇼", status: "current" as const },
      ];
    case "expired":
      step0.status = "completed";
      return [
        step0,
        { label: "만료됨", status: "current" as const },
      ];
    default:
      step0.status = "current";
  }

  return [step0, step1, step2, step3];
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const CONSULTATION_MODES: Record<
  string,
  { icon: typeof Monitor; label: string }
> = {
  online: { icon: Monitor, label: "온라인 상담" },
  offline: { icon: MapPin, label: "오프라인 상담" },
  hybrid: { icon: Repeat, label: "온/오프라인 혼합" },
};

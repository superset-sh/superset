/**
 * Booking Status Badge
 *
 * 예약 상태별 컬러 코드 뱃지
 */
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { cn } from "@superbuilder/feature-ui/lib/utils";

interface Props {
  status: string;
  className?: string;
}

export function BookingStatusBadge({ status, className }: Props) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.default ?? { label: "알 수 없음", className: "" };

  return (
    <Badge variant="secondary" className={cn(config.className, className)}>
      {config.label}
    </Badge>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending_payment: {
    label: "결제 대기",
    className: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100",
  },
  confirmed: {
    label: "확정",
    className: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  },
  completed: {
    label: "완료",
    className: "bg-green-100 text-green-800 hover:bg-green-100",
  },
  no_show: {
    label: "노쇼",
    className: "bg-red-100 text-red-800 hover:bg-red-100",
  },
  cancelled_by_user: {
    label: "고객 취소",
    className: "bg-muted text-muted-foreground hover:bg-muted",
  },
  cancelled_by_provider: {
    label: "상담사 취소",
    className: "bg-muted text-muted-foreground hover:bg-muted",
  },
  refunded: {
    label: "환불됨",
    className: "bg-purple-100 text-purple-800 hover:bg-purple-100",
  },
  expired: {
    label: "만료",
    className: "bg-muted text-muted-foreground hover:bg-muted",
  },
  default: {
    label: "알 수 없음",
    className: "bg-muted text-muted-foreground hover:bg-muted",
  },
};

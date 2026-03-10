/**
 * Provider Sessions - 세션 목록
 *
 * 상담사 예약 목록 (탭 필터, 액션 버튼)
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  UserX,
  XCircle,
} from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@superbuilder/feature-ui/shadcn/tabs";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@superbuilder/feature-ui/shadcn/dialog";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { toast } from "sonner";
import {
  useMyProviderProfile,
  useProviderBookings,
  useCompleteSession,
  useMarkNoShow,
  useProviderCancelBooking,
} from "../../hooks/use-provider-hooks";
import { BookingStatusBadge } from "../../components/booking-status-badge";

export function ProviderSessions() {
  const navigate = useNavigate();
  const { data: profile, isLoading: profileLoading } = useMyProviderProfile();
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  if (profileLoading) {
    return <SessionsSkeleton />;
  }

  if (!profile) {
    return (
      <div className="text-center py-12 space-y-4">
        <p className="text-muted-foreground">
          상담사 등록이 필요합니다.
        </p>
        <Button
          variant="outline"
          onClick={() => navigate({ to: "/provider/profile" })}
        >
          상담사 등록하기
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate({ to: "/provider/dashboard" })}
        className="gap-2"
      >
        <ArrowLeft className="size-4" />
        대시보드
      </Button>

      <div>
        <h1 className="text-3xl font-bold">세션 목록</h1>
        <p className="text-muted-foreground mt-2">
          예약된 상담 세션을 관리하세요.
        </p>
      </div>

      <SessionList
        providerId={profile.id}
        statusFilter={statusFilter}
        onStatusFilterChange={(v) => {
          setStatusFilter(v);
          setPage(1);
        }}
        page={page}
        onPageChange={setPage}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface SessionListProps {
  providerId: string;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  page: number;
  onPageChange: (page: number) => void;
}

function SessionList({
  providerId,
  statusFilter,
  onStatusFilterChange,
  page,
  onPageChange,
}: SessionListProps) {
  const { data: bookingData, isLoading } = useProviderBookings(providerId, {
    status:
      statusFilter === "all"
        ? undefined
        : (statusFilter as
            | "pending_payment"
            | "confirmed"
            | "completed"
            | "no_show"
            | "cancelled_by_user"
            | "cancelled_by_provider"
            | "refunded"
            | "expired"),
    page,
    limit: 10,
  });

  return (
    <Tabs value={statusFilter} onValueChange={onStatusFilterChange}>
      <TabsList>
        <TabsTrigger value="all">전체</TabsTrigger>
        <TabsTrigger value="confirmed">예정</TabsTrigger>
        <TabsTrigger value="completed">완료</TabsTrigger>
        <TabsTrigger value="cancelled_by_provider">취소</TabsTrigger>
      </TabsList>

      <TabsContent value={statusFilter} className="mt-6">
        {isLoading ? (
          <SessionListSkeleton />
        ) : !bookingData?.data?.length ? (
          <div className="text-center py-12 space-y-4">
            <p className="text-muted-foreground">세션이 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {bookingData.data.map((booking) => (
              <SessionCard
                key={booking.id}
                booking={booking}
                providerId={providerId}
              />
            ))}
          </div>
        )}
      </TabsContent>

      {/* 페이지네이션 */}
      {bookingData && bookingData.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            이전
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {bookingData.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= bookingData.totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            다음
          </Button>
        </div>
      )}
    </Tabs>
  );
}

interface SessionCardProps {
  booking: {
    id: string;
    customerName?: string;
    productName?: string;
    durationMinutes?: number;
    sessionDate: string;
    startTime: string;
    endTime: string;
    status: string;
    paymentAmount?: number;
  };
  providerId: string;
}

function SessionCard({ booking, providerId }: SessionCardProps) {
  const completeSession = useCompleteSession();
  const markNoShow = useMarkNoShow();
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  const handleComplete = () => {
    completeSession.mutate(booking.id, {
      onSuccess: () => toast.success("세션이 완료되었습니다."),
      onError: (err) => toast.error(err.message || "완료 처리에 실패했습니다."),
    });
  };

  const handleNoShow = () => {
    markNoShow.mutate(booking.id, {
      onSuccess: () => toast.success("노쇼로 처리되었습니다."),
      onError: (err) =>
        toast.error(err.message || "노쇼 처리에 실패했습니다."),
    });
  };

  const initials = (booking.customerName ?? "고객")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex items-center justify-between rounded-lg border bg-background p-4">
      <div className="flex items-center gap-4">
        <div className="flex size-10 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground shrink-0">
          {initials}
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">
              {booking.customerName ?? "고객"}
            </span>
            <BookingStatusBadge status={booking.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {booking.productName ?? "상담"}
          </p>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="size-3.5" />
              {formatDate(booking.sessionDate)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="size-3.5" />
              {booking.startTime} - {booking.endTime}
            </span>
          </div>
        </div>
      </div>

      {/* 액션 버튼 */}
      <div className="flex items-center gap-2 shrink-0">
        {booking.status === "confirmed" && (
          <>
            <Button
              size="sm"
              onClick={handleComplete}
              disabled={completeSession.isPending}
              className="gap-1"
            >
              <CheckCircle2 className="size-3.5" />
              완료
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNoShow}
              disabled={markNoShow.isPending}
              className="gap-1"
            >
              <UserX className="size-3.5" />
              노쇼
            </Button>
            <CancelDialog
              bookingId={booking.id}
              providerId={providerId}
              open={cancelDialogOpen}
              onOpenChange={setCancelDialogOpen}
            />
          </>
        )}
        {booking.status === "pending_payment" && (
          <span className="text-sm text-muted-foreground">결제 대기 중</span>
        )}
      </div>
    </div>
  );
}

interface CancelDialogProps {
  bookingId: string;
  providerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function CancelDialog({
  bookingId,
  providerId,
  open,
  onOpenChange,
}: CancelDialogProps) {
  const cancelBooking = useProviderCancelBooking();
  const [reason, setReason] = useState("");

  const handleCancel = () => {
    cancelBooking.mutate(
      { bookingId, providerId, reason },
      {
        onSuccess: () => {
          toast.success("예약이 취소되었습니다.");
          onOpenChange(false);
          setReason("");
        },
        onError: (err) =>
          toast.error(err.message || "취소에 실패했습니다."),
      },
    );
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onOpenChange(true)}
        className="gap-1 text-destructive hover:text-destructive"
      >
        <XCircle className="size-3.5" />
        취소
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
        <DialogHeader>
          <DialogTitle>예약 취소</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            예약을 취소하면 고객에게 환불이 진행됩니다. 취소 사유를 입력해주세요.
          </p>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="취소 사유를 입력하세요"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button
            variant="destructive"
            onClick={handleCancel}
            disabled={cancelBooking.isPending || !reason.trim()}
          >
            {cancelBooking.isPending ? "취소 중..." : "예약 취소"}
          </Button>
        </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SessionListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between rounded-lg border p-4"
        >
          <div className="flex items-center gap-4">
            <Skeleton className="size-10 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-40" />
            </div>
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
      ))}
    </div>
  );
}

function SessionsSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-8 w-24" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-64" />
      </div>
      <Skeleton className="h-10 w-80" />
      <SessionListSkeleton />
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

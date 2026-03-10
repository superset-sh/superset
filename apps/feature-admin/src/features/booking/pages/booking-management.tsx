import { useState } from "react";
import {
  MoreHorizontal,
  Calendar,
  Mail,
  Clock,
  MapPin,
  Link2,
  CreditCard,
} from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@superbuilder/feature-ui/shadcn/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@superbuilder/feature-ui/shadcn/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@superbuilder/feature-ui/shadcn/dialog";
import { Tabs, TabsList, TabsTrigger } from "@superbuilder/feature-ui/shadcn/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@superbuilder/feature-ui/shadcn/sheet";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@superbuilder/feature-ui/shadcn/avatar";
import { toast } from "sonner";
import {
  useAdminBookings,
  useAdminBookingDetail,
  useForceCancel,
  useForceComplete,
  useForceNoShow,
  useForceRefund,
} from "../hooks";
import { cn } from "@superbuilder/feature-ui/lib/utils";

interface Props {}

export function BookingManagement({}: Props) {
  const [page, setPage] = useState(1);
  const [statusTab, setStatusTab] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // 상세 Sheet
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(
    null,
  );

  // 취소 다이얼로그
  const [cancelDialog, setCancelDialog] = useState<{
    open: boolean;
    bookingId: string;
  }>({ open: false, bookingId: "" });
  const [cancelReason, setCancelReason] = useState("");

  // 환불 다이얼로그
  const [refundDialog, setRefundDialog] = useState<{
    open: boolean;
    bookingId: string;
    totalAmount: number;
  }>({ open: false, bookingId: "", totalAmount: 0 });
  const [refundAmount, setRefundAmount] = useState(0);

  const statusFilter =
    statusTab === "all" ? undefined : (statusTab as BookingStatus);

  const { data, isLoading } = useAdminBookings({
    page,
    limit: 20,
    status: statusFilter,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const { data: bookingDetail, isLoading: isDetailLoading } =
    useAdminBookingDetail(selectedBookingId ?? "");

  const forceCancel = useForceCancel();
  const forceComplete = useForceComplete();
  const forceNoShow = useForceNoShow();
  const forceRefund = useForceRefund();

  const handleForceCancel = () => {
    forceCancel.mutate(
      {
        bookingId: cancelDialog.bookingId,
        reason: cancelReason || undefined,
      },
      {
        onSuccess: () => {
          toast.success("예약이 취소되었습니다.");
          setCancelDialog({ open: false, bookingId: "" });
          setCancelReason("");
        },
        onError: (error) =>
          toast.error(error.message || "취소에 실패했습니다."),
      },
    );
  };

  const handleForceComplete = (bookingId: string) => {
    forceComplete.mutate(bookingId, {
      onSuccess: () => toast.success("예약이 완료 처리되었습니다."),
      onError: (error) =>
        toast.error(error.message || "완료 처리에 실패했습니다."),
    });
  };

  const handleForceNoShow = (bookingId: string) => {
    forceNoShow.mutate(bookingId, {
      onSuccess: () => toast.success("노쇼 처리되었습니다."),
      onError: (error) =>
        toast.error(error.message || "노쇼 처리에 실패했습니다."),
    });
  };

  const handleForceRefund = () => {
    forceRefund.mutate(
      {
        bookingId: refundDialog.bookingId,
        refundAmount,
      },
      {
        onSuccess: () => {
          toast.success("환불이 처리되었습니다.");
          setRefundDialog({ open: false, bookingId: "", totalAmount: 0 });
          setRefundAmount(0);
        },
        onError: (error) =>
          toast.error(error.message || "환불 처리에 실패했습니다."),
      },
    );
  };

  const handleTabChange = (value: string | number | null) => {
    setStatusTab(String(value ?? "all"));
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">예약 목록</h1>
        <p className="text-sm text-muted-foreground">
          전체 예약을 조회하고 관리합니다
        </p>
      </div>

      {/* 상태 탭 필터 */}
      <Tabs value={statusTab} onValueChange={handleTabChange}>
        <TabsList variant="line">
          {STATUS_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* 날짜 필터 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="space-y-1">
          <Label className="text-sm text-muted-foreground">시작일</Label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
            className="w-[160px]"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-sm text-muted-foreground">종료일</Label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
            className="w-[160px]"
          />
        </div>
        {(dateFrom || dateTo) && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-auto"
            onClick={() => {
              setDateFrom("");
              setDateTo("");
              setPage(1);
            }}
          >
            초기화
          </Button>
        )}
      </div>

      {/* 테이블 */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !data?.data?.length ? (
        <div className="py-12 text-center text-muted-foreground">
          해당 조건의 예약이 없습니다.
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>예약번호</TableHead>
                <TableHead>고객</TableHead>
                <TableHead>상담사</TableHead>
                <TableHead>상품</TableHead>
                <TableHead>날짜/시간</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-right">금액</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((booking) => (
                <TableRow
                  key={booking.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedBookingId(booking.id)}
                >
                  <TableCell className="font-medium">
                    {booking.id.slice(0, 8)}
                  </TableCell>
                  <TableCell>{booking.customerName ?? "-"}</TableCell>
                  <TableCell>{booking.providerName ?? "-"}</TableCell>
                  <TableCell className="max-w-[140px] truncate">
                    {booking.productName ?? "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {booking.sessionDate
                      ? `${booking.sessionDate} ${booking.startTime ?? ""}`
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <BookingStatusBadge status={booking.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    {booking.paymentAmount != null
                      ? formatPrice(booking.paymentAmount)
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <BookingActionMenu
                      bookingId={booking.id}
                      status={booking.status}
                      paymentAmount={booking.paymentAmount ?? 0}
                      onComplete={handleForceComplete}
                      onNoShow={handleForceNoShow}
                      onCancel={(id) => {
                        setCancelDialog({ open: true, bookingId: id });
                        setCancelReason("");
                      }}
                      onRefund={(id, amount) => {
                        setRefundDialog({
                          open: true,
                          bookingId: id,
                          totalAmount: amount,
                        });
                        setRefundAmount(amount);
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {data.totalPages > 1 && (
            <PaginationControls
              page={page}
              totalPages={data.totalPages}
              total={data.total}
              onPageChange={setPage}
            />
          )}
        </>
      )}

      {/* 상세 Sheet */}
      <Sheet
        open={!!selectedBookingId}
        onOpenChange={(open) => {
          if (!open) setSelectedBookingId(null);
        }}
      >
        <SheetContent side="right" className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>예약 상세</SheetTitle>
          </SheetHeader>

          <div className="space-y-6 p-4">
            {isDetailLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !bookingDetail ? (
              <div className="py-8 text-center text-muted-foreground">
                예약 정보를 찾을 수 없습니다.
              </div>
            ) : (
              <>
                {/* 상태 */}
                <div className="flex items-center justify-between">
                  <BookingStatusBadge status={bookingDetail.status} />
                  <span className="text-sm text-muted-foreground">
                    {bookingDetail.id.slice(0, 8)}
                  </span>
                </div>

                <Separator />

                {/* 고객 정보 */}
                <DetailSection title="고객 정보">
                  <div className="flex items-center gap-3">
                    <Avatar size="sm">
                      {bookingDetail.customerAvatar && (
                        <AvatarImage src={bookingDetail.customerAvatar} />
                      )}
                      <AvatarFallback>
                        {bookingDetail.customerName?.charAt(0) ?? "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">
                        {bookingDetail.customerName ?? "-"}
                      </p>
                      {bookingDetail.customerEmail && (
                        <p className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Mail className="size-3" />
                          {bookingDetail.customerEmail}
                        </p>
                      )}
                    </div>
                  </div>
                </DetailSection>

                <Separator />

                {/* 상담사 정보 */}
                <DetailSection title="상담사 정보">
                  <div className="flex items-center gap-3">
                    <Avatar size="sm">
                      {bookingDetail.providerAvatar && (
                        <AvatarImage src={bookingDetail.providerAvatar} />
                      )}
                      <AvatarFallback>
                        {bookingDetail.providerName?.charAt(0) ?? "?"}
                      </AvatarFallback>
                    </Avatar>
                    <p className="font-medium">
                      {bookingDetail.providerName ?? "-"}
                    </p>
                  </div>
                </DetailSection>

                <Separator />

                {/* 상품 정보 */}
                <DetailSection title="상품 정보">
                  <DetailRow label="상품명" value={bookingDetail.productName} />
                  {bookingDetail.durationMinutes != null && (
                    <DetailRow
                      label="소요 시간"
                      value={`${bookingDetail.durationMinutes}분`}
                    />
                  )}
                </DetailSection>

                <Separator />

                {/* 예약 정보 */}
                <DetailSection title="예약 정보">
                  <DetailRow
                    icon={Calendar}
                    label="날짜"
                    value={bookingDetail.sessionDate}
                  />
                  <DetailRow
                    icon={Clock}
                    label="시간"
                    value={
                      bookingDetail.startTime && bookingDetail.endTime
                        ? `${bookingDetail.startTime} ~ ${bookingDetail.endTime}`
                        : bookingDetail.startTime
                    }
                  />
                  <DetailRow
                    label="상담 방식"
                    value={
                      CONSULTATION_MODE_MAP[
                        bookingDetail.consultationMode ?? ""
                      ] ?? bookingDetail.consultationMode
                    }
                  />
                  {bookingDetail.meetingLink && (
                    <DetailRow
                      icon={Link2}
                      label="미팅 링크"
                      value={bookingDetail.meetingLink}
                    />
                  )}
                  {bookingDetail.location && (
                    <DetailRow
                      icon={MapPin}
                      label="장소"
                      value={bookingDetail.location}
                    />
                  )}
                </DetailSection>

                <Separator />

                {/* 결제 정보 */}
                <DetailSection title="결제 정보">
                  <DetailRow
                    icon={CreditCard}
                    label="결제 금액"
                    value={
                      bookingDetail.paymentAmount != null
                        ? formatPrice(bookingDetail.paymentAmount)
                        : "-"
                    }
                  />
                  {bookingDetail.refundAmount != null &&
                    bookingDetail.refundAmount > 0 && (
                      <DetailRow
                        label="환불 금액"
                        value={formatPrice(bookingDetail.refundAmount)}
                        className="text-destructive"
                      />
                    )}
                </DetailSection>

                {/* 취소 사유 */}
                {bookingDetail.cancellationReason && (
                  <>
                    <Separator />
                    <DetailSection title="취소 사유">
                      <p className="text-sm text-muted-foreground">
                        {bookingDetail.cancellationReason}
                      </p>
                    </DetailSection>
                  </>
                )}

                {/* 기타 */}
                <Separator />
                <DetailSection title="기타">
                  <DetailRow
                    label="생성일"
                    value={
                      bookingDetail.createdAt
                        ? new Date(bookingDetail.createdAt).toLocaleString(
                            "ko-KR",
                          )
                        : "-"
                    }
                  />
                </DetailSection>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* 강제 취소 다이얼로그 */}
      <Dialog
        open={cancelDialog.open}
        onOpenChange={(open) =>
          setCancelDialog((prev) => ({ ...prev, open }))
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>예약 강제 취소</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>취소 사유 (선택)</Label>
              <Textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="취소 사유를 입력해주세요"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              닫기
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleForceCancel}
              disabled={forceCancel.isPending}
            >
              강제 취소
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 강제 환불 다이얼로그 */}
      <Dialog
        open={refundDialog.open}
        onOpenChange={(open) =>
          setRefundDialog((prev) => ({ ...prev, open }))
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>예약 강제 환불</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>
                환불 금액 (결제 금액: {formatPrice(refundDialog.totalAmount)})
              </Label>
              <Input
                type="number"
                value={refundAmount}
                onChange={(e) => setRefundAmount(Number(e.target.value))}
                min={0}
                max={refundDialog.totalAmount}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              닫기
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleForceRefund}
              disabled={forceRefund.isPending || refundAmount <= 0}
            >
              환불 처리
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

function BookingStatusBadge({ status }: { status: string }) {
  const config = BOOKING_STATUS_MAP[status] ?? {
    label: status,
    className: "bg-muted text-muted-foreground",
  };

  return (
    <Badge variant="outline" className={cn("border-0", config.className)}>
      {config.label}
    </Badge>
  );
}

interface BookingActionMenuProps {
  bookingId: string;
  status: string;
  paymentAmount: number;
  onComplete: (id: string) => void;
  onNoShow: (id: string) => void;
  onCancel: (id: string) => void;
  onRefund: (id: string, amount: number) => void;
}

function BookingActionMenu({
  bookingId,
  status,
  paymentAmount,
  onComplete,
  onNoShow,
  onCancel,
  onRefund,
}: BookingActionMenuProps) {
  const actions = getAvailableActions(status, paymentAmount);

  if (actions.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="sm" />}
        onClick={(e) => e.stopPropagation()}
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {actions.map((action, index) => (
          <span key={action.key}>
            {action.separator && index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem
              className={action.destructive ? "text-destructive" : undefined}
              onSelect={() => {
                switch (action.key) {
                  case "complete":
                    onComplete(bookingId);
                    break;
                  case "no_show":
                    onNoShow(bookingId);
                    break;
                  case "cancel":
                    onCancel(bookingId);
                    break;
                  case "refund":
                    onRefund(bookingId, paymentAmount);
                    break;
                }
              }}
            >
              {action.label}
            </DropdownMenuItem>
          </span>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface DetailSectionProps {
  title: string;
  children: React.ReactNode;
}

function DetailSection({ title, children }: DetailSectionProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

interface DetailRowProps {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string | null;
  className?: string;
}

function DetailRow({ icon: Icon, label, value, className }: DetailRowProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {Icon && <Icon className="size-3.5" />}
        {label}
      </span>
      <span className={cn("text-right text-sm font-medium", className)}>
        {value ?? "-"}
      </span>
    </div>
  );
}

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (p: number) => void;
}

function PaginationControls({
  page,
  totalPages,
  total,
  onPageChange,
}: PaginationControlsProps) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">총 {total}건</p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          이전
        </Button>
        <span className="text-sm text-muted-foreground">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          다음
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

function formatPrice(price: number): string {
  return `${price.toLocaleString("ko-KR")}원`;
}

function getAvailableActions(
  status: string,
  paymentAmount: number,
): ActionItem[] {
  const actions: ActionItem[] = [];

  if (status === "confirmed") {
    actions.push({ key: "complete", label: "완료 처리" });
    actions.push({ key: "no_show", label: "노쇼 처리" });
    actions.push({ key: "cancel", label: "강제 취소", separator: true });
  }

  if (status === "pending_payment") {
    actions.push({ key: "cancel", label: "강제 취소" });
  }

  if (
    (status === "completed" || status === "cancelled_by_user" || status === "cancelled_by_provider") &&
    paymentAmount > 0
  ) {
    actions.push({
      key: "refund",
      label: "강제 환불",
      destructive: true,
      separator: true,
    });
  }

  return actions;
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const BOOKING_STATUS_MAP: Record<string, { label: string; className: string }> =
  {
    pending_payment: {
      label: "결제대기",
      className: "bg-yellow-100 text-yellow-800",
    },
    confirmed: { label: "확정", className: "bg-blue-100 text-blue-800" },
    completed: { label: "완료", className: "bg-green-100 text-green-800" },
    no_show: { label: "노쇼", className: "bg-orange-100 text-orange-800" },
    cancelled_by_user: {
      label: "고객취소",
      className: "bg-red-100 text-red-800",
    },
    cancelled_by_provider: {
      label: "상담사취소",
      className: "bg-red-100 text-red-800",
    },
    refunded: { label: "환불됨", className: "bg-purple-100 text-purple-800" },
    expired: { label: "만료", className: "bg-muted text-muted-foreground" },
  };

const STATUS_TABS = [
  { value: "all", label: "전체" },
  { value: "pending_payment", label: "결제대기" },
  { value: "confirmed", label: "확정" },
  { value: "completed", label: "완료" },
  { value: "no_show", label: "노쇼" },
  { value: "cancelled_by_user", label: "취소" },
  { value: "refunded", label: "환불" },
  { value: "expired", label: "만료" },
] as const;

const CONSULTATION_MODE_MAP: Record<string, string> = {
  online: "온라인",
  offline: "오프라인",
  hybrid: "온/오프라인",
};

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

type BookingStatus =
  | "pending_payment"
  | "confirmed"
  | "completed"
  | "no_show"
  | "cancelled_by_user"
  | "cancelled_by_provider"
  | "refunded"
  | "expired";

interface ActionItem {
  key: "complete" | "no_show" | "cancel" | "refund";
  label: string;
  destructive?: boolean;
  separator?: boolean;
}

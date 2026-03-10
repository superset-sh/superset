/**
 * My Bookings - 내 예약 (Auth)
 *
 * 일간 타임라인 뷰(기본) + 월간 캘린더 뷰 + 리스트 뷰 토글
 */
import { useState, useRef } from "react";
import { Link } from "@tanstack/react-router";
import {
  Calendar,
  ChevronRight,
  Clock,
  List,
  Search,
} from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@superbuilder/feature-ui/shadcn/tabs";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@superbuilder/feature-ui/shadcn/sheet";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { useMyBookings } from "../hooks";
import { BookingStatusBadge } from "../components/booking-status-badge";
import {
  BookingCalendar,
  getMonthStart,
  getMonthEnd,
} from "../components/booking-calendar";
import {
  BookingDayTimeline,
  getDatesFromBase,
  toDateString,
} from "../components/booking-day-timeline";
import { QuickBookingDialog } from "../components/quick-booking-dialog";

type ViewMode = "day" | "month" | "list";

export function MyBookings() {
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const scrollToTodayRef = useRef<(() => void) | null>(null);

  // 더블클릭 → 상담사 선택 모달
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [bookingDialogDate, setBookingDialogDate] = useState<string | null>(null);
  const [bookingDialogHour, setBookingDialogHour] = useState<number | null>(null);

  const handleEmptyDoubleClick = (dateStr: string, hour: number) => {
    setBookingDialogDate(dateStr);
    setBookingDialogHour(hour);
    setBookingDialogOpen(true);
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-6",
        viewMode === "day" && "h-full overflow-hidden",
      )}
    >
      {/* 페이지 헤더 */}
      <div className="shrink-0">
        <h1 className="text-3xl font-bold">내 예약</h1>
        <p className="text-muted-foreground mt-2">
          예약 내역을 확인하세요.
        </p>
      </div>

      {/* 툴바: 오늘 + 뷰 토글 */}
      <div className="flex shrink-0 items-center justify-between">
        <div>
          {viewMode === "day" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => scrollToTodayRef.current?.()}
            >
              오늘
            </Button>
          )}
        </div>
        <div className="flex items-center gap-1 rounded-lg border p-1">
          <Button
            variant={viewMode === "day" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("day")}
            className="gap-1.5"
          >
            <Clock className="size-4" />
            <span className="hidden sm:inline">일간</span>
          </Button>
          <Button
            variant={viewMode === "month" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("month")}
            className="gap-1.5"
          >
            <Calendar className="size-4" />
            <span className="hidden sm:inline">월간</span>
          </Button>
          <Button
            variant={viewMode === "list" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("list")}
            className="gap-1.5"
          >
            <List className="size-4" />
            <span className="hidden sm:inline">목록</span>
          </Button>
        </div>
      </div>

      {viewMode === "day" && (
        <div className="flex-1 min-h-0">
          <DayTimelineView
            scrollToTodayRef={scrollToTodayRef}
            onEmptyDoubleClick={handleEmptyDoubleClick}
          />
        </div>
      )}
      {viewMode === "month" && <MonthCalendarView />}
      {viewMode === "list" && <ListView />}

      {/* 상담사 선택 모달 */}
      <QuickBookingDialog
        open={bookingDialogOpen}
        onOpenChange={setBookingDialogOpen}
        selectedDate={bookingDialogDate}
        selectedHour={bookingDialogHour}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

/** 타임라인 표시 시간 범위 (향후 사용자 설정 가능) */
const TIMELINE_START_HOUR = 7;
const TIMELINE_END_HOUR = 23;

/** 일간 타임라인 뷰 (기본) — 시간대 기반 가로 스크롤, 무한 확장 */
function DayTimelineView({
  scrollToTodayRef,
  onEmptyDoubleClick,
}: {
  scrollToTodayRef: React.MutableRefObject<(() => void) | null>;
  onEmptyDoubleClick: (dateStr: string, hour: number) => void;
}) {
  const LOAD_MORE_DAYS = 30;
  const [dayCount, setDayCount] = useState(30);
  const baseDate = toDateString(new Date());

  const dates = getDatesFromBase(baseDate, dayCount);
  const dateFrom = toDateString(dates[0]!);
  const dateTo = toDateString(dates[dates.length - 1]!);

  const { data: bookingData, isLoading } = useMyBookings({
    dateFrom,
    dateTo,
    limit: 500,
  });

  const bookings = bookingData?.data ?? [];

  return (
    <BookingDayTimeline
      bookings={bookings}
      isLoading={isLoading}
      baseDate={baseDate}
      dayCount={dayCount}
      startHour={TIMELINE_START_HOUR}
      endHour={TIMELINE_END_HOUR}
      onLoadMore={() => setDayCount((prev) => prev + LOAD_MORE_DAYS)}
      scrollToTodayRef={scrollToTodayRef}
      onEmptyDoubleClick={onEmptyDoubleClick}
      className="h-full"
      renderBookingCard={(booking) => (
        <TimelineBookingCard
          key={booking.id}
          booking={booking as unknown as BookingCardData}
        />
      )}
    />
  );
}

/** 월간 캘린더 뷰 */
function MonthCalendarView() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const monthStart = getMonthStart(currentDate);
  const monthEnd = getMonthEnd(currentDate);

  const { data: bookingData, isLoading } = useMyBookings({
    dateFrom: monthStart,
    dateTo: monthEnd,
    limit: 100,
  });

  const bookings = bookingData?.data ?? [];

  // 선택한 날짜의 예약 목록
  const selectedDayBookings = selectedDate
    ? bookings.filter((b) => {
        const sd =
          typeof b.sessionDate === "string"
            ? b.sessionDate.slice(0, 10)
            : (b.sessionDate as Date).toISOString().slice(0, 10);
        return sd === selectedDate;
      })
    : [];

  return (
    <>
      <BookingCalendar
        bookings={bookings}
        isLoading={isLoading}
        currentDate={currentDate}
        onMonthChange={setCurrentDate}
        onDayClick={setSelectedDate}
      />

      {/* 예약 없을 때 CTA */}
      {!isLoading && bookings.length === 0 && (
        <div className="text-center py-8 space-y-3">
          <p className="text-muted-foreground">
            이번 달 예약 내역이 없습니다.
          </p>
          <Link
            to="/booking"
            className="inline-flex items-center gap-1.5 text-primary hover:underline text-sm"
          >
            <Search className="size-3.5" />
            상담사 찾아보기
          </Link>
        </div>
      )}

      {/* 날짜 상세 Sheet */}
      <Sheet
        open={selectedDate !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedDate(null);
        }}
      >
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>
              {selectedDate && formatDateFull(selectedDate)}
            </SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-3 p-4">
            {selectedDayBookings.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                이 날짜에 예약이 없습니다.
              </p>
            ) : (
              selectedDayBookings.map((booking) => (
                <SheetBookingCard key={booking.id} booking={booking} />
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/** 목록 뷰 */
function ListView() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  const { data: bookingData, isLoading } = useMyBookings({
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
    <>
      <Tabs
        value={statusFilter}
        onValueChange={(v) => {
          setStatusFilter(v);
          setPage(1);
        }}
      >
        <TabsList>
          <TabsTrigger value="all">전체</TabsTrigger>
          <TabsTrigger value="confirmed">예정</TabsTrigger>
          <TabsTrigger value="completed">완료</TabsTrigger>
          <TabsTrigger value="cancelled_by_user">취소</TabsTrigger>
        </TabsList>

        <TabsContent value={statusFilter} className="mt-6">
          {isLoading ? (
            <BookingListSkeleton />
          ) : !bookingData?.data?.length ? (
            <div className="text-center py-12 space-y-4">
              <p className="text-muted-foreground">예약 내역이 없습니다.</p>
              <Link to="/booking" className="text-primary hover:underline">
                상담사 찾아보기
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {bookingData.data.map((booking) => (
                <ListBookingCard key={booking.id} booking={booking} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* 페이지네이션 */}
      {bookingData && bookingData.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
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
            onClick={() => setPage(page + 1)}
          >
            다음
          </Button>
        </div>
      )}
    </>
  );
}

/** 시간대 타임라인용 예약 카드 (상태별 배경색, h-full) */
function TimelineBookingCard({ booking }: { booking: BookingCardData }) {
  const displayName = booking.providerName ?? "상담사";

  return (
    <Link
      to="/my/bookings/$bookingId"
      params={{ bookingId: booking.id }}
      className={cn(
        "flex flex-col h-full rounded-md border px-2 py-1 overflow-hidden transition-colors",
        "hover:brightness-95",
        getStatusColor(booking.status),
      )}
    >
      <p className="text-sm font-medium truncate">{displayName}</p>
      <span className="text-sm text-muted-foreground truncate">
        {booking.startTime} - {booking.endTime}
      </span>
      {booking.productName && (
        <p className="text-sm text-muted-foreground truncate">
          {booking.productName}
        </p>
      )}
    </Link>
  );
}

/** 목록 뷰 예약 카드 */
function ListBookingCard({ booking }: { booking: BookingCardData }) {
  const displayName = booking.providerName ?? "상담사";
  const initials = displayName
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const sessionDateStr =
    typeof booking.sessionDate === "string"
      ? booking.sessionDate
      : booking.sessionDate.toISOString().split("T")[0] ?? "";

  return (
    <Link
      to="/my/bookings/$bookingId"
      params={{ bookingId: booking.id }}
      className="group flex items-center justify-between rounded-lg border bg-background p-4 hover:border-primary/50 transition-colors"
    >
      <div className="flex items-center gap-4">
        <div className="flex size-10 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground shrink-0">
          {booking.providerAvatar ? (
            <img
              src={booking.providerAvatar}
              alt={displayName}
              className="size-full rounded-full object-cover"
            />
          ) : (
            initials
          )}
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{displayName}</span>
            <BookingStatusBadge status={booking.status} />
          </div>
          {booking.productName && (
            <p className="text-sm text-muted-foreground">
              {booking.productName}
            </p>
          )}
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="size-3.5" />
              {formatDate(sessionDateStr)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="size-3.5" />
              {booking.startTime} - {booking.endTime}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">
          {formatPrice(booking.paymentAmount)}
        </span>
        <ChevronRight className="size-4 text-muted-foreground group-hover:text-primary transition-colors" />
      </div>
    </Link>
  );
}

/** Sheet 내 간결한 예약 카드 */
function SheetBookingCard({ booking }: { booking: BookingCardData }) {
  const displayName = booking.providerName ?? "상담사";

  return (
    <Link
      to="/my/bookings/$bookingId"
      params={{ bookingId: booking.id }}
      className="flex items-center justify-between rounded-lg border bg-background p-3 hover:border-primary/50 transition-colors"
    >
      <div className="space-y-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{displayName}</span>
          <BookingStatusBadge status={booking.status} />
        </div>
        {booking.productName && (
          <p className="text-sm text-muted-foreground truncate">
            {booking.productName}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          {booking.startTime} - {booking.endTime}
        </p>
      </div>
      <ChevronRight className="size-4 text-muted-foreground shrink-0" />
    </Link>
  );
}

function BookingListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
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
          <Skeleton className="h-5 w-20" />
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

function getStatusColor(status: string): string {
  switch (status) {
    case "confirmed":
      return "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800";
    case "completed":
      return "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800";
    case "pending_payment":
      return "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800";
    case "no_show":
      return "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800";
    default:
      return "bg-muted/50 border-border";
  }
}

function formatPrice(amount: number): string {
  return new Intl.NumberFormat("ko-KR").format(amount) + "원";
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function formatDateFull(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

interface BookingCardData {
  id: string;
  providerId: string;
  productId: string;
  providerName?: string;
  providerAvatar?: string | null;
  productName?: string;
  durationMinutes?: number;
  sessionDate: string | Date;
  startTime: string;
  endTime: string;
  status: string;
  paymentAmount: number;
}

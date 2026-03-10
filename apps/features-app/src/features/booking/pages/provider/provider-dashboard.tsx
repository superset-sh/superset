/**
 * Provider Dashboard - 상담사 대시보드
 *
 * 미등록 상태면 등록 CTA, 등록 완료 시 통계/일간 타임라인/빠른 메뉴 표시
 */
import { useState, useRef } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  Clock,
  Settings,
  User,
  UserPlus,
} from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Card, CardContent } from "@superbuilder/feature-ui/shadcn/card";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import {
  useMyProviderProfile,
  useProviderBookings,
} from "../../hooks/use-provider-hooks";
import {
  BookingDayTimeline,
  getDatesFromBase,
  toDateString,
} from "../../components/booking-day-timeline";

export function ProviderDashboard() {
  const { data: profile, isLoading: profileLoading } = useMyProviderProfile();
  const scrollToTodayRef = useRef<(() => void) | null>(null);

  if (profileLoading) {
    return <DashboardSkeleton />;
  }

  // 미등록 상태 → 등록 CTA
  if (!profile) {
    return <RegistrationCta />;
  }

  return (
    <div className="flex h-full flex-col gap-8 overflow-hidden">
      <div className="shrink-0">
        <h1 className="text-3xl font-bold">상담사 대시보드</h1>
        <p className="text-muted-foreground mt-2">
          예약 현황과 스케줄을 한눈에 확인하세요.
        </p>
      </div>

      {/* 통계 카드 */}
      <StatsSection providerId={profile.id} />

      <Separator className="shrink-0" />

      {/* 타임라인 툴바 */}
      <div className="flex shrink-0 items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => scrollToTodayRef.current?.()}
        >
          오늘
        </Button>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="size-4" />
          <span>빈 시간 더블클릭으로 세션 등록</span>
        </div>
      </div>

      {/* 일간 타임라인 */}
      <div className="flex-1 min-h-0">
        <ProviderTimeline
          providerId={profile.id}
          scrollToTodayRef={scrollToTodayRef}
        />
      </div>

      <Separator className="shrink-0" />

      {/* 빠른 링크 */}
      <div className="shrink-0 space-y-4">
        <h2 className="text-lg font-medium">빠른 메뉴</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <QuickLink
            to="/provider/schedule"
            icon={CalendarDays}
            label="스케줄 관리"
            description="가용 시간을 설정하세요"
          />
          <QuickLink
            to="/provider/sessions"
            icon={CalendarCheck}
            label="세션 목록"
            description="예약 내역을 확인하세요"
          />
          <QuickLink
            to="/provider/profile"
            icon={User}
            label="프로필 편집"
            description="상담사 정보를 수정하세요"
          />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

function RegistrationCta() {
  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-6">
      <div className="flex size-16 items-center justify-center rounded-full bg-muted">
        <UserPlus className="size-8 text-muted-foreground" />
      </div>
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">상담사로 등록하세요</h1>
        <p className="text-muted-foreground max-w-md">
          상담사로 등록하면 예약을 받고, 스케줄을 관리하고, 상담 세션을 진행할 수
          있습니다.
        </p>
      </div>
      <Button render={<Link to="/provider/profile" />} nativeButton={false} size="lg" className="gap-2">
        <UserPlus className="size-4" />
        상담사 등록하기
      </Button>
    </div>
  );
}

interface StatsSectionProps {
  providerId: string;
}

function StatsSection({ providerId }: StatsSectionProps) {
  const today = new Date().toISOString().split("T")[0] ?? "";
  const weekStart = getWeekStart();
  const weekEnd = getWeekEnd();

  const { data: todayData } = useProviderBookings(providerId, {
    dateFrom: today,
    dateTo: today,
    status: "confirmed",
    limit: 100,
  });

  const { data: weekData } = useProviderBookings(providerId, {
    dateFrom: weekStart,
    dateTo: weekEnd,
    limit: 100,
  });

  const { data: completedData } = useProviderBookings(providerId, {
    status: "completed",
    limit: 1,
  });

  const todayCount = todayData?.data?.length ?? 0;
  const weekCount = weekData?.data?.length ?? 0;
  const totalCompleted = completedData?.total ?? 0;
  const totalAll = (weekData?.total ?? 0) || 1;
  const completionRate =
    totalAll > 0
      ? Math.round((totalCompleted / (totalCompleted + totalAll)) * 100)
      : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        label="오늘 예약"
        value={`${todayCount}건`}
        icon={CalendarCheck}
      />
      <StatCard
        label="이번 주 예약"
        value={`${weekCount}건`}
        icon={CalendarDays}
      />
      <StatCard
        label="총 완료"
        value={`${totalCompleted}건`}
        icon={CheckCircle2}
      />
      <StatCard
        label="완료율"
        value={`${completionRate}%`}
        icon={Settings}
      />
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  icon: typeof CalendarCheck;
}

function StatCard({ label, value, icon: Icon }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
            <Icon className="size-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-xl font-semibold">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** 타임라인 표시 시간 범위 (향후 사용자 설정 가능) */
const TIMELINE_START_HOUR = 7;
const TIMELINE_END_HOUR = 23;

/** 상담사 일간 타임라인 — 시간대 기반 가로 스크롤, 무한 확장 */
function ProviderTimeline({
  providerId,
  scrollToTodayRef,
}: {
  providerId: string;
  scrollToTodayRef: React.MutableRefObject<(() => void) | null>;
}) {
  const navigate = useNavigate();
  const LOAD_MORE_DAYS = 30;
  const [dayCount, setDayCount] = useState(30);
  const baseDate = toDateString(new Date());

  const dates = getDatesFromBase(baseDate, dayCount);
  const dateFrom = toDateString(dates[0]!);
  const dateTo = toDateString(dates[dates.length - 1]!);

  const { data: bookingData, isLoading } = useProviderBookings(providerId, {
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
      onEmptyDoubleClick={(_dateStr, _hour) => {
        navigate({ to: "/provider/sessions" });
      }}
      className="h-full"
      renderBookingCard={(booking) => (
        <ProviderSessionCard key={booking.id} booking={booking} />
      )}
    />
  );
}

/** 상담사 타임라인 세션 카드 (상태별 배경색, h-full) */
function ProviderSessionCard({
  booking,
}: {
  booking: { id: string; startTime: string; endTime: string; status: string; [key: string]: unknown };
}) {
  const customerName = (booking.customerName as string) ?? "고객";
  const productName = booking.productName as string | undefined;

  return (
    <Link
      to="/provider/sessions"
      className={cn(
        "flex flex-col h-full rounded-md border px-2 py-1 overflow-hidden transition-colors",
        "hover:brightness-95",
        getStatusColor(booking.status),
      )}
    >
      <p className="text-sm font-medium truncate">{customerName}</p>
      <span className="text-sm text-muted-foreground truncate">
        {booking.startTime} - {booking.endTime}
      </span>
      {productName && (
        <p className="text-sm text-muted-foreground truncate">
          {productName}
        </p>
      )}
    </Link>
  );
}

interface QuickLinkProps {
  to: string;
  icon: typeof CalendarDays;
  label: string;
  description: string;
}

function QuickLink({ to, icon: Icon, label, description }: QuickLinkProps) {
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-4 rounded-lg border bg-background p-4",
        "hover:border-primary/50 transition-colors",
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-lg bg-muted shrink-0">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </Link>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-64" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-px w-full" />
      <div className="space-y-4">
        <Skeleton className="h-6 w-32" />
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-48 rounded-lg" />
      </div>
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

function getWeekStart(): string {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d.toISOString().split("T")[0] ?? "";
}

function getWeekEnd(): string {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() + (6 - day));
  return d.toISOString().split("T")[0] ?? "";
}

import { Card, CardContent, CardHeader, CardTitle } from "@superbuilder/feature-ui/shadcn/card";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@superbuilder/feature-ui/shadcn/table";
import {
  CalendarCheck,
  Users,
  CheckCircle,
  Banknote,
  Clock,
  CircleCheck,
  XCircle,
  RotateCcw,
  ArrowRight,
  FolderTree,
  ShieldAlert,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useBookingAdminStats, useAdminBookings } from "../hooks";
import { cn } from "@superbuilder/feature-ui/lib/utils";

interface Props {}

export function BookingAdminDashboard({}: Props) {
  const { data: stats, isLoading: statsLoading } = useBookingAdminStats();
  const { data: recentBookings, isLoading: bookingsLoading } =
    useAdminBookings({ limit: 5 });
  const navigate = useNavigate();

  const formatCurrency = (amount: number) =>
    `${amount.toLocaleString("ko-KR")}원`;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">예약 관리</h1>
        <p className="text-sm text-muted-foreground">
          예약 시스템 전체 현황을 한눈에 확인합니다
        </p>
      </div>

      {/* 핵심 지표 (Row 1) */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          title="오늘 예약"
          value={stats?.todayBookings}
          icon={CalendarCheck}
          isLoading={statsLoading}
        />
        <StatCard
          title="활성 상담사"
          value={stats?.activeProviders}
          icon={Users}
          isLoading={statsLoading}
        />
        <StatCard
          title="확정 예약"
          value={stats?.confirmedBookings}
          icon={CheckCircle}
          isLoading={statsLoading}
        />
        <StatCard
          title="총 수익"
          value={stats?.totalRevenue}
          icon={Banknote}
          isLoading={statsLoading}
          formatter={formatCurrency}
        />
      </div>

      {/* 상태별 카운트 (Row 2) */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MiniStatCard
          title="대기"
          value={stats?.pendingBookings}
          isLoading={statsLoading}
          icon={Clock}
          className="text-yellow-600"
        />
        <MiniStatCard
          title="완료"
          value={stats?.completedBookings}
          isLoading={statsLoading}
          icon={CircleCheck}
          className="text-green-600"
        />
        <MiniStatCard
          title="취소"
          value={stats?.cancelledBookings}
          isLoading={statsLoading}
          icon={XCircle}
          className="text-destructive"
        />
        <MiniStatCard
          title="환불"
          value={stats?.refundedBookings}
          isLoading={statsLoading}
          icon={RotateCcw}
          className="text-purple-600"
        />
      </div>

      {/* 최근 예약 테이블 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">최근 예약</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              navigate({ to: "/booking/bookings" as string })
            }
          >
            전체 보기
            <ArrowRight className="ml-1 size-4" />
          </Button>
        </div>

        {bookingsLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !recentBookings?.data?.length ? (
          <div className="py-12 text-center text-muted-foreground">
            아직 예약이 없습니다.
          </div>
        ) : (
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentBookings.data.map((booking) => (
                <TableRow
                  key={booking.id}
                  className="cursor-pointer"
                  onClick={() =>
                    navigate({
                      to: "/booking/bookings" as string,
                    })
                  }
                >
                  <TableCell className="font-medium">
                    {booking.id.slice(0, 8)}
                  </TableCell>
                  <TableCell>{booking.customerName ?? "-"}</TableCell>
                  <TableCell>{booking.providerName ?? "-"}</TableCell>
                  <TableCell className="max-w-[120px] truncate">
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
                      ? formatCurrency(booking.paymentAmount)
                      : "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* 퀵 네비게이션 */}
      <div className="space-y-4">
        <h2 className="text-lg font-medium">관리 메뉴</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {QUICK_NAV_ITEMS.map((item) => (
            <Card
              key={item.path}
              className="cursor-pointer transition-colors hover:bg-muted/30"
              onClick={() => navigate({ to: item.path as string })}
            >
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex size-10 items-center justify-center rounded-lg bg-muted/50">
                  <item.icon className="size-5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.label}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.description}
                  </p>
                </div>
                <ArrowRight className="size-4 text-muted-foreground/70" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface StatCardProps {
  title: string;
  value: number | undefined;
  icon: React.ComponentType<{ className?: string }>;
  isLoading: boolean;
  formatter?: (v: number) => string;
}

function StatCard({
  title,
  value,
  icon: Icon,
  isLoading,
  formatter,
}: StatCardProps) {
  const displayValue =
    value != null ? (formatter ? formatter(value) : String(value)) : "0";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <p className="text-2xl font-semibold">{displayValue}</p>
        )}
      </CardContent>
    </Card>
  );
}

interface MiniStatCardProps {
  title: string;
  value: number | undefined;
  isLoading: boolean;
  icon: React.ComponentType<{ className?: string }>;
  className?: string;
}

function MiniStatCard({
  title,
  value,
  isLoading,
  icon: Icon,
  className,
}: MiniStatCardProps) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <Icon className={cn("size-5", className)} />
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          {isLoading ? (
            <Skeleton className="mt-1 h-6 w-10" />
          ) : (
            <p className="text-xl font-semibold">{value ?? 0}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

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

const QUICK_NAV_ITEMS = [
  {
    label: "상담사 관리",
    description: "상담사 등록 및 상태 관리",
    icon: Users,
    path: "/booking/providers",
  },
  {
    label: "예약 관리",
    description: "전체 예약 조회 및 처리",
    icon: CalendarCheck,
    path: "/booking/bookings",
  },
  {
    label: "카테고리 관리",
    description: "서비스 카테고리 설정",
    icon: FolderTree,
    path: "/booking/categories",
  },
  {
    label: "환불 정책",
    description: "환불 규칙 및 정책 관리",
    icon: ShieldAlert,
    path: "/booking/refund-policy",
  },
];

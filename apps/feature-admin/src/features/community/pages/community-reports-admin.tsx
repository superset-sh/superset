import { useState } from "react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@superbuilder/feature-ui/shadcn/tabs";
import { PageHeader } from "@superbuilder/feature-ui/components/page-header";
import {
  FileText,
  MessageSquare,
  User,
  Inbox,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { useAdminReports, useReportStats, useResolveReport } from "../hooks";

type StatusFilter = "all" | "pending" | "reviewing" | "resolved" | "dismissed";

export function CommunityReportsAdmin() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [page, setPage] = useState(1);
  const limit = 20;

  // 데이터 조회
  const {
    data: reportsData,
    isLoading,
    isError,
    refetch,
  } = useAdminReports({
    page,
    limit,
    status: statusFilter === "all" ? undefined : statusFilter,
  });

  const { data: stats, isLoading: isStatsLoading } = useReportStats();
  const resolveReport = useResolveReport();

  const reports = reportsData?.data ?? [];
  const total = reportsData?.total ?? 0;
  const totalPages = reportsData?.totalPages ?? 1;

  const statCounts = {
    pending: stats?.pending ?? 0,
    reviewing: stats?.reviewing ?? 0,
    resolved: stats?.resolved ?? 0,
    dismissed: stats?.dismissed ?? 0,
  };

  const handleResolve = async (reportId: string) => {
    await resolveReport.mutateAsync({ reportId, action: "removed" });
  };

  const handleDismiss = async (reportId: string) => {
    await resolveReport.mutateAsync({ reportId, action: "dismissed" });
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value as StatusFilter);
    setPage(1);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <PageHeader
        title="신고 관리"
        description="전체 커뮤니티의 신고된 콘텐츠"
      />

      <Separator />

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-4 rounded-lg border">
          {isStatsLoading ? (
            <Skeleton className="h-8 w-12" />
          ) : (
            <div className="text-2xl font-bold tabular-nums">
              {statCounts.pending}
            </div>
          )}
          <div className="text-xs text-muted-foreground mt-1">대기 중</div>
        </div>
        <div className="p-4 rounded-lg border">
          {isStatsLoading ? (
            <Skeleton className="h-8 w-12" />
          ) : (
            <div className="text-2xl font-bold tabular-nums">
              {statCounts.reviewing}
            </div>
          )}
          <div className="text-xs text-muted-foreground mt-1">검토 중</div>
        </div>
        <div className="p-4 rounded-lg border">
          {isStatsLoading ? (
            <Skeleton className="h-8 w-12" />
          ) : (
            <div className="text-2xl font-bold tabular-nums">
              {statCounts.resolved}
            </div>
          )}
          <div className="text-xs text-muted-foreground mt-1">해결됨</div>
        </div>
        <div className="p-4 rounded-lg border">
          {isStatsLoading ? (
            <Skeleton className="h-8 w-12" />
          ) : (
            <div className="text-2xl font-bold tabular-nums">
              {statCounts.dismissed}
            </div>
          )}
          <div className="text-xs text-muted-foreground mt-1">기각됨</div>
        </div>
      </div>

      {/* Filters */}
      <Tabs value={statusFilter} onValueChange={handleStatusChange}>
        <TabsList>
          <TabsTrigger value="all">전체</TabsTrigger>
          <TabsTrigger value="pending">대기 중</TabsTrigger>
          <TabsTrigger value="reviewing">검토 중</TabsTrigger>
          <TabsTrigger value="resolved">해결됨</TabsTrigger>
          <TabsTrigger value="dismissed">기각됨</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Reports List */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : reports.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="space-y-2">
            {reports.map((report) => {
              const TargetIcon = getTargetIcon(report.targetType);
              const isPending =
                report.status === "pending" || report.status === "reviewing";
              return (
                <div
                  key={report.id}
                  className="flex items-start gap-4 p-4 rounded-lg border hover:bg-muted/30 transition-colors"
                >
                  <div className="p-2 rounded-md bg-muted shrink-0">
                    <TargetIcon className="size-4 text-muted-foreground" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <Badge variant="outline" className="text-xs">
                        {reasonLabels[report.reason] ?? report.reason}
                      </Badge>
                      <StatusBadge status={report.status} />
                      <span className="text-xs text-muted-foreground">
                        커뮤니티: {report.communityId.slice(0, 8)}...
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ·{" "}
                        {formatDistanceToNow(new Date(report.createdAt), {
                          addSuffix: true,
                          locale: ko,
                        })}
                      </span>
                    </div>

                    {report.description && (
                      <p className="text-sm mb-1.5">{report.description}</p>
                    )}

                    <div className="text-xs text-muted-foreground">
                      신고자: {report.reporterId.slice(0, 8)}... · 대상:{" "}
                      {targetTypeLabels[report.targetType] ?? report.targetType}
                    </div>
                  </div>

                  {isPending && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleResolve(report.id)}
                        disabled={resolveReport.isPending}
                      >
                        처리
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDismiss(report.id)}
                        disabled={resolveReport.isPending}
                      >
                        기각
                      </Button>
                    </div>
                  )}

                  {!isPending && report.actionTaken && (
                    <div className="shrink-0">
                      <Badge variant="secondary" className="text-xs">
                        {actionLabels[report.actionTaken] ??
                          report.actionTaken}
                      </Badge>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              전체 {total}건 중 {(page - 1) * limit + 1}-
              {Math.min(page * limit, total)}건 표시
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="w-4 h-4" />
                이전
              </Button>
              <span className="text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                다음
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const reasonLabels: Record<string, string> = {
  spam: "스팸",
  harassment: "괴롭힘",
  hate_speech: "혐오 발언",
  misinformation: "허위 정보",
  nsfw: "성인 콘텐츠",
  other: "기타",
};

const targetTypeLabels: Record<string, string> = {
  post: "게시글",
  comment: "댓글",
  user: "사용자",
};

const actionLabels: Record<string, string> = {
  removed: "삭제됨",
  banned: "밴됨",
  warned: "경고됨",
  dismissed: "기각됨",
};

const statusBadgeVariants: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  pending: "destructive",
  reviewing: "default",
  resolved: "secondary",
  dismissed: "outline",
};

const statusLabels: Record<string, string> = {
  pending: "대기 중",
  reviewing: "검토 중",
  resolved: "해결됨",
  dismissed: "기각됨",
};

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

function getTargetIcon(type: string) {
  switch (type) {
    case "post":
      return FileText;
    case "comment":
      return MessageSquare;
    case "user":
      return User;
    default:
      return FileText;
  }
}

interface StatusBadgeProps {
  status: string;
}

function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <Badge
      variant={statusBadgeVariants[status] ?? "outline"}
      className="text-xs"
    >
      {statusLabels[status] ?? status}
    </Badge>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-start gap-4 p-4 rounded-lg border">
          <Skeleton className="h-8 w-8 rounded-md" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-16 rounded-md" />
              <Skeleton className="h-5 w-16 rounded-md" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-48" />
          </div>
          <div className="flex gap-1">
            <Skeleton className="h-8 w-14 rounded-md" />
            <Skeleton className="h-8 w-14 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface ErrorStateProps {
  onRetry: () => void;
}

function ErrorState({ onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <p className="text-muted-foreground">
        신고 목록을 불러오는 데 실패했습니다.
      </p>
      <Button variant="outline" onClick={onRetry}>
        <RefreshCw className="w-4 h-4 mr-2" />
        다시 시도
      </Button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <div className="rounded-full bg-muted p-3 mb-3">
        <Inbox className="size-5 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">신고가 없습니다</p>
    </div>
  );
}

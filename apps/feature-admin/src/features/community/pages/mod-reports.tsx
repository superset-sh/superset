import { useState } from "react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Tabs, TabsList, TabsTrigger } from "@superbuilder/feature-ui/shadcn/tabs";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { FileText, MessageSquare, User, Inbox, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { Link } from "@tanstack/react-router";
import { useCommunity, useModerationReports, useResolveReportMod } from "../hooks";

interface ModReportsProps {
  communitySlug: string;
}

export function ModReports({ communitySlug }: ModReportsProps) {
  const [statusFilter, setStatusFilter] = useState<"pending" | "reviewing" | "resolved">("pending");

  // slug → communityId 변환
  const { data: community, isLoading: communityLoading } = useCommunity(communitySlug);
  const communityId = community?.id ?? "";

  // 신고 목록 조회
  const {
    data: reports,
    isLoading: reportsLoading,
    isError,
    refetch,
  } = useModerationReports(communityId, statusFilter, !!communityId);
  const resolveReport = useResolveReportMod();

  const isLoading = communityLoading || reportsLoading;
  const reportList = reports ?? [];

  // 상태별 카운트 계산
  const statCounts = {
    pending: reportList.filter((r) => r.status === "pending").length,
    reviewing: reportList.filter((r) => r.status === "reviewing").length,
    resolved: reportList.filter((r) => r.status === "resolved").length,
  };

  const handleResolve = async (reportId: string) => {
    await resolveReport.mutateAsync({ reportId, action: "removed" });
  };

  const handleDismiss = async (reportId: string) => {
    await resolveReport.mutateAsync({ reportId, action: "dismissed" });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">신고 관리</h1>
          <p className="text-sm text-muted-foreground">c/{communitySlug}</p>
        </div>
        <Link to="/c/$slug/mod" params={{ slug: communitySlug }}>
          <Button variant="ghost" size="sm">대시보드로</Button>
        </Link>
      </div>

      <Separator />

      {/* Stats */}
      {isLoading ? (
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="p-4 rounded-lg border">
              <Skeleton className="h-8 w-12" />
              <Skeleton className="h-3 w-16 mt-2" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 rounded-lg border">
            <div className="text-2xl font-bold tabular-nums">{statCounts.pending}</div>
            <div className="text-xs text-muted-foreground mt-1">대기 중</div>
          </div>
          <div className="p-4 rounded-lg border">
            <div className="text-2xl font-bold tabular-nums">{statCounts.reviewing}</div>
            <div className="text-xs text-muted-foreground mt-1">검토 중</div>
          </div>
          <div className="p-4 rounded-lg border">
            <div className="text-2xl font-bold tabular-nums">{statCounts.resolved}</div>
            <div className="text-xs text-muted-foreground mt-1">해결됨</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
        <TabsList>
          <TabsTrigger value="pending">대기 중</TabsTrigger>
          <TabsTrigger value="reviewing">검토 중</TabsTrigger>
          <TabsTrigger value="resolved">해결됨</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Reports List */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : (
        <div className="space-y-2">
          {reportList.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <div className="rounded-full bg-muted p-3 mb-3">
                <Inbox className="size-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">신고가 없습니다</p>
            </div>
          ) : (
            reportList.map((report) => {
              const TargetIcon = getTargetIcon(report.targetType);
              const isPending = report.status === "pending" || report.status === "reviewing";

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
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(report.createdAt), {
                          addSuffix: true,
                          locale: ko,
                        })}
                      </span>
                    </div>

                    {report.description && (
                      <p className="text-sm mb-1">{report.description}</p>
                    )}

                    <div className="text-xs text-muted-foreground">
                      대상: {targetTypeLabels[report.targetType] ?? report.targetType}
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
                </div>
              );
            })
          )}
        </div>
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

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

function getTargetIcon(type: string) {
  switch (type) {
    case "post": return FileText;
    case "comment": return MessageSquare;
    case "user": return User;
    default: return FileText;
  }
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-start gap-4 p-4 rounded-lg border">
          <Skeleton className="h-8 w-8 rounded-md" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-16 rounded-md" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-32" />
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

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <p className="text-muted-foreground">신고 목록을 불러오는 데 실패했습니다.</p>
      <Button variant="outline" onClick={onRetry}>
        <RefreshCw className="w-4 h-4 mr-2" />
        다시 시도
      </Button>
    </div>
  );
}

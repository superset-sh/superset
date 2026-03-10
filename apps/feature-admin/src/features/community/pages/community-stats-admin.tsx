import { TrendingUp, RefreshCw, Users, FileText, MessageSquare, LayoutGrid } from "lucide-react";
import { PageHeader } from "@superbuilder/feature-ui/components/page-header";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { useCommunityStats, useAdminCommunities } from "../hooks";

interface Props {}

export function CommunityStatsAdmin({}: Props) {
  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
    refetch: statsRefetch,
  } = useCommunityStats();

  const {
    data: topData,
    isLoading: topLoading,
    isError: topError,
    refetch: topRefetch,
  } = useAdminCommunities({ page: 1, limit: 5 });

  const topCommunities = topData?.data ?? [];

  const isLoading = statsLoading || topLoading;
  const isError = statsError || topError;

  const handleRetry = () => {
    statsRefetch();
    topRefetch();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <PageHeader
        title="커뮤니티 통계"
        description="커뮤니티 전체 통계 및 인사이트"
      />

      {isLoading ? (
        <StatsLoadingSkeleton />
      ) : isError ? (
        <ErrorState onRetry={handleRetry} />
      ) : (
        <>
          {/* Overview Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                label: "커뮤니티",
                value: stats?.totalCommunities ?? 0,
                icon: <LayoutGrid className="size-4 text-muted-foreground" />,
              },
              {
                label: "전체 멤버",
                value: (stats?.totalMembers ?? 0).toLocaleString(),
                icon: <Users className="size-4 text-muted-foreground" />,
              },
              {
                label: "게시글",
                value: (stats?.totalPosts ?? 0).toLocaleString(),
                icon: <FileText className="size-4 text-muted-foreground" />,
              },
              {
                label: "댓글",
                value: (stats?.totalComments ?? 0).toLocaleString(),
                icon: <MessageSquare className="size-4 text-muted-foreground" />,
              },
            ].map((stat) => (
              <div key={stat.label} className="p-4 rounded-lg border">
                <div className="flex items-center gap-2 mb-2">
                  {stat.icon}
                  <span className="text-sm text-muted-foreground">{stat.label}</span>
                </div>
                <div className="text-2xl font-bold tabular-nums">{stat.value}</div>
              </div>
            ))}
          </div>

          {/* Top Communities */}
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <TrendingUp className="size-3.5" />
              최근 커뮤니티
            </h2>
            {topCommunities.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">커뮤니티가 없습니다.</p>
            ) : (
              <div className="space-y-1">
                {topCommunities.map((community, index) => (
                  <div
                    key={community.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    <span className="text-sm font-bold text-muted-foreground w-4 text-right tabular-nums">
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">c/{community.slug}</div>
                      <div className="text-sm text-muted-foreground">
                        {(community.memberCount ?? 0).toLocaleString()} 멤버 ·{" "}
                        {(community.postCount ?? 0).toLocaleString()} 게시글
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* TODO: 상위 사용자 섹션 — 백엔드 API가 준비되면 추가 */}
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

function StatsLoadingSkeleton() {
  return (
    <div className="space-y-8">
      {/* Stats cards skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="p-4 rounded-lg border space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>

      {/* Top communities skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-28" />
        <div className="space-y-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5">
              <Skeleton className="h-4 w-4" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface ErrorStateProps {
  onRetry: () => void;
}

function ErrorState({ onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-4">
      <p className="text-sm text-muted-foreground">데이터를 불러오는 데 실패했습니다.</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="size-4 mr-2" />
        다시 시도
      </Button>
    </div>
  );
}

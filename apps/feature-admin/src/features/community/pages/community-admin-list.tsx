import { useState } from "react";
import {
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Shield,
  Lock,
  Eye,
  ArrowRight,
  Trash2,
  Users,
  FileText,
  MessageSquare,
  Globe,
} from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { Avatar, AvatarFallback } from "@superbuilder/feature-ui/shadcn/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@superbuilder/feature-ui/shadcn/alert-dialog";
import { PageHeader } from "@superbuilder/feature-ui/components/page-header";
import { Link } from "@tanstack/react-router";
import {
  useAdminCommunities,
  useCommunityStats,
  useDeleteCommunity,
} from "../hooks";

export function CommunityAdminList() {
  // 페이지네이션 & 검색
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  // 삭제 확인 Dialog
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // 데이터 조회
  const { data, isLoading, isError, refetch } = useAdminCommunities({
    page,
    limit,
    search: search || undefined,
  });
  const { data: stats } = useCommunityStats();
  const deleteMutation = useDeleteCommunity();

  const communities = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      await deleteMutation.mutateAsync({ communityId: deleteTarget.id });
      setDeleteTarget(null);
    } catch {
      // 에러 토스트는 hook에서 처리됨
    }
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="커뮤니티 관리"
        description="전체 커뮤니티 목록 및 관리"
      />

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-4 rounded-lg border">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Globe className="size-4" />
            <span className="text-sm">전체</span>
          </div>
          <div className="text-2xl font-bold tabular-nums">
            {stats?.totalCommunities ?? "-"}
          </div>
        </div>
        <div className="p-4 rounded-lg border">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Users className="size-4" />
            <span className="text-sm">멤버</span>
          </div>
          <div className="text-2xl font-bold tabular-nums">
            {stats?.totalMembers != null
              ? stats.totalMembers.toLocaleString()
              : "-"}
          </div>
        </div>
        <div className="p-4 rounded-lg border">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <FileText className="size-4" />
            <span className="text-sm">게시글</span>
          </div>
          <div className="text-2xl font-bold tabular-nums">
            {stats?.totalPosts != null
              ? stats.totalPosts.toLocaleString()
              : "-"}
          </div>
        </div>
        <div className="p-4 rounded-lg border">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <MessageSquare className="size-4" />
            <span className="text-sm">댓글</span>
          </div>
          <div className="text-2xl font-bold tabular-nums">
            {stats?.totalComments != null
              ? stats.totalComments.toLocaleString()
              : "-"}
          </div>
        </div>
      </div>

      {/* 검색 */}
      <div className="flex items-center gap-2">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="커뮤니티 검색..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="pl-9"
          />
        </div>
        <Button variant="outline" onClick={handleSearch}>
          검색
        </Button>
      </div>

      {/* 데이터 상태별 렌더링 */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : communities.length === 0 ? (
        <EmptyState hasSearch={!!search} />
      ) : (
        <>
          {/* Communities List */}
          <div className="space-y-1">
            {communities.map((community) => (
              <div
                key={community.id}
                className="flex items-center gap-4 px-3 py-3 rounded-lg hover:bg-muted/30 transition-colors group"
              >
                <Link
                  to="/c/$slug/mod"
                  params={{ slug: community.slug }}
                  className="flex items-center gap-4 flex-1 min-w-0"
                >
                  <Avatar size="sm">
                    <AvatarFallback>
                      {community.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">
                        c/{community.slug}
                      </span>
                      {community.isOfficial && (
                        <Badge
                          variant="outline"
                          className="text-[10px] gap-0.5 py-0 px-1.5"
                        >
                          <Shield className="size-2.5" />
                          공식
                        </Badge>
                      )}
                      {community.type === "private" && (
                        <Badge
                          variant="outline"
                          className="text-[10px] gap-0.5 py-0 px-1.5"
                        >
                          <Lock className="size-2.5" />
                          비공개
                        </Badge>
                      )}
                      {community.type === "restricted" && (
                        <Badge
                          variant="outline"
                          className="text-[10px] gap-0.5 py-0 px-1.5"
                        >
                          <Eye className="size-2.5" />
                          제한
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5">
                      {community.memberCount.toLocaleString()} 멤버 ·{" "}
                      {community.postCount.toLocaleString()} 게시글
                    </div>
                  </div>

                  <ArrowRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setDeleteTarget({
                      id: community.id,
                      name: community.name,
                    })
                  }
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>

          {/* 페이지네이션 */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              전체 {total}개 중 {(page - 1) * limit + 1}-
              {Math.min(page * limit, total)}개 표시
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

      {/* 삭제 확인 AlertDialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>커뮤니티를 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleteTarget?.name}&quot; 커뮤니티를 삭제합니다. 이 작업은
              되돌릴 수 없으며, 모든 게시글과 댓글이 함께 삭제됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground"
            >
              {deleteMutation.isPending ? "처리 중..." : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* Stats skeleton */}
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="p-4 rounded-lg border space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-7 w-12" />
          </div>
        ))}
      </div>
      {/* List skeleton */}
      <div className="space-y-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-3 py-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <p className="text-muted-foreground">
        커뮤니티 목록을 불러오는 데 실패했습니다.
      </p>
      <Button variant="outline" onClick={onRetry}>
        <RefreshCw className="w-4 h-4 mr-2" />
        다시 시도
      </Button>
    </div>
  );
}

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-2">
      <p className="text-muted-foreground">
        {hasSearch ? "검색 결과가 없습니다." : "생성된 커뮤니티가 없습니다."}
      </p>
      {hasSearch && (
        <p className="text-sm text-muted-foreground/70">
          다른 검색어를 시도해보세요.
        </p>
      )}
    </div>
  );
}

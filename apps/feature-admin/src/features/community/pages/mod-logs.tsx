import { useState } from "react";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@superbuilder/feature-ui/shadcn/select";
import { Shield, Trash2, Pin, Lock, UserX, FileText, RefreshCw, Inbox } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { Link } from "@tanstack/react-router";
import { useCommunity, useModerationLogs } from "../hooks";

interface ModLogsProps {
  communitySlug: string;
}

export function ModLogs({ communitySlug }: ModLogsProps) {
  const [actionFilter, setActionFilter] = useState("all");
  const [page, setPage] = useState(1);

  // slug → communityId 변환
  const { data: community, isLoading: communityLoading } = useCommunity(communitySlug);
  const communityId = community?.id ?? "";

  // 모더레이션 로그 조회
  const {
    data: logsData,
    isLoading: logsLoading,
    isError,
    refetch,
  } = useModerationLogs({ communityId, page, limit: 50 }, !!communityId);

  const isLoading = communityLoading || logsLoading;
  const logs = logsData?.items ?? [];

  // 액션 필터링
  const filteredLogs = actionFilter === "all"
    ? logs
    : logs.filter((log) => log.action === actionFilter);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">활동 기록</h1>
          <p className="text-sm text-muted-foreground">c/{communitySlug}</p>
        </div>
        <Link to="/c/$slug/mod" params={{ slug: communitySlug }}>
          <Button variant="ghost" size="sm">대시보드로</Button>
        </Link>
      </div>

      <Separator />

      {/* Filters */}
      <div className="flex items-center gap-2">
        <Select value={actionFilter} onValueChange={(v) => v && setActionFilter(v)}>
          <SelectTrigger>
            <SelectValue placeholder="작업 유형" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">모든 작업</SelectItem>
            <SelectItem value="remove_post">게시글 삭제</SelectItem>
            <SelectItem value="remove_comment">댓글 삭제</SelectItem>
            <SelectItem value="ban_user">사용자 차단</SelectItem>
            <SelectItem value="pin_post">게시글 고정</SelectItem>
            <SelectItem value="lock_post">게시글 잠금</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Logs */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : filteredLogs.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <div className="rounded-full bg-muted p-3 mb-3">
            <Inbox className="size-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">활동 기록이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-1">
          {filteredLogs.map((log) => {
            const ActionIcon = getActionIcon(log.action);
            const isDestructive = log.action.includes("remove") || log.action.includes("ban");

            return (
              <div
                key={log.id}
                className="flex items-start gap-3 px-3 py-3 rounded-lg hover:bg-muted/30 transition-colors"
              >
                <div className="p-1.5 rounded-md bg-muted shrink-0 mt-0.5">
                  <ActionIcon className="size-3.5 text-muted-foreground" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className={`text-xs ${isDestructive ? "text-red-600 border-red-200 dark:border-red-800" : ""}`}
                    >
                      {actionLabels[log.action] ?? log.action}
                    </Badge>
                    {log.moderatorId && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Shield className="size-2.5" />
                        {log.moderatorId.slice(0, 8)}...
                      </span>
                    )}
                  </div>

                  <div className="mt-1 text-sm">
                    {log.reason && (
                      <span className="text-muted-foreground">{log.reason}</span>
                    )}
                  </div>

                  {log.details && typeof log.details === "object" && Object.keys(log.details).length > 0 && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {JSON.stringify(log.details)}
                    </div>
                  )}
                </div>

                <span className="text-xs text-muted-foreground shrink-0 mt-0.5">
                  {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true, locale: ko })}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* 페이지네이션 (간단 버전) */}
      {!isLoading && !isError && logs.length >= 50 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            이전
          </Button>
          <span className="text-sm text-muted-foreground">페이지 {page}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
          >
            다음
          </Button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const actionLabels: Record<string, string> = {
  remove_post: "게시글 삭제",
  remove_comment: "댓글 삭제",
  ban_user: "사용자 차단",
  unban_user: "차단 해제",
  pin_post: "게시글 고정",
  lock_post: "게시글 잠금",
  add_flair: "플레어 추가",
  edit_rules: "규칙 수정",
};

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

function getActionIcon(action: string) {
  switch (action) {
    case "remove_post":
    case "remove_comment":
      return Trash2;
    case "ban_user":
    case "unban_user":
      return UserX;
    case "pin_post":
      return Pin;
    case "lock_post":
      return Lock;
    default:
      return FileText;
  }
}

function LoadingSkeleton() {
  return (
    <div className="space-y-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-3 py-3">
          <Skeleton className="h-7 w-7 rounded-md" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-20 rounded-md" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-4 w-3/4" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <p className="text-muted-foreground">활동 기록을 불러오는 데 실패했습니다.</p>
      <Button variant="outline" onClick={onRetry}>
        <RefreshCw className="w-4 h-4 mr-2" />
        다시 시도
      </Button>
    </div>
  );
}

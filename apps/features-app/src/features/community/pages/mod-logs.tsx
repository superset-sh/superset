import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@superbuilder/feature-ui/shadcn/select";
import { Shield, Trash2, Pin, Lock, UserX, FileText } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { Link } from "@tanstack/react-router";

interface ModLogsProps {
  communitySlug: string;
}

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

const getActionIcon = (action: string) => {
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
};

export function ModLogs({ communitySlug }: ModLogsProps) {
  // TODO: Implement actual data fetching
  const logs = [
    {
      id: "1",
      action: "remove_post",
      moderator: "mod_user1",
      targetType: "post",
      targetTitle: "Spam post",
      reason: "커뮤니티 규칙 #3 위반",
      createdAt: new Date(Date.now() - 30 * 60 * 1000),
    },
    {
      id: "2",
      action: "ban_user",
      moderator: "mod_user2",
      targetType: "user",
      targetUsername: "spammer123",
      reason: "반복적인 스팸 위반",
      details: "영구 차단",
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    },
    {
      id: "3",
      action: "pin_post",
      moderator: "mod_user1",
      targetType: "post",
      targetTitle: "Important announcement",
      reason: "커뮤니티 공지",
      createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
    },
    {
      id: "4",
      action: "lock_post",
      moderator: "mod_user3",
      targetType: "post",
      targetTitle: "Heated discussion",
      reason: "댓글 내 다수 규칙 위반",
      createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
    },
  ];

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
        <Select defaultValue="all">
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

        <Select defaultValue="all">
          <SelectTrigger>
            <SelectValue placeholder="모더레이터" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">모든 모더레이터</SelectItem>
            <SelectItem value="mod_user1">mod_user1</SelectItem>
            <SelectItem value="mod_user2">mod_user2</SelectItem>
            <SelectItem value="mod_user3">mod_user3</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Logs */}
      <div className="space-y-1">
        {logs.map((log) => {
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
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Shield className="size-2.5" />
                    {log.moderator}
                  </span>
                </div>

                <div className="mt-1 text-sm">
                  {log.targetTitle && <span className="font-medium">{log.targetTitle}</span>}
                  {log.targetUsername && <span className="font-medium">u/{log.targetUsername}</span>}
                  {log.reason && (
                    <span className="text-muted-foreground ml-1.5">— {log.reason}</span>
                  )}
                </div>

                {log.details && (
                  <div className="text-xs text-muted-foreground mt-0.5">{log.details}</div>
                )}
              </div>

              <span className="text-xs text-muted-foreground shrink-0 mt-0.5">
                {formatDistanceToNow(log.createdAt, { addSuffix: true, locale: ko })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

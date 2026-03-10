import { useState } from "react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { Tabs, TabsList, TabsTrigger } from "@superbuilder/feature-ui/shadcn/tabs";
import { FileText, MessageSquare, User, Inbox } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { Link } from "@tanstack/react-router";

const reasonLabels: Record<string, string> = {
  spam: "스팸",
  harassment: "괴롭힘",
  hate_speech: "혐오 발언",
  misinformation: "허위 정보",
};

export function CommunityReportsAdmin() {
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "reviewing" | "resolved">("pending");

  // TODO: Implement actual data fetching
  const reports = [
    {
      id: "1",
      targetType: "post",
      targetId: "post-1",
      communitySlug: "programming",
      reason: "spam",
      description: "This is a spam post advertising services",
      status: "pending",
      reporterName: "user123",
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    },
    {
      id: "2",
      targetType: "comment",
      targetId: "comment-1",
      communitySlug: "gaming",
      reason: "harassment",
      description: "Harassing another user",
      status: "reviewing",
      reporterName: "moderator1",
      createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
    },
  ];

  const getTargetIcon = (type: string) => {
    switch (type) {
      case "post": return FileText;
      case "comment": return MessageSquare;
      case "user": return User;
      default: return FileText;
    }
  };

  const statCounts = { pending: 23, reviewing: 8, resolved: 145, dismissed: 32 };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">신고 관리</h1>
        <p className="text-sm text-muted-foreground">전체 커뮤니티의 신고된 콘텐츠</p>
      </div>

      <Separator />

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
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
        <div className="p-4 rounded-lg border">
          <div className="text-2xl font-bold tabular-nums">{statCounts.dismissed}</div>
          <div className="text-xs text-muted-foreground mt-1">기각됨</div>
        </div>
      </div>

      {/* Filters */}
      <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
        <TabsList>
          <TabsTrigger value="all">전체</TabsTrigger>
          <TabsTrigger value="pending">대기 중</TabsTrigger>
          <TabsTrigger value="reviewing">검토 중</TabsTrigger>
          <TabsTrigger value="resolved">해결됨</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Reports List */}
      <div className="space-y-2">
        {reports.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <div className="rounded-full bg-muted p-3 mb-3">
              <Inbox className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">신고가 없습니다</p>
          </div>
        ) : (
          reports.map((report) => {
            const TargetIcon = getTargetIcon(report.targetType);
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
                    <Link
                      to="/c/$slug"
                      params={{ slug: report.communitySlug }}
                      className="text-xs text-muted-foreground hover:underline"
                    >
                      c/{report.communitySlug}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      · {formatDistanceToNow(report.createdAt, { addSuffix: true, locale: ko })}
                    </span>
                  </div>

                  <p className="text-sm mb-1.5">{report.description}</p>

                  <div className="text-xs text-muted-foreground">
                    신고자: u/{report.reporterName} · 대상: {report.targetType === "post" ? "게시글" : report.targetType === "comment" ? "댓글" : "사용자"}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="default">처리</Button>
                  <Button size="sm" variant="ghost">기각</Button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

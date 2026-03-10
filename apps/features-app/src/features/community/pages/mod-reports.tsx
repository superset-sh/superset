import { useState } from "react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Tabs, TabsList, TabsTrigger } from "@superbuilder/feature-ui/shadcn/tabs";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { FileText, MessageSquare, User, Inbox } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { Link } from "@tanstack/react-router";

interface ModReportsProps {
  communitySlug: string;
}

const reasonLabels: Record<string, string> = {
  spam: "스팸",
  harassment: "괴롭힘",
  hate_speech: "혐오 발언",
  misinformation: "허위 정보",
};

export function ModReports({ communitySlug }: ModReportsProps) {
  const [statusFilter, setStatusFilter] = useState<"pending" | "reviewing" | "resolved">("pending");

  // TODO: Implement actual data fetching
  const reports = [
    {
      id: "1",
      targetType: "post",
      targetTitle: "Spam post title",
      reason: "spam",
      description: "This post is promoting commercial services",
      reporterName: "user456",
      status: "pending",
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    },
    {
      id: "2",
      targetType: "comment",
      targetContent: "Offensive comment content...",
      reason: "harassment",
      description: "Harassing another user",
      reporterName: "user789",
      status: "reviewing",
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

  const statCounts = { pending: 5, reviewing: 3, resolved: 47 };

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

      {/* Filters */}
      <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
        <TabsList>
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
                    <span className="text-xs text-muted-foreground">
                      신고자: u/{report.reporterName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      · {formatDistanceToNow(report.createdAt, { addSuffix: true, locale: ko })}
                    </span>
                  </div>

                  {report.targetType === "post" && report.targetTitle && (
                    <div className="text-sm font-medium mb-1">{report.targetTitle}</div>
                  )}
                  {report.targetType === "comment" && report.targetContent && (
                    <div className="text-sm text-muted-foreground mb-1 line-clamp-1">{report.targetContent}</div>
                  )}

                  <p className="text-xs text-muted-foreground">{report.description}</p>
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

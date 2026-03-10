import { useState } from "react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Tabs, TabsList, TabsTrigger } from "@superbuilder/feature-ui/shadcn/tabs";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { FileText, MessageSquare, Check, X, Inbox } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { Link } from "@tanstack/react-router";

interface ModQueueProps {
  communitySlug: string;
}

export function ModQueue({ communitySlug }: ModQueueProps) {
  const [filter, setFilter] = useState<"all" | "posts" | "comments">("all");

  // TODO: Implement actual data fetching
  const queueItems = [
    {
      id: "1",
      type: "post",
      title: "Check out this amazing deal!",
      author: "user123",
      content: "Visit my website for more...",
      reason: "스팸 필터",
      createdAt: new Date(Date.now() - 30 * 60 * 1000),
    },
    {
      id: "2",
      type: "comment",
      content: "This is a very offensive comment that violates community guidelines...",
      author: "troll_user",
      postTitle: "Discussion about gaming",
      reason: "키워드 필터",
      createdAt: new Date(Date.now() - 45 * 60 * 1000),
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">검토 대기열</h1>
          <p className="text-sm text-muted-foreground">c/{communitySlug}</p>
        </div>
        <Link to="/c/$slug/mod" params={{ slug: communitySlug }}>
          <Button variant="ghost" size="sm">대시보드로</Button>
        </Link>
      </div>

      <Separator />

      {/* Filters */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
        <TabsList>
          <TabsTrigger value="all">전체</TabsTrigger>
          <TabsTrigger value="posts">게시글</TabsTrigger>
          <TabsTrigger value="comments">댓글</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Queue Items */}
      <div className="space-y-2">
        {queueItems.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <div className="rounded-full bg-muted p-3 mb-3">
              <Inbox className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">검토 대기 중인 콘텐츠가 없습니다</p>
          </div>
        ) : (
          queueItems.map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-4 p-4 rounded-lg border hover:bg-muted/30 transition-colors"
            >
              <div className="p-2 rounded-md bg-muted shrink-0">
                {item.type === "post" ? (
                  <FileText className="size-4 text-muted-foreground" />
                ) : (
                  <MessageSquare className="size-4 text-muted-foreground" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <Badge variant="outline" className="text-xs">
                    {item.type === "post" ? "게시글" : "댓글"}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">{item.reason}</Badge>
                  <span className="text-xs text-muted-foreground">
                    u/{item.author}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    · {formatDistanceToNow(item.createdAt, { addSuffix: true, locale: ko })}
                  </span>
                </div>

                {item.type === "post" && item.title && (
                  <div className="text-sm font-medium mb-1">{item.title}</div>
                )}
                {item.type === "comment" && item.postTitle && (
                  <div className="text-xs text-muted-foreground mb-1">
                    게시글: {item.postTitle}
                  </div>
                )}

                <p className="text-sm text-muted-foreground line-clamp-2">{item.content}</p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <Button size="sm" variant="ghost" className="gap-1 text-green-600 hover:text-green-700 hover:bg-green-50">
                  <Check className="size-3.5" />
                  승인
                </Button>
                <Button size="sm" variant="ghost" className="gap-1 text-destructive hover:text-destructive">
                  <X className="size-3.5" />
                  삭제
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

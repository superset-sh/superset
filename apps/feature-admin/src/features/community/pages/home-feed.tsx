import { useState } from "react";
import { Card, CardContent } from "@superbuilder/feature-ui/shadcn/card";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { PostCard } from "../components/post-card";
import { SortDropdown } from "../components/sort-dropdown";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Link } from "@tanstack/react-router";
import { Compass } from "lucide-react";
import { useHomeFeed } from "../hooks";

export function HomeFeed() {
  const [sort, setSort] = useState<"hot" | "new" | "top" | "rising" | "controversial">("hot");
  const [timeFilter, setTimeFilter] = useState<"hour" | "day" | "week" | "month" | "year" | "all">("day");

  const { data: feedData, isLoading } = useHomeFeed({ sort, timeFilter });
  const posts = feedData?.items ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">홈 피드</h1>
          <p className="text-muted-foreground">가입한 커뮤니티의 게시글</p>
        </div>
        <Link to="/communities">
          <Button variant="outline" className="gap-2">
            <Compass className="size-4" />
            커뮤니티 탐색
          </Button>
        </Link>
      </div>

      <Separator />

      {/* Sort Controls */}
      <SortDropdown
        value={sort}
        onChange={setSort}
        timeFilter={timeFilter}
        onTimeFilterChange={setTimeFilter}
      />

      {/* Posts */}
      <div className="space-y-3">
        {isLoading ? (
          [...Array(4)].map((_, i) => (
            <Card key={i} className="p-4">
              <div className="flex gap-3">
                <Skeleton className="h-16 w-8" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-48" />
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                  <div className="flex gap-3 pt-1">
                    <Skeleton className="h-7 w-20" />
                    <Skeleton className="h-7 w-16" />
                  </div>
                </div>
              </div>
            </Card>
          ))
        ) : posts.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-16 text-center">
              <div className="rounded-full bg-muted p-4 mb-4">
                <Compass className="size-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-1">피드가 비어있습니다</h3>
              <p className="text-muted-foreground mb-6 max-w-sm">
                커뮤니티에 가입하면 이곳에 게시글이 표시됩니다.
              </p>
              <Link to="/communities">
                <Button>커뮤니티 탐색하기</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          posts.map((post: any) => (
            <PostCard key={post.id} post={post as any} communitySlug={post.communitySlug} showCommunity />
          ))
        )}
      </div>
    </div>
  );
}

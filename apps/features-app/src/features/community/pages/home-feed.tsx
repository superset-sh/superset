import { useState } from "react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { Link } from "@tanstack/react-router";
import { Compass } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CommunityCard } from "../components/community-card";
import { PostCard } from "../components/post-card";
import { SortTabs } from "../components/sort-tabs";
import { useHomeFeed, usePopularCommunities } from "../hooks";
import { useKarma } from "../hooks/use-karma";

export function HomeFeed() {
  const [sort, setSort] = useState<"hot" | "new" | "top" | "rising" | "controversial">("hot");
  const [timeFilter, setTimeFilter] = useState<"hour" | "day" | "week" | "month" | "year" | "all">(
    "day",
  );

  const { data: feedData, isLoading } = useHomeFeed({ sort, timeFilter });
  const { data: trendingCommunities, isLoading: isLoadingTrending } = usePopularCommunities(5);
  const posts = feedData?.items ?? [];
  const authorIds = posts.map((post: any) => post.authorId).filter(Boolean);
  const { data: karmaMap } = useKarma(authorIds);
  const prefersReducedMotion = useReducedMotion();
  const duration = prefersReducedMotion ? 0 : 0.3;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0 space-y-6">
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
        <SortTabs
          value={sort}
          onChange={setSort}
          timeFilter={timeFilter}
          onTimeFilterChange={setTimeFilter}
        />

        {/* Posts */}
        <div className="space-y-3">
          {isLoading ? (
            [...Array(4)].map((_, i) => (
              <div key={i} className="rounded-lg border p-4">
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
              </div>
            ))
          ) : posts.length === 0 ? (
            <div className="flex flex-col items-center rounded-xl border py-16 text-center">
              <div className="bg-muted mb-4 rounded-full p-4">
                <Compass className="text-muted-foreground size-8" />
              </div>
              <h3 className="mb-1 text-lg font-semibold">피드가 비어있습니다</h3>
              <p className="text-muted-foreground mb-6 max-w-sm">
                커뮤니티에 가입하면 이곳에 게시글이 표시됩니다.
              </p>
              <Link to="/communities">
                <Button>커뮤니티 탐색하기</Button>
              </Link>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {posts.map((post: any, index: number) => (
                <motion.div
                  key={post.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{
                    duration,
                    delay: prefersReducedMotion ? 0 : Math.min(index * 0.05, 0.5),
                  }}
                >
                  <PostCard post={post as any} communitySlug={post.communitySlug} showCommunity karma={karmaMap?.get(post.authorId)} />
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>

      <aside className="hidden space-y-4 lg:block">
        <h2 className="text-base font-semibold">인기 커뮤니티</h2>
        <div className="space-y-1">
          {isLoadingTrending
            ? [...Array(4)].map((_, i) => (
                <div key={i} className="rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-10 rounded-full" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                </div>
              ))
            : (trendingCommunities ?? [])
                .slice(0, 5)
                .map((community: any) => (
                  <CommunityCard key={community.id} community={community as any} />
                ))}
        </div>
      </aside>
    </div>
  );
}

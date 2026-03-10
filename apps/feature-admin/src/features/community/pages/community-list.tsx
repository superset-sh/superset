import { useState } from "react";
import { Search, Plus, Compass } from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Tabs, TabsList, TabsTrigger } from "@superbuilder/feature-ui/shadcn/tabs";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { Link } from "@tanstack/react-router";
import { CommunityCard } from "../components/community-card";
import { useCommunities, useJoinCommunity } from "../hooks";

export function CommunityList() {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "popular" | "name">("popular");
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useCommunities({ search, sort, limit: 20 });
  const joinMutation = useJoinCommunity();

  const handleJoin = (slug: string) => {
    joinMutation.mutate(slug);
  };

  const allItems = data?.pages.flatMap((page: { items: any[] }) => page.items) ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">커뮤니티</h1>
          <p className="text-muted-foreground">관심 있는 커뮤니티를 찾아보세요</p>
        </div>
        <Link to="/communities/create">
          <Button className="gap-2">
            <Plus className="size-4" />
            커뮤니티 만들기
          </Button>
        </Link>
      </div>

      <Separator />

      {/* Search and Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="커뮤니티 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Tabs value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
          <TabsList>
            <TabsTrigger value="popular">인기순</TabsTrigger>
            <TabsTrigger value="newest">최신순</TabsTrigger>
            <TabsTrigger value="name">이름순</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Communities Grid */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="space-y-3 rounded-xl border p-4">
              <div className="flex items-start gap-3">
                <Skeleton className="size-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              </div>
              <div className="flex justify-between">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-16 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      ) : allItems.length > 0 ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {allItems.map((community: any) => (
              <CommunityCard
                key={community.id}
                community={community as any}
                onJoin={() => handleJoin(community.slug)}
              />
            ))}
          </div>
          {hasNextPage && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? "불러오는 중..." : "더 보기"}
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <Compass className="size-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-1">
            {search ? "검색 결과가 없습니다" : "아직 커뮤니티가 없습니다"}
          </h3>
          <p className="text-muted-foreground mb-6 max-w-sm">
            {search
              ? "다른 검색어를 시도하거나 새로운 커뮤니티를 만들어보세요."
              : "첫 번째 커뮤니티를 만들어보세요!"}
          </p>
          <Link to="/communities/create">
            <Button className="gap-2">
              <Plus className="size-4" />
              커뮤니티 만들기
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

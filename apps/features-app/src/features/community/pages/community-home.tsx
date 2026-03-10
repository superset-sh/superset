import { authenticatedAtom } from "@superbuilder/features-client/core/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@superbuilder/feature-ui/shadcn/avatar";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Card, CardContent, CardHeader, CardTitle } from "@superbuilder/feature-ui/shadcn/card";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { useAtomValue } from "jotai";
import { Calendar, FileText, Globe, Info, LogIn, Plus, Shield, Users } from "lucide-react";
import { PostCard } from "../components/post-card";
import {
  useCommunity,
  useCommunityPosts,
  useJoinCommunity,
  useLeaveCommunity,
  useMyMembership,
} from "../hooks";

interface CommunityHomeProps {
  slug: string;
}

export function CommunityHome({ slug }: CommunityHomeProps) {
  const isAuthenticated = useAtomValue(authenticatedAtom);

  const { data: community, isLoading: isLoadingCommunity } = useCommunity(slug);
  const {
    data: postsData,
    isLoading: isLoadingPosts,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useCommunityPosts({ communitySlug: slug, limit: 25 });

  const joinMutation = useJoinCommunity();
  const leaveMutation = useLeaveCommunity();
  const { data: membership } = useMyMembership(slug);
  const isMember = !!membership;

  if (isLoadingCommunity) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <Skeleton className="h-48 rounded-xl" />
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
        <div className="space-y-4">
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!community) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="bg-muted mb-4 rounded-full p-4">
          <Users className="text-muted-foreground size-8" />
        </div>
        <h3 className="mb-1 text-lg font-semibold">커뮤니티를 찾을 수 없습니다</h3>
        <p className="text-muted-foreground mb-6">존재하지 않거나 삭제된 커뮤니티입니다.</p>
        <Link to="/communities">
          <Button variant="outline">커뮤니티 목록으로</Button>
        </Link>
      </div>
    );
  }

  const createdAt = formatDistanceToNow(new Date(community.createdAt), {
    addSuffix: true,
    locale: ko,
  });
  const posts = postsData?.pages.flatMap((page: { items: any[] }) => page.items) ?? [];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
      {/* Main Content */}
      <div className="space-y-4">
        {/* Community Header */}
        <header className="border-border border-b pb-6">
          <div className="bg-muted h-32 overflow-hidden rounded-lg">
            {community.bannerUrl ? (
              <img src={community.bannerUrl} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>

          <div className="-mt-8 pt-2">
            <div className="flex min-w-0 items-start gap-4">
              <Avatar className="ring-background size-16 ring-4">
                {community.iconUrl ? (
                  <AvatarImage src={community.iconUrl} alt={community.name} />
                ) : null}
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-bold">
                  {community.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <section className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <h1 className="truncate text-2xl font-bold">{community.name}</h1>
                  {community.isOfficial && (
                    <Badge variant="outline" className="gap-1">
                      <Shield className="size-3" />
                      공식
                    </Badge>
                  )}
                </div>
                <p className="text-muted-foreground text-xs">c/{community.slug}</p>
                {community.description && (
                  <p className="text-muted-foreground text-sm">{community.description}</p>
                )}
              </section>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-muted-foreground flex items-center gap-3 text-sm">
                <span>멤버 {community.memberCount.toLocaleString()}</span>
                <span aria-hidden>•</span>
                <span>게시글 {community.postCount.toLocaleString()}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {isAuthenticated ? (
                  <>
                    {isMember ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => leaveMutation.mutate(slug)}
                        disabled={leaveMutation.isPending}
                      >
                        {leaveMutation.isPending ? "처리 중..." : "탈퇴"}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => joinMutation.mutate(slug)}
                        disabled={joinMutation.isPending}
                      >
                        {joinMutation.isPending ? "처리 중..." : "가입"}
                      </Button>
                    )}
                    {isMember && (
                      <Link to="/c/$slug/submit" params={{ slug }}>
                        <Button variant="outline" size="sm" className="gap-1.5">
                          <Plus className="size-4" />
                          글쓰기
                        </Button>
                      </Link>
                    )}
                  </>
                ) : (
                  <Link to="/sign-in">
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <LogIn className="size-4" />
                      로그인
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Posts */}
        <div className="space-y-3">
          {isLoadingPosts
            ? [...Array(3)].map((_, i) => (
                <div key={i} className="border-border rounded-lg border p-4">
                  <div className="flex gap-3">
                    <Skeleton className="h-16 w-8" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-48" />
                      <Skeleton className="h-5 w-3/4" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-2/3" />
                      <div className="flex gap-3 pt-1">
                        <Skeleton className="h-7 w-20" />
                        <Skeleton className="h-7 w-16" />
                        <Skeleton className="h-7 w-16" />
                      </div>
                    </div>
                  </div>
                </div>
              ))
            : posts.map((post: any) => (
                <PostCard key={post.id} post={post as any} communitySlug={slug} />
              ))}
        </div>

        {postsData && postsData.pages[0]?.items.length === 0 && (
          <div className="border-border flex flex-col items-center rounded-lg border py-12">
            <div className="bg-muted mb-3 rounded-full p-3">
              <FileText className="text-muted-foreground size-6" />
            </div>
            <p className="text-muted-foreground mb-4">아직 게시글이 없습니다</p>
            {isMember && (
              <Link to="/c/$slug/submit" params={{ slug }}>
                <Button size="sm" className="gap-1.5">
                  <Plus className="size-4" />첫 게시글 작성하기
                </Button>
              </Link>
            )}
          </div>
        )}

        {hasNextPage && (
          <div className="flex justify-center py-4">
            <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
              {isFetchingNextPage ? "불러오는 중..." : "더 보기"}
            </Button>
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div className="space-y-4">
        {/* About */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Info className="size-4" />
              커뮤니티 정보
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold">{community.memberCount.toLocaleString()}</div>
                <div className="text-muted-foreground mt-0.5 text-xs">멤버</div>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold">{community.postCount.toLocaleString()}</div>
                <div className="text-muted-foreground mt-0.5 text-xs">게시글</div>
              </div>
            </div>

            <Separator />

            <div className="space-y-2 text-sm">
              <div className="text-muted-foreground flex items-center gap-2">
                <Calendar className="size-4 shrink-0" />
                <span>개설 {createdAt}</span>
              </div>
              <div className="text-muted-foreground flex items-center gap-2">
                <Globe className="size-4 shrink-0" />
                <span>{community.type === "public" ? "공개 커뮤니티" : "비공개 커뮤니티"}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Rules */}
        {community.rules && community.rules.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">커뮤니티 규칙</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              {community.rules.map(
                (rule: { title: string; description?: string }, index: number) => (
                  <div key={index}>
                    {index > 0 && <Separator className="my-2.5" />}
                    <div className="text-sm">
                      <div className="font-medium">
                        {index + 1}. {rule.title}
                      </div>
                      {rule.description && (
                        <div className="text-muted-foreground mt-0.5">{rule.description}</div>
                      )}
                    </div>
                  </div>
                ),
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

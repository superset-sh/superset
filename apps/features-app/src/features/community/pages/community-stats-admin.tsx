import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { TrendingUp, Award } from "lucide-react";

export function CommunityStatsAdmin() {
  // TODO: Implement actual data fetching
  const stats = {
    totalCommunities: 47,
    totalMembers: 125340,
    totalPosts: 8932,
    totalComments: 45231,
    totalVotes: 234521,
    totalKarma: 1234567,
  };

  const topCommunities = [
    { slug: "programming", members: 15420, posts: 3245, growth: "+12%" },
    { slug: "gaming", members: 8932, posts: 1876, growth: "+8%" },
    { slug: "music", members: 6543, posts: 987, growth: "+5%" },
  ];

  const topUsers = [
    { username: "john_doe", karma: 45230, posts: 123, comments: 567 },
    { username: "jane_smith", karma: 38920, posts: 89, comments: 432 },
    { username: "bob_wilson", karma: 32145, posts: 156, comments: 298 },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">통계</h1>
        <p className="text-sm text-muted-foreground">커뮤니티 전체 통계 및 인사이트</p>
      </div>

      <Separator />

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: "커뮤니티", value: stats.totalCommunities },
          { label: "전체 멤버", value: stats.totalMembers.toLocaleString() },
          { label: "게시글", value: stats.totalPosts.toLocaleString() },
          { label: "댓글", value: stats.totalComments.toLocaleString() },
          { label: "투표", value: stats.totalVotes.toLocaleString() },
          { label: "총 Karma", value: `${(stats.totalKarma / 1000).toFixed(0)}K` },
        ].map((stat) => (
          <div key={stat.label} className="p-4 rounded-lg border">
            <div className="text-2xl font-bold tabular-nums">{stat.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Top Communities */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <TrendingUp className="size-3.5" />
            인기 커뮤니티
          </h2>
          <div className="space-y-1">
            {topCommunities.map((community, index) => (
              <div key={community.slug} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/30 transition-colors">
                <span className="text-xs font-bold text-muted-foreground w-4 text-right tabular-nums">{index + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">c/{community.slug}</div>
                  <div className="text-xs text-muted-foreground">
                    {community.members.toLocaleString()} 멤버 · {community.posts.toLocaleString()} 게시글
                  </div>
                </div>
                <span className="text-xs font-medium text-green-600">{community.growth}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Users */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Award className="size-3.5" />
            상위 사용자
          </h2>
          <div className="space-y-1">
            {topUsers.map((user, index) => (
              <div key={user.username} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/30 transition-colors">
                <span className="text-xs font-bold text-muted-foreground w-4 text-right tabular-nums">{index + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">u/{user.username}</div>
                  <div className="text-xs text-muted-foreground">
                    {user.posts} 게시글 · {user.comments} 댓글
                  </div>
                </div>
                <span className="text-xs font-medium tabular-nums">{user.karma.toLocaleString()} karma</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { Avatar, AvatarFallback } from "@superbuilder/feature-ui/shadcn/avatar";
import { Shield, Ban } from "lucide-react";

export function CommunityUsersAdmin() {
  const [search, setSearch] = useState("");

  // TODO: Implement actual data fetching
  const users = [
    {
      id: "1",
      username: "john_doe",
      email: "john@example.com",
      totalKarma: 45230,
      postKarma: 28930,
      commentKarma: 16300,
      communitiesOwned: 2,
      communitiesModerating: 5,
      isBanned: false,
      createdAt: new Date("2024-01-15"),
    },
    {
      id: "2",
      username: "jane_smith",
      email: "jane@example.com",
      totalKarma: 38920,
      postKarma: 20100,
      commentKarma: 18820,
      communitiesOwned: 1,
      communitiesModerating: 3,
      isBanned: false,
      createdAt: new Date("2024-02-10"),
    },
  ];

  const statCounts = { total: 1234, moderators: 89, owners: 23, banned: 12 };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">사용자 관리</h1>
        <p className="text-sm text-muted-foreground">커뮤니티 사용자 및 권한 관리</p>
      </div>

      <Separator />

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-4 rounded-lg border">
          <div className="text-2xl font-bold tabular-nums">{statCounts.total.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-1">전체 사용자</div>
        </div>
        <div className="p-4 rounded-lg border">
          <div className="text-2xl font-bold tabular-nums">{statCounts.moderators}</div>
          <div className="text-xs text-muted-foreground mt-1">모더레이터</div>
        </div>
        <div className="p-4 rounded-lg border">
          <div className="text-2xl font-bold tabular-nums">{statCounts.owners}</div>
          <div className="text-xs text-muted-foreground mt-1">소유자</div>
        </div>
        <div className="p-4 rounded-lg border">
          <div className="text-2xl font-bold tabular-nums">{statCounts.banned}</div>
          <div className="text-xs text-muted-foreground mt-1">차단됨</div>
        </div>
      </div>

      {/* Search */}
      <Input
        placeholder="사용자 검색..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Users List */}
      <div className="space-y-1">
        {users.map((user) => (
          <div
            key={user.id}
            className="flex items-center gap-4 px-3 py-3 rounded-lg hover:bg-muted/30 transition-colors"
          >
            <Avatar size="sm">
              <AvatarFallback>{user.username.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">u/{user.username}</span>
                {user.communitiesOwned > 0 && (
                  <Badge variant="outline" className="text-[10px] gap-0.5 py-0 px-1.5">
                    <Shield className="size-2.5" />
                    소유자
                  </Badge>
                )}
                {user.isBanned && (
                  <Badge variant="outline" className="text-[10px] gap-0.5 py-0 px-1.5 text-red-600 border-red-200 dark:border-red-800">
                    <Ban className="size-2.5" />
                    차단됨
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {user.totalKarma.toLocaleString()} karma · {user.communitiesOwned} 소유 · {user.communitiesModerating} 모더레이팅
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <Button size="sm" variant="ghost">상세</Button>
              {!user.isBanned && (
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">차단</Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

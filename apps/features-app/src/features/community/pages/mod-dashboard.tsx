import { AlertTriangle, FileText, Users, Settings, Shield, ArrowRight, Clock } from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Link } from "@tanstack/react-router";

interface ModDashboardProps {
  communitySlug: string;
}

export function ModDashboard({ communitySlug }: ModDashboardProps) {
  // TODO: Implement actual data fetching
  const stats = {
    pendingReports: 5,
    modQueue: 12,
    totalMembers: 8932,
    bannedUsers: 23,
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Shield className="size-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">모더레이터</h1>
          </div>
          <p className="text-sm text-muted-foreground">c/{communitySlug}</p>
        </div>
        <Link to="/c/$slug" params={{ slug: communitySlug }}>
          <Button variant="ghost" size="sm">커뮤니티로</Button>
        </Link>
      </div>

      <Separator />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg border">
          <div className="text-2xl font-bold tabular-nums">{stats.pendingReports}</div>
          <div className="text-xs text-muted-foreground mt-1">대기 중인 신고</div>
        </div>
        <div className="p-4 rounded-lg border">
          <div className="text-2xl font-bold tabular-nums">{stats.modQueue}</div>
          <div className="text-xs text-muted-foreground mt-1">검토 대기열</div>
        </div>
        <div className="p-4 rounded-lg border">
          <div className="text-2xl font-bold tabular-nums">{stats.totalMembers.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-1">전체 멤버</div>
        </div>
        <div className="p-4 rounded-lg border">
          <div className="text-2xl font-bold tabular-nums">{stats.bannedUsers}</div>
          <div className="text-xs text-muted-foreground mt-1">차단된 사용자</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">관리 도구</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <Link to="/c/$slug/mod/queue" params={{ slug: communitySlug }}>
            <div className="flex items-center gap-3 p-4 rounded-lg border hover:bg-muted/50 transition-colors group">
              <FileText className="size-4 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">검토 대기열</div>
                <div className="text-xs text-muted-foreground">검토 대기 중인 콘텐츠</div>
              </div>
              {stats.modQueue > 0 && (
                <Badge variant="secondary" className="text-xs">{stats.modQueue}</Badge>
              )}
              <ArrowRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </Link>

          <Link to="/c/$slug/mod/reports" params={{ slug: communitySlug }}>
            <div className="flex items-center gap-3 p-4 rounded-lg border hover:bg-muted/50 transition-colors group">
              <AlertTriangle className="size-4 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">신고 관리</div>
                <div className="text-xs text-muted-foreground">사용자 신고 처리</div>
              </div>
              {stats.pendingReports > 0 && (
                <Badge variant="secondary" className="text-xs">{stats.pendingReports}</Badge>
              )}
              <ArrowRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </Link>

          <Link to="/c/$slug/mod/logs" params={{ slug: communitySlug }}>
            <div className="flex items-center gap-3 p-4 rounded-lg border hover:bg-muted/50 transition-colors group">
              <Clock className="size-4 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">활동 기록</div>
                <div className="text-xs text-muted-foreground">모더레이션 활동 기록</div>
              </div>
              <ArrowRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </Link>

          <div className="flex items-center gap-3 p-4 rounded-lg border hover:bg-muted/50 transition-colors group cursor-pointer">
            <Users className="size-4 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">사용자 관리</div>
              <div className="text-xs text-muted-foreground">차단 및 권한 관리</div>
            </div>
            <ArrowRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>

          <div className="flex items-center gap-3 p-4 rounded-lg border hover:bg-muted/50 transition-colors group cursor-pointer">
            <Settings className="size-4 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">커뮤니티 설정</div>
              <div className="text-xs text-muted-foreground">규칙 및 설정 관리</div>
            </div>
            <ArrowRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">최근 활동</h2>
        <div className="space-y-1">
          {[
            { label: "게시글 삭제됨", detail: "스팸 게시글이 삭제되었습니다", time: "5분 전", color: "text-red-500" },
            { label: "사용자 차단", detail: "u/spammer123이 차단되었습니다", time: "1시간 전", color: "text-yellow-500" },
            { label: "신고 해결됨", detail: "3건의 신고가 해결되었습니다", time: "3시간 전", color: "text-green-500" },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors">
              <div className={`size-1.5 rounded-full ${item.color} bg-current shrink-0`} />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium">{item.label}</span>
                <span className="text-sm text-muted-foreground ml-2">{item.detail}</span>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">{item.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

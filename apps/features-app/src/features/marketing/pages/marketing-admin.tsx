/**
 * MarketingAdmin - 관리자 마케팅 대시보드
 */
import { useAdminStats, useAdminCampaigns, useAdminContents } from "../hooks";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@superbuilder/feature-ui/shadcn/card";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@superbuilder/feature-ui/shadcn/table";
import { Megaphone, FileText, Send, Users } from "lucide-react";

export function MarketingAdmin() {
  const { data: stats, isLoading: statsLoading } = useAdminStats();
  const { data: campaignsData, isLoading: campaignsLoading } = useAdminCampaigns();
  const { data: contentsData, isLoading: contentsLoading } = useAdminContents();

  return (
    <div className="space-y-6">
      {/* 통계 카드 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="전체 캠페인"
          value={stats?.totalCampaigns}
          icon={<Megaphone className="h-4 w-4 text-muted-foreground" />}
          loading={statsLoading}
        />
        <StatCard
          title="전체 콘텐츠"
          value={stats?.totalContents}
          icon={<FileText className="h-4 w-4 text-muted-foreground" />}
          loading={statsLoading}
        />
        <StatCard
          title="전체 발행"
          value={stats?.totalPublications}
          icon={<Send className="h-4 w-4 text-muted-foreground" />}
          loading={statsLoading}
        />
        <StatCard
          title="연결된 계정"
          value={stats?.totalAccounts}
          icon={<Users className="h-4 w-4 text-muted-foreground" />}
          loading={statsLoading}
        />
      </div>

      {/* 발행 상태별 통계 */}
      {stats?.publicationsByStatus && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">발행 상태</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {Object.entries(stats.publicationsByStatus).map(([status, count]) => (
                <div key={status} className="flex items-center gap-2">
                  <Badge variant={PUBLICATION_STATUS_VARIANT[status] ?? "secondary"}>
                    {PUBLICATION_STATUS_LABEL[status] ?? status}
                  </Badge>
                  <span className="text-sm font-medium">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 최근 캠페인 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">최근 캠페인</CardTitle>
        </CardHeader>
        <CardContent>
          {campaignsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>캠페인명</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>생성일</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(campaignsData?.data ?? []).slice(0, 5).map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell className="font-medium">{campaign.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{campaign.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(campaign.createdAt).toLocaleDateString("ko-KR")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 최근 콘텐츠 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">최근 콘텐츠</CardTitle>
        </CardHeader>
        <CardContent>
          {contentsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>제목</TableHead>
                  <TableHead>생성일</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(contentsData?.data ?? []).slice(0, 5).map((content) => (
                  <TableRow key={content.id}>
                    <TableCell className="font-medium">{content.title}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(content.createdAt).toLocaleDateString("ko-KR")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface StatCardProps {
  title: string;
  value: number | undefined;
  icon: React.ReactNode;
  loading: boolean;
}

function StatCard({ title, value, icon, loading }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <p className="text-2xl font-bold">{value ?? 0}</p>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const PUBLICATION_STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  published: "default",
  scheduled: "outline",
  publishing: "secondary",
  failed: "destructive",
};

const PUBLICATION_STATUS_LABEL: Record<string, string> = {
  published: "발행 완료",
  scheduled: "예약됨",
  publishing: "발행 중",
  failed: "실패",
  draft: "초안",
};

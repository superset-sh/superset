import { useTRPC } from "@superbuilder/features-client/trpc-client";
import { Card, CardContent, CardHeader, CardTitle } from "@superbuilder/feature-ui/shadcn/card";
import { useQuery } from "@tanstack/react-query";
import { Bell, Calendar, Mail } from "lucide-react";

interface NotificationStatsData {
  total: number;
  unread: number;
  today: number;
}

/**
 * 알림 통계 카드 (Admin)
 */
export function NotificationStats() {
  const trpc = useTRPC();
  const { data: rawData, isLoading } = useQuery({
    ...trpc.notification.admin.getStats.queryOptions(),
  });
  const data = rawData as NotificationStatsData | undefined;

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Loading...</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">-</div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">전체 알림</CardTitle>
          <Bell className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{data?.total.toLocaleString() ?? 0}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">읽지 않은 알림</CardTitle>
          <Mail className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{data?.unread.toLocaleString() ?? 0}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">오늘 발송</CardTitle>
          <Calendar className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{data?.today.toLocaleString() ?? 0}</div>
        </CardContent>
      </Card>
    </div>
  );
}

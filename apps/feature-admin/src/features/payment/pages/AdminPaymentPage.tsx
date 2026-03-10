import { Card, CardHeader, CardTitle, CardContent } from '@superbuilder/feature-ui/shadcn/card';
import { Button } from '@superbuilder/feature-ui/shadcn/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@superbuilder/feature-ui/shadcn/tabs';
import { Badge } from '@superbuilder/feature-ui/shadcn/badge';
import {
  useSyncProducts,
  useSubscriptionStats,
  useAdminSubscriptions,
  useAdminOrders,
  useRefundRequests,
} from '../hooks';
import { toast } from 'sonner';
import { Skeleton } from '@superbuilder/feature-ui/shadcn/skeleton';
import { PageHeader } from '@superbuilder/feature-ui/components/page-header';

export function AdminPaymentPage() {
  const { syncProducts, isLoading: isSyncing } = useSyncProducts();
  const { data: stats, isLoading: statsLoading } = useSubscriptionStats();
  const { data: subscriptions, isLoading: subsLoading } = useAdminSubscriptions({
    page: 1,
    limit: 10,
    status: 'all',
  });
  const { data: orders, isLoading: ordersLoading } = useAdminOrders({
    page: 1,
    limit: 10,
    status: 'all',
  });
  const { data: refundRequests, isLoading: refundsLoading } = useRefundRequests();

  const handleSync = async () => {
    try {
      await syncProducts();
      toast.success('Lemon Squeezy에서 상품이 동기화되었습니다.');
    } catch (error: any) {
      toast.error(error.message || '상품 동기화에 실패했습니다.');
    }
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="결제 대시보드"
        description="결제, 구독, 주문을 관리하는 대시보드입니다"
        actions={
          <Button onClick={handleSync} disabled={isSyncing}>
            {isSyncing ? '동기화 중...' : '상품 동기화'}
          </Button>
        }
      />

      {/* KPI 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsLoading ? (
          <>
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-20" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : (
          stats && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">전체 구독</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.total}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">활성 구독</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{stats.active}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">MRR (월간 반복 수익)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">${stats.mrr.toLocaleString()}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">ARR (연간 반복 수익)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">${stats.arr.toLocaleString()}</div>
                </CardContent>
              </Card>
            </>
          )
        )}
      </div>

      {/* 탭 */}
      <Tabs defaultValue="subscriptions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="subscriptions">구독</TabsTrigger>
          <TabsTrigger value="orders">주문</TabsTrigger>
          <TabsTrigger value="refunds">
            환불 요청
            {refundRequests && refundRequests.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {refundRequests.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="subscriptions">
          <Card>
            <CardHeader>
              <CardTitle>구독</CardTitle>
            </CardHeader>
            <CardContent>
              {subsLoading ? (
                <Skeleton className="h-64" />
              ) : subscriptions?.data && subscriptions.data.length > 0 ? (
                <div className="space-y-2">
                  {subscriptions.data.map((sub) => (
                    <div
                      key={sub.id}
                      className="flex items-center justify-between p-4 border rounded"
                    >
                      <div>
                        <p className="font-medium">{sub.customerEmail}</p>
                        <p className="text-sm text-muted-foreground">
                          ${sub.price.toLocaleString()} / {sub.interval}
                        </p>
                      </div>
                      <Badge>{sub.statusFormatted}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground py-8 text-center">구독 내역이 없습니다.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders">
          <Card>
            <CardHeader>
              <CardTitle>주문</CardTitle>
            </CardHeader>
            <CardContent>
              {ordersLoading ? (
                <Skeleton className="h-64" />
              ) : orders?.data && orders.data.length > 0 ? (
                <div className="space-y-2">
                  {orders.data.map((order) => (
                    <div
                      key={order.id}
                      className="flex items-center justify-between p-4 border rounded"
                    >
                      <div>
                        <p className="font-medium">{order.customerEmail}</p>
                        <p className="text-sm text-muted-foreground">
                          주문 #{order.orderNumber}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">${order.total.toLocaleString()}</p>
                        <Badge>{order.statusFormatted}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground py-8 text-center">주문 내역이 없습니다.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="refunds">
          <Card>
            <CardHeader>
              <CardTitle>환불 요청</CardTitle>
            </CardHeader>
            <CardContent>
              {refundsLoading ? (
                <Skeleton className="h-64" />
              ) : refundRequests && refundRequests.length > 0 ? (
                <div className="space-y-2">
                  {refundRequests.map((request) => (
                    <div key={request.id} className="p-4 border rounded">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="destructive">{request.eventName}</Badge>
                        <span className="text-sm text-muted-foreground">
                          {new Date(request.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <pre className="text-xs bg-muted p-2 rounded overflow-auto">
                        {JSON.stringify(request.payload, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground py-8 text-center">
                  대기 중인 환불 요청이 없습니다.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

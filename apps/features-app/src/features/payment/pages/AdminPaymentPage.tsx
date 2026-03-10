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
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@superbuilder/feature-ui/shadcn/skeleton';

export function AdminPaymentPage() {
  const { toast } = useToast();
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
      toast({
        title: 'Products synced',
        description: 'Products have been synchronized from Lemon Squeezy.',
      });
    } catch (error: any) {
      toast({
        title: 'Sync failed',
        description: error.message || 'Failed to sync products',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payment Management</h1>
          <p className="text-muted-foreground mt-2">
            Admin dashboard for managing payments, subscriptions, and orders.
          </p>
        </div>
        <Button onClick={handleSync} disabled={isSyncing}>
          {isSyncing ? 'Syncing...' : 'Sync Products'}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statsLoading ? (
          <>
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </>
        ) : (
          stats && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Total Subscriptions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.total}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Active</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{stats.active}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">MRR</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">${stats.mrr.toLocaleString()}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">ARR</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">${stats.arr.toLocaleString()}</div>
                </CardContent>
              </Card>
            </>
          )
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="subscriptions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="refunds">
            Refund Requests
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
              <CardTitle>Subscriptions</CardTitle>
            </CardHeader>
            <CardContent>
              {subsLoading ? (
                <Skeleton className="h-64" />
              ) : (
                <div className="space-y-2">
                  {subscriptions?.data.map((sub) => (
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
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders">
          <Card>
            <CardHeader>
              <CardTitle>Orders</CardTitle>
            </CardHeader>
            <CardContent>
              {ordersLoading ? (
                <Skeleton className="h-64" />
              ) : (
                <div className="space-y-2">
                  {orders?.data.map((order) => (
                    <div
                      key={order.id}
                      className="flex items-center justify-between p-4 border rounded"
                    >
                      <div>
                        <p className="font-medium">{order.customerEmail}</p>
                        <p className="text-sm text-muted-foreground">
                          Order #{order.orderNumber}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">${order.total.toLocaleString()}</p>
                        <Badge>{order.statusFormatted}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="refunds">
          <Card>
            <CardHeader>
              <CardTitle>Refund Requests</CardTitle>
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
                <p className="text-muted-foreground">No pending refund requests.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

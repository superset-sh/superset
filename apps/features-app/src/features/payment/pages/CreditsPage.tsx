import { useState } from 'react';
import { Card, CardContent } from '@superbuilder/feature-ui/shadcn/card';
import { Badge } from '@superbuilder/feature-ui/shadcn/badge';
import { Button } from '@superbuilder/feature-ui/shadcn/button';
import { Switch } from '@superbuilder/feature-ui/shadcn/switch';
import { Skeleton } from '@superbuilder/feature-ui/shadcn/skeleton';
import { useMyBalance, useMyTransactions, useUpdateAutoRecharge } from '../hooks/use-credits';
import { useToast } from '@/hooks/use-toast';

export function CreditsPage() {
  const { data: balance, isLoading: balanceLoading } = useMyBalance();
  const [page, setPage] = useState(1);
  const { data: transactions, isLoading: txLoading } = useMyTransactions(page, 20);
  const { updateAutoRecharge, isPending: isAutoRechargeUpdating } = useUpdateAutoRecharge();
  const { toast } = useToast();

  const handleToggleAutoRecharge = async () => {
    if (!balance) return;
    try {
      await updateAutoRecharge({
        autoRecharge: !balance.autoRecharge,
      });
      toast({
        title: '자동충전 설정 변경',
        description: `자동충전이 ${!balance.autoRecharge ? '활성화' : '비활성화'}되었습니다.`,
      });
    } catch {
      toast({
        title: '오류',
        description: '자동충전 설정 변경에 실패했습니다.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">AI 크레딧</h1>
        <p className="text-muted-foreground mt-2">
          크레딧 잔액과 사용 내역을 확인하세요.
        </p>
      </div>

      <div className="space-y-8">
        {/* Balance Card */}
        <Card>
          <CardContent className="p-6">
            {balanceLoading ? (
              <Skeleton className="h-24" />
            ) : balance ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">현재 잔액</p>
                  <p className="text-4xl font-bold">{balance.balance.toLocaleString()}</p>
                  {balance.monthlyAllocation > 0 && (
                    <p className="text-sm text-muted-foreground mt-1">
                      월 배정: {balance.monthlyAllocation.toLocaleString()} 크레딧
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">자동충전</span>
                  <Switch
                    checked={balance.autoRecharge}
                    onCheckedChange={handleToggleAutoRecharge}
                    disabled={isAutoRechargeUpdating}
                  />
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Transaction History */}
        <section>
          <h2 className="text-xl font-semibold mb-4">사용 내역</h2>
          {txLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : transactions?.data.length ? (
            <div className="space-y-2">
              {transactions.data.map((tx: TransactionItem) => (
                <Card key={tx.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <TransactionTypeBadge type={tx.type} />
                        <div>
                          <p className="text-sm font-medium">
                            {tx.description || tx.type}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(tx.createdAt).toLocaleString('ko-KR')}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p
                          className={`font-medium ${tx.amount > 0 ? 'text-green-600' : 'text-foreground'}`}
                        >
                          {tx.amount > 0 ? '+' : ''}
                          {tx.amount.toLocaleString()}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          잔액: {tx.balanceAfter.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Pagination */}
              {transactions.totalPages > 1 && (
                <div className="flex justify-center gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    이전
                  </Button>
                  <span className="flex items-center text-sm text-muted-foreground">
                    {page} / {transactions.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setPage((p) => Math.min(transactions.totalPages, p + 1))
                    }
                    disabled={page >= transactions.totalPages}
                  >
                    다음
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="p-6">
                <p className="text-muted-foreground text-center">사용 내역이 없습니다.</p>
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface TransactionTypeBadgeProps {
  type: string;
}

function TransactionTypeBadge({ type }: TransactionTypeBadgeProps) {
  switch (type) {
    case 'allocation':
      return <Badge>배정</Badge>;
    case 'deduction':
      return <Badge variant="secondary">사용</Badge>;
    case 'purchase':
      return <Badge variant="outline">구매</Badge>;
    case 'refund':
      return <Badge variant="outline">환불</Badge>;
    case 'adjustment':
      return <Badge variant="outline">조정</Badge>;
    default:
      return <Badge variant="secondary">{type}</Badge>;
  }
}

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

interface TransactionItem {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string | null;
  createdAt: string;
}

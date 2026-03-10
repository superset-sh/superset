import { useState } from 'react';
import { PageHeader } from '@superbuilder/feature-ui/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@superbuilder/feature-ui/shadcn/card';
import { Button } from '@superbuilder/feature-ui/shadcn/button';
import { Badge } from '@superbuilder/feature-ui/shadcn/badge';
import { Input } from '@superbuilder/feature-ui/shadcn/input';
import { Label } from '@superbuilder/feature-ui/shadcn/label';
import { Textarea } from '@superbuilder/feature-ui/shadcn/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@superbuilder/feature-ui/shadcn/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@superbuilder/feature-ui/shadcn/table';
import { Skeleton } from '@superbuilder/feature-ui/shadcn/skeleton';
import { Search, Plus, Minus } from 'lucide-react';
import { toast } from 'sonner';
import {
  useUserCredits,
  useUserTransactions,
  useAdjustCredits,
} from '../hooks/use-credit-management';

export function CreditManagementPage() {
  // 사용자 검색
  const [userIdInput, setUserIdInput] = useState('');
  const [searchedUserId, setSearchedUserId] = useState('');

  // 조정 다이얼로그
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState(0);
  const [adjustReason, setAdjustReason] = useState('');

  // 페이지네이션
  const [page, setPage] = useState(1);
  const limit = 20;

  // 데이터 훅
  const { data: credits, isLoading: creditsLoading } = useUserCredits(searchedUserId);
  const { data: transactions, isLoading: txLoading } = useUserTransactions(
    searchedUserId,
    page,
    limit,
  );
  const adjustCredits = useAdjustCredits();

  const handleSearch = () => {
    const trimmed = userIdInput.trim();
    if (!trimmed) {
      toast.error('사용자 ID를 입력해주세요.');
      return;
    }
    setSearchedUserId(trimmed);
    setPage(1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleAdjust = () => {
    if (!searchedUserId) return;
    if (adjustAmount === 0) {
      toast.error('조정량을 입력해주세요.');
      return;
    }
    if (!adjustReason.trim()) {
      toast.error('조정 사유를 입력해주세요.');
      return;
    }

    adjustCredits.mutate(
      {
        userId: searchedUserId,
        amount: adjustAmount,
        reason: adjustReason.trim(),
      },
      {
        onSuccess: () => {
          toast.success(
            adjustAmount > 0
              ? `${adjustAmount.toLocaleString()} 크레딧을 추가했습니다.`
              : `${Math.abs(adjustAmount).toLocaleString()} 크레딧을 차감했습니다.`,
          );
          setIsAdjustOpen(false);
          setAdjustAmount(0);
          setAdjustReason('');
        },
        onError: (error) => {
          toast.error(error.message || '크레딧 조정에 실패했습니다.');
        },
      },
    );
  };

  return (
    <div className="container mx-auto py-8">
      <PageHeader
        title="크레딧 관리"
        description="사용자 크레딧 잔액을 조회하고 수동 조정합니다"
      />

      {/* 사용자 검색 */}
      <div className="mt-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="user-search" className="sr-only">
                  사용자 ID
                </Label>
                <Input
                  id="user-search"
                  value={userIdInput}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setUserIdInput(e.target.value)
                  }
                  onKeyDown={handleKeyDown}
                  placeholder="사용자 UUID를 입력하세요"
                />
              </div>
              <Button onClick={handleSearch}>
                <Search className="mr-2 size-4" />
                조회
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 검색 결과 */}
      {searchedUserId && (
        <div className="mt-6 space-y-6">
          {/* 크레딧 잔액 */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>크레딧 잔액</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAdjustOpen(true)}
              >
                수동 조정
              </Button>
            </CardHeader>
            <CardContent>
              {creditsLoading ? (
                <Skeleton className="h-20" />
              ) : credits ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">현재 잔액</p>
                    <p className="text-2xl font-bold">
                      {credits.balance.toLocaleString()}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">월간 할당량</p>
                    <p className="text-2xl font-bold text-muted-foreground">
                      {credits.monthlyAllocation.toLocaleString()}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">자동 충전</p>
                    <p className="text-base font-medium">
                      {credits.autoRecharge ? (
                        <Badge variant="default">활성</Badge>
                      ) : (
                        <Badge variant="secondary">비활성</Badge>
                      )}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">
                  크레딧 정보를 찾을 수 없습니다.
                </p>
              )}
            </CardContent>
          </Card>

          {/* 트랜잭션 내역 */}
          <Card>
            <CardHeader>
              <CardTitle>트랜잭션 내역</CardTitle>
            </CardHeader>
            <CardContent>
              {txLoading ? (
                <Skeleton className="h-64" />
              ) : transactions && transactions.data.length > 0 ? (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>유형</TableHead>
                        <TableHead>금액</TableHead>
                        <TableHead>설명</TableHead>
                        <TableHead>일시</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.data.map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell>
                            <Badge variant={tx.amount >= 0 ? 'default' : 'secondary'}>
                              {TX_TYPE_LABELS[tx.type] ?? tx.type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span
                              className={
                                tx.amount >= 0
                                  ? 'text-green-600 font-medium'
                                  : 'text-destructive font-medium'
                              }
                            >
                              {tx.amount >= 0 ? (
                                <Plus className="inline size-3 mr-1" />
                              ) : (
                                <Minus className="inline size-3 mr-1" />
                              )}
                              {Math.abs(tx.amount).toLocaleString()}
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {tx.description ?? '-'}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(tx.createdAt).toLocaleString('ko-KR')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* 페이지네이션 */}
                  {transactions.totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 pt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => p - 1)}
                      >
                        이전
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        {page} / {transactions.totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= transactions.totalPages}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        다음
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground py-8 text-center">
                  트랜잭션 내역이 없습니다.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* 크레딧 조정 다이얼로그 */}
      <Dialog open={isAdjustOpen} onOpenChange={setIsAdjustOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>크레딧 수동 조정</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="adjust-amount">
                조정량 (양수: 추가, 음수: 차감)
              </Label>
              <Input
                id="adjust-amount"
                type="number"
                value={adjustAmount}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setAdjustAmount(parseInt(e.target.value) || 0)
                }
                placeholder="예: 1000 또는 -500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adjust-reason">사유</Label>
              <Textarea
                id="adjust-reason"
                value={adjustReason}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setAdjustReason(e.target.value)
                }
                placeholder="크레딧 조정 사유를 입력하세요"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setIsAdjustOpen(false)}
              >
                취소
              </Button>
              <Button
                onClick={handleAdjust}
                disabled={adjustCredits.isPending}
              >
                {adjustCredits.isPending ? '처리 중...' : '조정 적용'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const TX_TYPE_LABELS: Record<string, string> = {
  grant: '지급',
  usage: '사용',
  refund: '환불',
  adjustment: '조정',
  monthly_grant: '월간 지급',
  purchase: '구매',
};

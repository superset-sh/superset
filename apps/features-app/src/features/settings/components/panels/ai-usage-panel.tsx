import { useState } from "react";
import { useAtom } from "jotai";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Switch } from "@superbuilder/feature-ui/shadcn/switch";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { useMyBalance, useMyTransactions } from "@/features/payment/hooks/use-credits";
import { showTokenUsageAtom } from "@/features/agent-desk/store/agent-settings.atoms";

interface Props {}

export function AiUsagePanel({}: Props) {
  const [showTokenUsage, setShowTokenUsage] = useAtom(showTokenUsageAtom);
  const { data: balance, isLoading: balanceLoading } = useMyBalance();
  const [page, setPage] = useState(1);
  const { data: transactions, isLoading: txLoading } = useMyTransactions(
    page,
    10,
  );

  return (
    <div className="flex flex-col gap-6">
      {/* AI 대화 설정 */}
      <section className="flex flex-col gap-3">
        <h3 className="text-base font-medium">대화 설정</h3>
        <div className="flex flex-col gap-4 rounded-lg bg-muted/30 p-4">
          <label className="flex items-center justify-between cursor-pointer">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">토큰 사용량 표시</span>
              <span className="text-xs text-muted-foreground">
                대화 중 각 응답의 토큰 사용량을 표시합니다
              </span>
            </div>
            <Switch
              checked={showTokenUsage}
              onCheckedChange={setShowTokenUsage}
            />
          </label>
        </div>
      </section>

      <Separator />

      {/* 크레딧 잔액 */}
      <section className="flex flex-col gap-3">
        <h3 className="text-base font-medium">크레딧 잔액</h3>

        {balanceLoading ? (
          <Skeleton className="h-24" />
        ) : balance ? (
          <div className="rounded-lg bg-muted/30 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold">
                  {balance.balance.toLocaleString()}
                </span>
                {balance.monthlyAllocation > 0 && (
                  <span className="text-sm text-muted-foreground">
                    / {balance.monthlyAllocation.toLocaleString()} 크레딧
                  </span>
                )}
              </div>
              {balance.autoRecharge && (
                <Badge variant="outline">자동충전</Badge>
              )}
            </div>

            {balance.monthlyAllocation > 0 && (
              <BalanceProgressBar
                balance={balance.balance}
                monthlyAllocation={balance.monthlyAllocation}
              />
            )}
          </div>
        ) : (
          <div className="rounded-lg bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground text-center">
              크레딧 정보를 불러올 수 없습니다.
            </p>
          </div>
        )}
      </section>

      {/* 최근 사용 내역 */}
      <section className="flex flex-col gap-3">
        <h3 className="text-base font-medium">최근 사용 내역</h3>

        {txLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : transactions?.data.length ? (
          <>
            {/* 테이블 헤더 */}
            <div className="grid grid-cols-[auto_1fr_auto] gap-4 px-4 py-2 text-sm font-medium text-muted-foreground">
              <span>유형</span>
              <span>설명</span>
              <span className="text-right">금액</span>
            </div>

            {/* 트랜잭션 목록 */}
            <div className="flex flex-col gap-1">
              {transactions.data.map((tx: TransactionItem) => (
                <div
                  key={tx.id}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-lg bg-muted/30 px-4 py-3"
                >
                  <TransactionTypeBadge type={tx.type} />
                  <div className="min-w-0">
                    <p className="text-sm truncate">
                      {tx.description || transactionTypeLabel(tx.type)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(tx.createdAt).toLocaleDateString("ko-KR", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-sm font-medium ${tx.amount > 0 ? "text-green-600" : "text-foreground"}`}
                    >
                      {tx.amount > 0 ? "+" : ""}
                      {tx.amount.toLocaleString()}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      잔액 {tx.balanceAfter.toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* 페이지네이션 */}
            {transactions.totalPages > 1 && (
              <div className="flex justify-center gap-2">
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
          </>
        ) : (
          <div className="rounded-lg bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground text-center">
              사용 내역이 없습니다.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface BalanceProgressBarProps {
  balance: number;
  monthlyAllocation: number;
}

function BalanceProgressBar({
  balance,
  monthlyAllocation,
}: BalanceProgressBarProps) {
  const usagePercent =
    monthlyAllocation > 0
      ? Math.round(((monthlyAllocation - balance) / monthlyAllocation) * 100)
      : 0;
  const clampedPercent = Math.max(0, Math.min(usagePercent, 100));

  return (
    <div className="flex flex-col gap-1">
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${clampedPercent}%` }}
        />
      </div>
      <p className="text-sm text-muted-foreground">{clampedPercent}% 사용됨</p>
    </div>
  );
}

interface TransactionTypeBadgeProps {
  type: string;
}

function TransactionTypeBadge({ type }: TransactionTypeBadgeProps) {
  switch (type) {
    case "allocation":
      return <Badge>배정</Badge>;
    case "deduction":
      return <Badge variant="secondary">사용</Badge>;
    case "purchase":
      return <Badge variant="outline">구매</Badge>;
    case "refund":
      return <Badge variant="outline">환불</Badge>;
    case "adjustment":
      return <Badge variant="outline">조정</Badge>;
    case "expiration":
      return <Badge variant="secondary">만료</Badge>;
    default:
      return <Badge variant="secondary">{type}</Badge>;
  }
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

function transactionTypeLabel(type: string): string {
  switch (type) {
    case "allocation":
      return "크레딧 배정";
    case "deduction":
      return "크레딧 사용";
    case "purchase":
      return "크레딧 구매";
    case "refund":
      return "크레딧 환불";
    case "adjustment":
      return "관리자 조정";
    case "expiration":
      return "크레딧 만료";
    default:
      return type;
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

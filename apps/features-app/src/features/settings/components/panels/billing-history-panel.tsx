import { useState } from "react";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { ExternalLink } from "lucide-react";
import { useMyOrders } from "@/features/payment/hooks/use-credits";

interface Props {}

export function BillingHistoryPanel({}: Props) {
  const [page, setPage] = useState(1);
  const { data: orders, isLoading } = useMyOrders(page, 15);

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-base font-medium">결제 내역</h3>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : orders?.data.length ? (
        <>
          {/* 테이블 헤더 */}
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-2 text-sm font-medium text-muted-foreground">
            <span>날짜</span>
            <span className="text-right">총계</span>
            <span className="text-center">상태</span>
            <span className="text-center">청구서</span>
          </div>

          {/* 주문 목록 */}
          <div className="flex flex-col gap-1">
            {orders.data.map((order: OrderItem) => (
              <div
                key={order.id}
                className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 rounded-lg bg-muted/30 px-4 py-3"
              >
                {/* 날짜 */}
                <div>
                  <p className="text-sm">
                    {new Date(order.createdAt).toLocaleDateString("ko-KR", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                  {order.orderNumber && (
                    <p className="text-sm text-muted-foreground">
                      #{order.orderNumber}
                    </p>
                  )}
                </div>

                {/* 총계 */}
                <p className="text-sm font-medium text-right">
                  {formatCurrency(order.total, order.currency)}
                </p>

                {/* 상태 */}
                <OrderStatusBadge
                  status={order.status}
                  statusFormatted={order.statusFormatted}
                  refunded={order.refunded}
                />

                {/* 청구서 */}
                <InvoiceButton urls={order.urls} />
              </div>
            ))}
          </div>

          {/* 페이지네이션 */}
          {orders.totalPages > 1 && (
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
                {page} / {orders.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setPage((p) => Math.min(orders.totalPages, p + 1))
                }
                disabled={page >= orders.totalPages}
              >
                다음
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-lg bg-muted/30 p-4">
          <p className="text-sm text-muted-foreground text-center">
            결제 내역이 없습니다.
          </p>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface OrderStatusBadgeProps {
  status: string;
  statusFormatted: string | null;
  refunded: boolean;
}

function OrderStatusBadge({ status, statusFormatted, refunded }: OrderStatusBadgeProps) {
  if (refunded) {
    return <Badge variant="secondary">환불됨</Badge>;
  }

  switch (status) {
    case "paid":
      return <Badge>결제 완료</Badge>;
    case "pending":
      return <Badge variant="outline">대기 중</Badge>;
    case "refunded":
      return <Badge variant="secondary">환불됨</Badge>;
    default:
      return <Badge variant="outline">{statusFormatted ?? status}</Badge>;
  }
}

interface InvoiceButtonProps {
  urls: unknown;
}

function InvoiceButton({ urls }: InvoiceButtonProps) {
  const urlMap = urls as Record<string, string> | null;
  const receiptUrl = urlMap?.receipt;

  if (!receiptUrl) {
    return (
      <span className="text-sm text-muted-foreground text-center">-</span>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => window.open(receiptUrl, "_blank")}
    >
      <ExternalLink className="size-4" />
    </Button>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

function formatCurrency(amount: number, currency: string): string {
  if (currency === "USD") {
    return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  }
  if (currency === "KRW") {
    return `₩${amount.toLocaleString()}`;
  }
  return `${amount.toLocaleString()} ${currency}`;
}

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

interface OrderItem {
  id: string;
  orderNumber: number;
  status: string;
  statusFormatted: string | null;
  total: number;
  currency: string;
  refunded: boolean;
  urls?: unknown;
  createdAt: string;
}

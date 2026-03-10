import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { ExternalLink } from "lucide-react";
import { useMySubscription } from "@/features/payment/hooks/use-subscription";
import { useMyBalance, useMyOrders } from "@/features/payment/hooks/use-credits";
import { useSettingsModal } from "../../hooks/use-settings-modal";

interface Props {}

export function PaymentPanel({}: Props) {
  const { data: subscription, isLoading: subLoading } = useMySubscription();
  const { data: balance, isLoading: balLoading } = useMyBalance();
  const { setOpen } = useSettingsModal();
  const [orderPage, setOrderPage] = useState(1);
  const { data: orders, isLoading: ordersLoading } = useMyOrders(orderPage, 10);

  return (
    <div className="flex flex-col gap-8">
      {/* 1. 내 플랜 */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-medium">내 플랜</h3>
          <Button
            variant="outline"
            size="sm"
            render={<Link to="/pricing" />}
            onClick={() => setOpen(false)}
          >
            플랜 변경
          </Button>
        </div>
        {subLoading || balLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
        ) : subscription ? (
          <SubscriptionInfo subscription={subscription} />
        ) : (
          <div className="rounded-lg bg-muted/30 p-4">
            <p className="text-sm font-medium">Free 플랜</p>
            <p className="text-sm text-muted-foreground mt-1">
              현재 무료 플랜을 사용 중입니다.
            </p>
          </div>
        )}

        {/* 크레딧 잔액 요약 */}
        {!balLoading && balance && (
          <div className="rounded-lg bg-muted/30 p-4">
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold">
                {balance.balance.toLocaleString()}
              </span>
              <span className="text-sm text-muted-foreground">
                {balance.monthlyAllocation > 0
                  ? `/ ${balance.monthlyAllocation.toLocaleString()} 크레딧`
                  : "크레딧"}
              </span>
              {balance.autoRecharge && (
                <Badge variant="outline" className="ml-auto">
                  자동충전
                </Badge>
              )}
            </div>
          </div>
        )}
      </section>

      <Separator />

      {/* 2. 결제 방법 */}
      <section className="flex flex-col gap-3">
        <h3 className="text-base font-medium">결제 방법</h3>
        <PaymentMethodContent subscription={subscription} isLoading={subLoading} />
      </section>

      <Separator />

      {/* 3. 결제 내역 */}
      <section className="flex flex-col gap-3">
        <h3 className="text-base font-medium">결제 내역</h3>
        <BillingHistoryContent
          orders={orders}
          isLoading={ordersLoading}
          page={orderPage}
          setPage={setOrderPage}
        />
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface SubscriptionInfoProps {
  subscription: {
    status: string;
    price: number;
    currency: string;
    interval: string;
    product?: { name?: string } | null;
    renewsAt?: string | Date | null;
    endsAt?: string | Date | null;
    urls?: unknown;
  };
}

function SubscriptionInfo({ subscription }: SubscriptionInfoProps) {
  return (
    <div className="rounded-lg bg-muted/30 p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">
          {subscription.product?.name ?? "구독"}
        </span>
        <StatusBadge status={subscription.status} />
      </div>

      {subscription.price > 0 && (
        <p className="text-sm text-muted-foreground">
          {formatSubscriptionPrice(subscription.price, subscription.currency)} /{" "}
          {subscription.interval === "month" ? "월" : "년"}
        </p>
      )}

      {subscription.renewsAt && (
        <p className="text-sm text-muted-foreground">
          다음 갱신일:{" "}
          {new Date(subscription.renewsAt).toLocaleDateString("ko-KR")}
        </p>
      )}

      {subscription.endsAt && (
        <p className="text-sm text-muted-foreground">
          만료일:{" "}
          {new Date(subscription.endsAt).toLocaleDateString("ko-KR")}
        </p>
      )}
    </div>
  );
}

interface StatusBadgeProps {
  status: string;
}

function StatusBadge({ status }: StatusBadgeProps) {
  switch (status) {
    case "active":
      return <Badge>활성</Badge>;
    case "on_trial":
      return <Badge>체험 중</Badge>;
    case "cancelled":
      return <Badge variant="secondary">취소됨</Badge>;
    case "expired":
      return <Badge variant="secondary">만료됨</Badge>;
    case "paused":
      return <Badge variant="secondary">일시정지</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

interface PaymentMethodContentProps {
  subscription: SubscriptionInfoProps["subscription"] | undefined | null;
  isLoading: boolean;
}

function PaymentMethodContent({
  subscription,
  isLoading,
}: PaymentMethodContentProps) {
  if (isLoading) {
    return <Skeleton className="h-16" />;
  }

  if (!subscription) {
    return (
      <div className="rounded-lg bg-muted/30 p-4">
        <p className="text-sm text-muted-foreground">
          활성 구독이 없습니다. 플랜을 구독하면 결제 방법을 관리할 수 있습니다.
        </p>
      </div>
    );
  }

  const urls = subscription.urls as Record<string, string> | null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        결제 수단 변경 및 관리는 고객 포털에서 진행할 수 있습니다.
      </p>
      <div className="flex gap-2">
        {urls?.update_payment_method && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(urls.update_payment_method, "_blank")}
          >
            <ExternalLink className="mr-2 size-4" />
            결제 수단 변경
          </Button>
        )}
        {urls?.customer_portal && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(urls.customer_portal, "_blank")}
          >
            <ExternalLink className="mr-2 size-4" />
            고객 포털
          </Button>
        )}
        {!urls?.update_payment_method && !urls?.customer_portal && (
          <p className="text-sm text-muted-foreground">
            결제 수단 관리 링크가 아직 준비되지 않았습니다.
          </p>
        )}
      </div>
    </div>
  );
}

interface BillingHistoryContentProps {
  orders: OrdersData | undefined;
  isLoading: boolean;
  page: number;
  setPage: (fn: (prev: number) => number) => void;
}

function BillingHistoryContent({
  orders,
  isLoading,
  page,
  setPage,
}: BillingHistoryContentProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    );
  }

  if (!orders?.data.length) {
    return (
      <div className="rounded-lg bg-muted/30 p-4">
        <p className="text-sm text-muted-foreground text-center">
          결제 내역이 없습니다.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        {orders.data.map((order: OrderItem) => (
          <div
            key={order.id}
            className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 rounded-lg bg-muted/30 px-4 py-3"
          >
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
            <p className="text-sm font-medium text-right">
              {formatCurrency(order.total, order.currency)}
            </p>
            <OrderStatusBadge
              status={order.status}
              statusFormatted={order.statusFormatted}
              refunded={order.refunded}
            />
            <InvoiceButton urls={order.urls} />
          </div>
        ))}
      </div>

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
  );
}

interface OrderStatusBadgeProps {
  status: string;
  statusFormatted: string | null;
  refunded: boolean;
}

function OrderStatusBadge({
  status,
  statusFormatted,
  refunded,
}: OrderStatusBadgeProps) {
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
  urls?: unknown;
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

function formatSubscriptionPrice(price: number, currency: string): string {
  return formatCurrency(price, currency);
}

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

interface OrdersData {
  data: OrderItem[];
  totalPages: number;
}

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

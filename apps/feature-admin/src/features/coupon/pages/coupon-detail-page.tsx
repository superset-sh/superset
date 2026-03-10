import { useQuery } from "@tanstack/react-query";
import { useParams, useNavigate } from "@tanstack/react-router";
import { useTRPC } from "@/lib/trpc";
import { PageHeader } from "@superbuilder/feature-ui/components/page-header";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@superbuilder/feature-ui/shadcn/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@superbuilder/feature-ui/shadcn/table";
import { ArrowLeft } from "lucide-react";

export function CouponDetailPage() {
  const { couponId } = useParams({ strict: false });
  const navigate = useNavigate();
  const trpc = useTRPC();

  const { data: coupon, isLoading } = useQuery(
    trpc.coupon.admin.getById.queryOptions(couponId!),
  );

  if (isLoading) return <div className="p-6">로딩 중...</div>;
  if (!coupon) return <div className="p-6">쿠폰을 찾을 수 없습니다</div>;

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title={coupon.name}
        description={`코드: ${coupon.code}`}
        actions={
          <Button
            variant="outline"
            onClick={() => navigate({ to: "/coupon" })}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            목록으로
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="할인율" value={`${coupon.discountPercent}%`} />
        <StatCard
          title="적용 기간"
          value={`${coupon.durationMonths}개월`}
        />
        <StatCard
          title="사용 현황"
          value={`${coupon.currentRedemptions}${coupon.maxRedemptions ? `/${coupon.maxRedemptions}` : ""}`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>쿠폰 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">상태</dt>
              <dd className="mt-1">
                <Badge
                  variant={coupon.isActive ? "default" : "secondary"}
                >
                  {coupon.isActive ? "활성" : "비활성"}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">설명</dt>
              <dd className="mt-1">{coupon.description ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">유효 시작일</dt>
              <dd className="mt-1">
                {new Date(coupon.startsAt).toLocaleDateString("ko-KR")}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">만료일</dt>
              <dd className="mt-1">
                {coupon.expiresAt
                  ? new Date(coupon.expiresAt).toLocaleDateString("ko-KR")
                  : "무기한"}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>사용 기록</CardTitle>
        </CardHeader>
        <CardContent>
          {coupon.redemptions && coupon.redemptions.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>사용자</TableHead>
                  <TableHead>적용일</TableHead>
                  <TableHead>만료일</TableHead>
                  <TableHead>상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coupon.redemptions.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">
                      {r.userId}
                    </TableCell>
                    <TableCell>
                      {new Date(r.appliedAt).toLocaleDateString("ko-KR")}
                    </TableCell>
                    <TableCell>
                      {new Date(r.expiresAt).toLocaleDateString("ko-KR")}
                    </TableCell>
                    <TableCell>
                      <RedemptionStatusBadge status={r.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              아직 사용 기록이 없습니다.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* Components */

interface StatCardProps {
  title: string;
  value: string;
}

function StatCard({ title, value }: StatCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-2xl font-bold">{value}</CardContent>
    </Card>
  );
}

const REDEMPTION_STATUS_MAP: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" }
> = {
  active: { label: "활성", variant: "default" },
  expired: { label: "만료", variant: "secondary" },
  cancelled: { label: "취소", variant: "destructive" },
};

interface RedemptionStatusBadgeProps {
  status: string;
}

function RedemptionStatusBadge({ status }: RedemptionStatusBadgeProps) {
  const config = REDEMPTION_STATUS_MAP[status] ?? {
    label: status,
    variant: "secondary" as const,
  };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

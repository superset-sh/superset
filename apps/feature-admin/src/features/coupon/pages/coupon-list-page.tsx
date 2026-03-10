import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTRPC } from "@/lib/trpc";
import { PageHeader } from "@superbuilder/feature-ui/components/page-header";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@superbuilder/feature-ui/shadcn/table";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Plus } from "lucide-react";
import { CreateCouponDialog } from "../components/create-coupon-dialog";

export function CouponListPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery(
    trpc.coupon.admin.list.queryOptions({ page, limit: 20 }),
  );

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="쿠폰 관리"
        description="할인 쿠폰을 생성하고 관리합니다"
        actions={
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            쿠폰 생성
          </Button>
        }
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>코드</TableHead>
            <TableHead>이름</TableHead>
            <TableHead>할인율</TableHead>
            <TableHead>기간</TableHead>
            <TableHead>사용</TableHead>
            <TableHead>상태</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center">
                로딩 중...
              </TableCell>
            </TableRow>
          ) : (
            data?.data.map((coupon) => (
              <TableRow
                key={coupon.id}
                className="cursor-pointer"
                onClick={() =>
                  navigate({
                    to: "/coupon/$couponId",
                    params: { couponId: coupon.id },
                  })
                }
              >
                <TableCell className="font-mono">{coupon.code}</TableCell>
                <TableCell>{coupon.name}</TableCell>
                <TableCell>{coupon.discountPercent}%</TableCell>
                <TableCell>{coupon.durationMonths}개월</TableCell>
                <TableCell>
                  {coupon.currentRedemptions}
                  {coupon.maxRedemptions
                    ? `/${coupon.maxRedemptions}`
                    : ""}
                </TableCell>
                <TableCell>
                  <Badge variant={coupon.isActive ? "default" : "secondary"}>
                    {coupon.isActive ? "활성" : "비활성"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {data && data.totalPages > 1 ? (
        <PaginationBar
          page={page}
          totalPages={data.totalPages}
          onPageChange={setPage}
        />
      ) : null}

      <CreateCouponDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
    </div>
  );
}

/* Components */

interface PaginationBarProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

function PaginationBar({ page, totalPages, onPageChange }: PaginationBarProps) {
  return (
    <div className="flex items-center justify-center gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        이전
      </Button>
      <span className="text-sm text-muted-foreground">
        {page} / {totalPages}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        다음
      </Button>
    </div>
  );
}

/**
 * Student List - 수강생 목록
 */
import { useState } from "react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@superbuilder/feature-ui/shadcn/table";
import { Avatar, AvatarFallback, AvatarImage } from "@superbuilder/feature-ui/shadcn/avatar";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { useStudentList } from "../hooks";

interface Props {
  courseId: string;
}

export function StudentList({ courseId }: Props) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useStudentList({ courseId, page, limit: 20 });

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">로딩 중...</div>;
  }

  if (!data?.items?.length) {
    return (
      <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
        수강생이 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">총 {data.total}명</p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>수강생</TableHead>
            <TableHead>이메일</TableHead>
            <TableHead>진행률</TableHead>
            <TableHead>수강 시작</TableHead>
            <TableHead>완료일</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.items.map((enrollment) => (
            <TableRow key={enrollment.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar className="size-8">
                    <AvatarImage src={enrollment.profile?.avatar ?? undefined} />
                    <AvatarFallback>
                      {enrollment.profile?.name?.charAt(0) ?? "?"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium">{enrollment.profile?.name ?? "알 수 없음"}</span>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {enrollment.profile?.email ?? "-"}
              </TableCell>
              <TableCell>
                <ProgressBadge percent={enrollment.progressPercent ?? 0} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {enrollment.createdAt
                  ? new Date(enrollment.createdAt).toLocaleDateString("ko-KR")
                  : "-"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {enrollment.completedAt
                  ? new Date(enrollment.completedAt).toLocaleDateString("ko-KR")
                  : "-"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            이전
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {data.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= data.totalPages}
            onClick={() => setPage(page + 1)}
          >
            다음
          </Button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

function ProgressBadge({ percent }: { percent: number }) {
  if (percent >= 100) {
    return <Badge variant="default">완료</Badge>;
  }
  if (percent > 0) {
    return <Badge variant="secondary">{Math.round(percent)}%</Badge>;
  }
  return <Badge variant="outline">미시작</Badge>;
}

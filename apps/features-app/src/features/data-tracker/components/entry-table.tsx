/**
 * EntryTable - 데이터 엔트리 테이블
 *
 * 트래커 컬럼 정의에 따라 동적으로 컬럼을 렌더링하고 페이지네이션을 지원합니다.
 */
import { useState } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@superbuilder/feature-ui/shadcn/table";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@superbuilder/feature-ui/shadcn/dropdown-menu";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { ChevronLeft, ChevronRight, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useDeleteEntry } from "../hooks";

interface ColumnInfo {
  id: string;
  key: string;
  label: string;
  dataType: "text" | "number";
  isRequired: boolean;
}

interface Props {
  columns: ColumnInfo[];
  entries: {
    id: string;
    date: Date | string;
    data: Record<string, string | number>;
    source: string;
    createdBy?: { name: string } | null;
  }[];
  total: number;
  page: number;
  totalPages: number;
  isLoading: boolean;
  onPageChange: (page: number) => void;
  onEditEntry: (entry: Props["entries"][number]) => void;
}

export function EntryTable({
  columns,
  entries,
  total,
  page,
  totalPages,
  isLoading,
  onPageChange,
  onEditEntry,
}: Props) {
  const deleteEntry = useDeleteEntry();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (entryId: string) => {
    setDeletingId(entryId);
    try {
      await deleteEntry.mutateAsync({ entryId });
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading) {
    return <EntryTableSkeleton columnCount={columns.length} />;
  }

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">데이터가 없습니다</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>날짜</TableHead>
            {columns.map((col) => (
              <TableHead key={col.id}>{col.label}</TableHead>
            ))}
            <TableHead>작성자</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell>
                {format(
                  typeof entry.date === "string"
                    ? new Date(entry.date)
                    : entry.date,
                  "yyyy-MM-dd",
                  { locale: ko },
                )}
              </TableCell>
              {columns.map((col) => (
                <TableCell key={col.id}>
                  {entry.data[col.key] != null
                    ? String(entry.data[col.key])
                    : "-"}
                </TableCell>
              ))}
              <TableCell className="text-muted-foreground">
                {entry.createdBy?.name ?? "-"}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button variant="ghost" size="icon-sm" />
                    }
                  >
                    <MoreHorizontal className="size-4" />
                    <span className="sr-only">작업</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEditEntry(entry)}>
                      <Pencil className="mr-2 size-4" />
                      수정
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => handleDelete(entry.id)}
                      disabled={deletingId === entry.id}
                    >
                      <Trash2 className="mr-2 size-4" />
                      {deletingId === entry.id ? "삭제 중..." : "삭제"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          전체 {total}건
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
          >
            <ChevronLeft className="size-4" />
            이전
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
          >
            다음
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface EntryTableSkeletonProps {
  columnCount: number;
}

function EntryTableSkeleton({ columnCount }: EntryTableSkeletonProps) {
  return (
    <div className="flex flex-col gap-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>날짜</TableHead>
            {Array.from({ length: columnCount }).map((_, i) => (
              <TableHead key={i}>
                <Skeleton className="h-4 w-16" />
              </TableHead>
            ))}
            <TableHead>작성자</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, rowIdx) => (
            <TableRow key={rowIdx}>
              <TableCell>
                <Skeleton className="h-4 w-20" />
              </TableCell>
              {Array.from({ length: columnCount }).map((_, colIdx) => (
                <TableCell key={colIdx}>
                  <Skeleton className="h-4 w-16" />
                </TableCell>
              ))}
              <TableCell>
                <Skeleton className="h-4 w-12" />
              </TableCell>
              <TableCell>
                <Skeleton className="size-6" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

import { PageHeader } from "@superbuilder/feature-ui/components/page-header";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Card, CardContent } from "@superbuilder/feature-ui/shadcn/card";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@superbuilder/feature-ui/shadcn/table";
import { Palette, FileText } from "lucide-react";
import { useAdminStudios } from "../hooks";

interface Props {}

export function ContentStudioAdminPage({}: Props) {
  const { data: studios, isLoading } = useAdminStudios();

  return (
    <div className="container mx-auto py-8">
      <PageHeader
        title="콘텐츠 스튜디오"
        description="모든 스튜디오를 관리합니다"
        icon={<Palette className="size-6" />}
      />

      <div className="mt-8">
        {isLoading ? (
          <LoadingSkeleton />
        ) : !studios || studios.length === 0 ? (
          <EmptyState />
        ) : (
          <StudioTable studios={studios} />
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

type StudioRow = {
  id: string;
  title: string;
  visibility: string | null;
  isDeleted: boolean;
  createdAt: Date | string | null;
  ownerName: string | null;
  contentCount: number;
};

interface StudioTableProps {
  studios: StudioRow[];
}

function StudioTable({ studios }: StudioTableProps) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>제목</TableHead>
              <TableHead>소유자</TableHead>
              <TableHead>공개 설정</TableHead>
              <TableHead className="text-right">콘텐츠 수</TableHead>
              <TableHead>생성일</TableHead>
              <TableHead>상태</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {studios.map((studio) => (
              <TableRow key={studio.id}>
                <TableCell className="font-medium">{studio.title}</TableCell>
                <TableCell className="text-muted-foreground">
                  {studio.ownerName ?? "-"}
                </TableCell>
                <TableCell>
                  <VisibilityBadge visibility={studio.visibility} />
                </TableCell>
                <TableCell className="text-right">
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <FileText className="size-3.5" />
                    {studio.contentCount}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {studio.createdAt
                    ? new Date(studio.createdAt).toLocaleDateString("ko-KR")
                    : "-"}
                </TableCell>
                <TableCell>
                  {studio.isDeleted ? (
                    <Badge variant="destructive">삭제됨</Badge>
                  ) : (
                    <Badge variant="success">활성</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

interface VisibilityBadgeProps {
  visibility: string | null;
}

function VisibilityBadge({ visibility }: VisibilityBadgeProps) {
  if (visibility === "public") {
    return <Badge variant="outline">공개</Badge>;
  }
  return <Badge variant="secondary">비공개</Badge>;
}

function LoadingSkeleton() {
  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-4 w-12 ml-auto" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-14" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16">
        <Palette className="size-10 text-muted-foreground/70" />
        <p className="mt-4 text-lg font-medium text-muted-foreground">
          스튜디오가 없습니다
        </p>
        <p className="mt-1 text-sm text-muted-foreground/70">
          사용자가 스튜디오를 생성하면 여기에 표시됩니다
        </p>
      </CardContent>
    </Card>
  );
}

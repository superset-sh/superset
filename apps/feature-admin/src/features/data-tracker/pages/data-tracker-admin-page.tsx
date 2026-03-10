/**
 * DataTrackerAdminPage - 데이터 트래커 관리 목록
 */
import { Link } from "@tanstack/react-router";
import { PageHeader } from "@superbuilder/feature-ui/components/page-header";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Switch } from "@superbuilder/feature-ui/shadcn/switch";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@superbuilder/feature-ui/shadcn/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@superbuilder/feature-ui/shadcn/alert-dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  useDataTrackerAdminList,
  useDataTrackerAdminDelete,
  useDataTrackerAdminToggleActive,
} from "../hooks";

interface Props {}

export function DataTrackerAdminPage({}: Props) {
  const { data: trackers, isLoading } = useDataTrackerAdminList();
  const deleteTracker = useDataTrackerAdminDelete();
  const toggleActive = useDataTrackerAdminToggleActive();

  const handleDelete = async (id: string) => {
    try {
      await deleteTracker.mutateAsync({ id });
      toast.success("트래커가 삭제되었습니다.");
    } catch {
      toast.error("트래커 삭제에 실패했습니다.");
    }
  };

  const handleToggleActive = async (id: string) => {
    try {
      const result = await toggleActive.mutateAsync({ id });
      toast.success(
        result.isActive ? "트래커가 활성화되었습니다." : "트래커가 비활성화되었습니다.",
      );
    } catch {
      toast.error("상태 변경에 실패했습니다.");
    }
  };

  return (
    <div className="container mx-auto py-8">
      <PageHeader
        title="데이터 트래커"
        description="데이터 수집 트래커를 관리합니다"
        actions={
          <Button render={<Link to="/data-tracker/new" />}>
            <Plus className="mr-2 size-4" />
            새 트래커
          </Button>
        }
      />

      <div className="mt-8">
        {isLoading ? (
          <LoadingSkeleton />
        ) : trackers && trackers.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>차트 타입</TableHead>
                <TableHead>범위</TableHead>
                <TableHead>활성</TableHead>
                <TableHead>생성일</TableHead>
                <TableHead className="text-right">액션</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trackers.map((tracker) => (
                <TableRow key={tracker.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{tracker.name}</p>
                      {tracker.description && (
                        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">
                          {tracker.description}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {CHART_TYPE_LABEL[tracker.chartType]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {SCOPE_LABEL[tracker.scope]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={tracker.isActive}
                        onCheckedChange={() => handleToggleActive(tracker.id)}
                        size="sm"
                      />
                      <span className="text-sm text-muted-foreground">
                        {tracker.isActive ? "활성" : "비활성"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {new Date(tracker.createdAt).toLocaleDateString("ko-KR")}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        render={
                          <Link
                            to="/data-tracker/$trackerId/edit"
                            params={{ trackerId: tracker.id }}
                          />
                        }
                      >
                        <Pencil className="size-3.5 mr-1" />
                        수정
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
                          <Trash2 className="size-3.5 mr-1" />
                          삭제
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>트래커 삭제</AlertDialogTitle>
                            <AlertDialogDescription>
                              &quot;{tracker.name}&quot; 트래커를 삭제하시겠습니까?
                              이 작업은 되돌릴 수 없습니다.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>취소</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(tracker.id)}
                            >
                              삭제
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="py-12 text-center text-muted-foreground">
            등록된 트래커가 없습니다. 새 트래커를 추가해보세요.
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const CHART_TYPE_LABEL: Record<string, string> = {
  line: "라인",
  bar: "바",
  pie: "파이",
};

const SCOPE_LABEL: Record<string, string> = {
  personal: "개인",
  organization: "조직",
  all: "전체",
};

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-10 w-full" />
      {[...Array(3)].map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

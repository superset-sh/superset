/**
 * FileManagerPage - Admin 파일 관리 페이지
 */
import { useState } from "react";
import { Grid, List, RefreshCw } from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@superbuilder/feature-ui/shadcn/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@superbuilder/feature-ui/shadcn/alert-dialog";
import { PageHeader } from "@superbuilder/feature-ui/components/page-header";
import { toast } from "sonner";
import { useAdminFiles, useAdminFileDelete } from "../hooks";
import { FileUploader } from "./file-uploader";
import { FileList } from "./file-list";

export function FileManagerPage() {
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"grid" | "list">("list");
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useAdminFiles({ page, limit: 20 });
  const deleteFile = useAdminFileDelete();

  const handleDelete = (id: string) => {
    setDeleteTargetId(id);
  };

  const confirmDelete = () => {
    if (!deleteTargetId) return;

    deleteFile.mutate(
      { id: deleteTargetId },
      {
        onSuccess: () => {
          toast.success("파일이 삭제되었습니다.");
          setDeleteTargetId(null);
          refetch();
        },
        onError: () => {
          toast.error("삭제에 실패했습니다.");
          setDeleteTargetId(null);
        },
      },
    );
  };

  const handleUploadComplete = () => {
    setIsUploadOpen(false);
    refetch();
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <PageHeader
        title="파일 관리"
        description="업로드된 파일을 관리합니다"
        actions={
          <div className="flex items-center gap-2">
            {/* View Toggle */}
            <div className="bg-muted flex rounded-md p-1">
              <Button
                variant={view === "list" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setView("list")}
              >
                <List className="size-4" />
              </Button>
              <Button
                variant={view === "grid" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setView("grid")}
              >
                <Grid className="size-4" />
              </Button>
            </div>

            <Button variant="outline" size="icon" onClick={() => refetch()}>
              <RefreshCw className="size-4" />
            </Button>

            <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
              <DialogTrigger render={<Button />}>파일 업로드</DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>파일 업로드</DialogTitle>
                </DialogHeader>
                <FileUploader
                  bucket="public-files"
                  maxFiles={10}
                  onUploadComplete={handleUploadComplete}
                />
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <FileList
        files={data?.data ?? []}
        onDelete={handleDelete}
        deletable
        isLoading={isLoading}
        view={view}
      />

      {/* Pagination */}
      {data && data.total > 20 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            이전
          </Button>
          <span className="text-muted-foreground text-sm">
            {page} / {data.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            다음
          </Button>
        </div>
      )}

      {data && (
        <p className="text-muted-foreground text-center text-sm">
          총 {data.total}개
        </p>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deleteTargetId}
        onOpenChange={(open) => !open && setDeleteTargetId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>파일 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              이 파일을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

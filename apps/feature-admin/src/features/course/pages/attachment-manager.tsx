/**
 * Attachment Manager - 첨부파일 관리 (추가/삭제/D&D 정렬)
 */
import { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, Trash2, FileText, GripVertical } from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
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
  AlertDialogTrigger,
} from "@superbuilder/feature-ui/shadcn/alert-dialog";
import { toast } from "sonner";
import { useAttachments, useCreateAttachment, useDeleteAttachment, useReorderAttachments } from "../hooks";

interface Props {
  courseId: string;
}

export function AttachmentManager({ courseId }: Props) {
  const { data: attachments, isLoading } = useAttachments(courseId);
  const createAttachment = useCreateAttachment();
  const deleteAttachment = useDeleteAttachment();
  const reorderAttachments = useReorderAttachments();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleCreate = () => {
    if (!newTitle.trim()) {
      toast.error("제목을 입력해주세요.");
      return;
    }

    createAttachment.mutate(
      {
        courseId,
        title: newTitle,
        url: newUrl || undefined,
      },
      {
        onSuccess: () => {
          toast.success("첨부파일이 추가되었습니다.");
          setNewTitle("");
          setNewUrl("");
          setIsAddDialogOpen(false);
        },
        onError: () => toast.error("추가에 실패했습니다."),
      },
    );
  };

  const handleDelete = (id: string) => {
    deleteAttachment.mutate(
      { id },
      {
        onSuccess: () => toast.success("첨부파일이 삭제되었습니다."),
        onError: () => toast.error("삭제에 실패했습니다."),
      },
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !attachments) return;

    const oldIndex = attachments.findIndex((a) => a.id === active.id);
    const newIndex = attachments.findIndex((a) => a.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(attachments, oldIndex, newIndex);
    reorderAttachments.mutate(
      reordered.map((a, i) => ({ id: a.id, sortOrder: i })),
      { onError: () => toast.error("순서 변경에 실패했습니다.") },
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{attachments?.length ?? 0}개의 첨부파일</p>
        <Button size="sm" onClick={() => setIsAddDialogOpen(true)}>
          <Plus className="mr-2 size-4" />
          첨부파일 추가
        </Button>
      </div>

      {!attachments?.length ? (
        <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
          첨부파일이 없습니다.
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={attachments.map((a) => a.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {attachments.map((attachment) => (
                <SortableAttachmentItem
                  key={attachment.id}
                  attachment={attachment}
                  onDelete={() => handleDelete(attachment.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>첨부파일 추가</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>제목 <span className="text-destructive">*</span></Label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="예: 수업 자료 PDF"
              />
            </div>
            <div className="space-y-2">
              <Label>URL (선택)</Label>
              <Input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>취소</DialogClose>
            <Button onClick={handleCreate} disabled={createAttachment.isPending}>
              {createAttachment.isPending ? "추가 중..." : "추가"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * SortableAttachmentItem
 * -----------------------------------------------------------------------------------------------*/

interface SortableAttachmentItemProps {
  attachment: {
    id: string;
    title: string | null;
    file?: { originalName?: string; size?: number; url?: string } | null;
  };
  onDelete: () => void;
}

function SortableAttachmentItem({ attachment, onDelete }: SortableAttachmentItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: attachment.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-3 border rounded-lg bg-card hover:border-primary/20 transition-colors"
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <FileText className="size-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {attachment.title ?? attachment.file?.originalName ?? "파일"}
        </p>
        {attachment.file?.size && (
          <p className="text-xs text-muted-foreground">
            {formatFileSize(attachment.file.size)}
          </p>
        )}
      </div>
      <AlertDialog>
        <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>
          <Trash2 className="size-4 text-destructive" />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>첨부파일 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              이 첨부파일을 삭제하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

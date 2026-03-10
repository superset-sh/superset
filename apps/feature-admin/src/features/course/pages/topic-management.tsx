/**
 * Topic Management Page - 주제 관리
 * SCR-COURSE-005
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
import { Plus, Pencil, Trash2, GripVertical, Tag } from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import { Switch } from "@superbuilder/feature-ui/shadcn/switch";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
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
} from "@superbuilder/feature-ui/shadcn/alert-dialog";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { PageHeader } from "@superbuilder/feature-ui/components/page-header";
import { toast } from "sonner";
import {
  useTopics,
  useCreateTopic,
  useUpdateTopic,
  useDeleteTopic,
  useReorderTopics,
} from "../hooks";

interface TopicFormData {
  name: string;
  slug: string;
  description: string;
  isActive: boolean;
}

const EMPTY_FORM: TopicFormData = {
  name: "",
  slug: "",
  description: "",
  isActive: true,
};

export function TopicManagement() {
  const { data: topics, isLoading } = useTopics(true);
  const createTopic = useCreateTopic();
  const updateTopic = useUpdateTopic();
  const deleteTopic = useDeleteTopic();
  const reorderTopics = useReorderTopics();

  const [form, setForm] = useState<TopicFormData>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const openCreate = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEdit = (topic: { id: string; name: string; slug: string; description: string | null; isActive: boolean }) => {
    setForm({
      name: topic.name,
      slug: topic.slug,
      description: topic.description ?? "",
      isActive: topic.isActive,
    });
    setEditingId(topic.id);
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast.error("주제명을 입력해주세요.");
      return;
    }

    if (editingId) {
      updateTopic.mutate(
        { id: editingId, data: { name: form.name, slug: form.slug || undefined, description: form.description || undefined, isActive: form.isActive } },
        {
          onSuccess: () => {
            toast.success("주제가 수정되었습니다.");
            setIsDialogOpen(false);
            resetForm();
          },
          onError: (error) => {
            if (error.message?.includes("slug") || error.message?.includes("409")) {
              toast.error("이미 사용 중인 URL 주소입니다.");
            } else {
              toast.error("수정에 실패했습니다.");
            }
          },
        },
      );
    } else {
      createTopic.mutate(
        { name: form.name, slug: form.slug || undefined, description: form.description || undefined },
        {
          onSuccess: () => {
            toast.success("주제가 생성되었습니다.");
            setIsDialogOpen(false);
            resetForm();
          },
          onError: (error) => {
            if (error.message?.includes("slug") || error.message?.includes("409")) {
              toast.error("이미 사용 중인 URL 주소입니다.");
            } else {
              toast.error(error.message || "생성에 실패했습니다.");
            }
          },
        },
      );
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteTopic.mutate(
      { id: deleteTarget.id },
      {
        onSuccess: () => {
          toast.success("주제가 삭제되었습니다.");
          setDeleteTarget(null);
        },
        onError: (error) => {
          if (error.message?.includes("강의")) {
            toast.error("이 주제에 강의가 존재합니다. 먼저 강의를 삭제하거나 이동해주세요.");
          } else {
            toast.error(error.message || "삭제에 실패했습니다.");
          }
        },
      },
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !topics) return;

    const oldIndex = topics.findIndex((t) => t.id === active.id);
    const newIndex = topics.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(topics, oldIndex, newIndex);
    const payload = reordered.map((t, i) => ({ id: t.id, sortOrder: i }));

    reorderTopics.mutate(payload, {
      onError: () => toast.error("순서 변경에 실패했습니다."),
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="주제 관리"
        description="강의 주제를 생성하고 관리합니다."
        icon={<Tag className="size-6" />}
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-2 size-4" />
            새 주제
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48 flex-1" />
              <Skeleton className="h-5 w-12" />
            </div>
          ))}
        </div>
      ) : !topics?.length ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 border border-dashed rounded-lg">
          <p className="text-muted-foreground">등록된 주제가 없습니다</p>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 size-4" />
            주제 추가
          </Button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={topics.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {topics.map((topic) => (
                <SortableTopicItem
                  key={topic.id}
                  topic={topic}
                  onEdit={() => openEdit(topic)}
                  onToggleActive={() =>
                    updateTopic.mutate(
                      { id: topic.id, data: { isActive: !topic.isActive } },
                      { onSuccess: () => toast.success(topic.isActive ? "비활성화되었습니다." : "활성화되었습니다.") },
                    )
                  }
                  onDelete={() => setDeleteTarget({ id: topic.id, name: topic.name })}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "주제 수정" : "새 주제"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>주제명 <span className="text-destructive">*</span></Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="예: 프론트엔드"
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label>Slug (선택)</Label>
              <Input
                value={form.slug}
                onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value }))}
                placeholder="자동 생성됩니다"
              />
            </div>
            <div className="space-y-2">
              <Label>설명</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="주제에 대한 간단한 설명"
                rows={3}
              />
            </div>
            {editingId && (
              <div className="flex items-center gap-3">
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isActive: checked }))}
                />
                <Label>활성화</Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>취소</DialogClose>
            <Button
              onClick={handleSubmit}
              disabled={createTopic.isPending || updateTopic.isPending}
            >
              {createTopic.isPending || updateTopic.isPending ? "저장 중..." : editingId ? "수정" : "생성"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>주제 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleteTarget?.name}&quot;을(를) 삭제하시겠습니까? 하위 강의가 있으면 삭제할 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleteTopic.isPending}>
              {deleteTopic.isPending ? "삭제 중..." : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * SortableTopicItem
 * -----------------------------------------------------------------------------------------------*/

interface SortableTopicItemProps {
  topic: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    isActive: boolean;
    sortOrder: number;
  };
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}

function SortableTopicItem({ topic, onEdit, onToggleActive, onDelete }: SortableTopicItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: topic.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-4 p-4 border rounded-lg bg-card hover:border-primary/20 transition-colors"
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{topic.name}</span>
          <span className="text-xs text-muted-foreground">({topic.slug})</span>
        </div>
        {topic.description && (
          <p className="text-sm text-muted-foreground truncate mt-0.5">
            {topic.description}
          </p>
        )}
      </div>

      <Badge variant={topic.isActive ? "default" : "secondary"}>
        {topic.isActive ? "활성" : "비활성"}
      </Badge>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Pencil className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onToggleActive}>
          <Switch checked={topic.isActive} className="pointer-events-none" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onDelete}>
          <Trash2 className="size-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

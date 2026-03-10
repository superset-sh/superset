/**
 * Curriculum Editor - 섹션/레슨 CRUD + D&D 정렬
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
import { Plus, Pencil, Trash2, GripVertical, Video, VideoOff } from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import { Switch } from "@superbuilder/feature-ui/shadcn/switch";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@superbuilder/feature-ui/shadcn/collapsible";
import { toast } from "sonner";
import {
  useSections,
  useCreateSection,
  useUpdateSection,
  useDeleteSection,
  useReorderSections,
  useCreateLesson,
  useUpdateLesson,
  useDeleteLesson,
  useReorderLessons,
} from "../hooks";

interface Props {
  courseId: string;
}

export function CurriculumEditor({ courseId }: Props) {
  const { data: sections, isLoading } = useSections(courseId);
  const createSection = useCreateSection();
  const deleteSection = useDeleteSection();
  const createLesson = useCreateLesson();
  const reorderSections = useReorderSections();

  const [sectionTitle, setSectionTitle] = useState("");
  const [isSectionDialogOpen, setIsSectionDialogOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleCreateSection = () => {
    if (!sectionTitle.trim()) {
      toast.error("섹션 제목을 입력해주세요.");
      return;
    }
    createSection.mutate(
      { courseId, title: sectionTitle },
      {
        onSuccess: () => {
          toast.success("섹션이 생성되었습니다.");
          setSectionTitle("");
          setIsSectionDialogOpen(false);
        },
        onError: () => toast.error("생성에 실패했습니다."),
      },
    );
  };

  const handleDeleteSection = (sectionId: string) => {
    deleteSection.mutate(
      { id: sectionId },
      {
        onSuccess: () => toast.success("섹션이 삭제되었습니다."),
        onError: () => toast.error("삭제에 실패했습니다."),
      },
    );
  };

  const handleSectionDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !sections) return;

    const oldIndex = sections.findIndex((s) => s.id === active.id);
    const newIndex = sections.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(sections, oldIndex, newIndex);
    reorderSections.mutate(
      reordered.map((s, i) => ({ id: s.id, sortOrder: i })),
      { onError: () => toast.error("순서 변경에 실패했습니다.") },
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          섹션 {sections?.length ?? 0}개
        </p>
        <Dialog open={isSectionDialogOpen} onOpenChange={setIsSectionDialogOpen}>
          <Button size="sm" onClick={() => setIsSectionDialogOpen(true)}>
            <Plus className="mr-2 size-4" />
            섹션 추가
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>새 섹션</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>섹션 제목</Label>
                <Input
                  value={sectionTitle}
                  onChange={(e) => setSectionTitle(e.target.value)}
                  placeholder="예: 1장. 시작하기"
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreateSection(); }}
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>취소</DialogClose>
              <Button onClick={handleCreateSection} disabled={createSection.isPending}>
                {createSection.isPending ? "생성 중..." : "생성"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {!sections?.length ? (
        <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
          섹션이 없습니다. 섹션을 추가하여 커리큘럼을 구성하세요.
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSectionDragEnd}>
          <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {sections.map((section, index) => (
                <SortableSectionItem
                  key={section.id}
                  section={section}
                  index={index}
                  onDelete={() => handleDeleteSection(section.id)}
                  onCreateLesson={(title: string) => {
                    createLesson.mutate(
                      { sectionId: section.id, title },
                      {
                        onSuccess: () => toast.success("레슨이 추가되었습니다."),
                        onError: () => toast.error("추가에 실패했습니다."),
                      },
                    );
                  }}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * SortableSectionItem
 * -----------------------------------------------------------------------------------------------*/

interface SortableSectionItemProps {
  section: {
    id: string;
    title: string;
    description: string | null;
    sortOrder: number;
    lessons: Array<{
      id: string;
      title: string;
      isFree: boolean;
      videoFileId: string | null;
      videoDurationSeconds: number | null;
    }>;
  };
  index: number;
  onDelete: () => void;
  onCreateLesson: (title: string) => void;
}

function SortableSectionItem({ section, index, onDelete, onCreateLesson }: SortableSectionItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const updateSection = useUpdateSection();
  const updateLesson = useUpdateLesson();
  const deleteLesson = useDeleteLesson();
  const reorderLessons = useReorderLessons();
  const [isOpen, setIsOpen] = useState(true);
  const [newLessonTitle, setNewLessonTitle] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(section.title);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleUpdateTitle = () => {
    if (!editTitle.trim()) return;
    updateSection.mutate(
      { id: section.id, data: { title: editTitle } },
      {
        onSuccess: () => {
          toast.success("섹션이 수정되었습니다.");
          setIsEditing(false);
        },
      },
    );
  };

  const handleAddLesson = () => {
    if (!newLessonTitle.trim()) return;
    onCreateLesson(newLessonTitle);
    setNewLessonTitle("");
  };

  const handleDeleteLesson = (lessonId: string) => {
    deleteLesson.mutate(
      { id: lessonId },
      { onSuccess: () => toast.success("레슨이 삭제되었습니다.") },
    );
  };

  const handleLessonDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = section.lessons.findIndex((l) => l.id === active.id);
    const newIndex = section.lessons.findIndex((l) => l.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(section.lessons, oldIndex, newIndex);
    reorderLessons.mutate(
      reordered.map((l, i) => ({ id: l.id, sortOrder: i })),
      { onError: () => toast.error("순서 변경에 실패했습니다.") },
    );
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="border rounded-lg">
          <div className="flex items-center gap-3 p-4 bg-muted/30">
            <button
              type="button"
              className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-4" />
            </button>
            <CollapsibleTrigger className="flex-1 text-left">
              {isEditing ? (
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="h-8"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleUpdateTitle();
                      if (e.key === "Escape") setIsEditing(false);
                    }}
                  />
                  <Button size="sm" variant="ghost" onClick={handleUpdateTitle}>
                    저장
                  </Button>
                </div>
              ) : (
                <span className="font-medium">
                  {index + 1}. {section.title}
                </span>
              )}
            </CollapsibleTrigger>
            <span className="text-sm text-muted-foreground">
              레슨 {section.lessons?.length ?? 0}개
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(!isEditing);
                setEditTitle(section.title);
              }}
            >
              <Pencil className="size-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>
                <Trash2 className="size-4 text-destructive" />
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>섹션 삭제</AlertDialogTitle>
                  <AlertDialogDescription>
                    하위 레슨을 포함하여 삭제됩니다. 계속하시겠습니까?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>취소</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete}>삭제</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          <CollapsibleContent>
            <div className="p-4 space-y-2">
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleLessonDragEnd}>
                <SortableContext items={section.lessons.map((l) => l.id)} strategy={verticalListSortingStrategy}>
                  {section.lessons?.map((lesson, lessonIndex) => (
                    <SortableLessonItem
                      key={lesson.id}
                      lesson={lesson}
                      index={lessonIndex}
                      onUpdate={(data) =>
                        updateLesson.mutate({ id: lesson.id, data }, {
                          onSuccess: () => toast.success("레슨이 수정되었습니다."),
                        })
                      }
                      onDelete={() => handleDeleteLesson(lesson.id)}
                    />
                  ))}
                </SortableContext>
              </DndContext>

              <div className="flex items-center gap-2 pt-2">
                <Input
                  value={newLessonTitle}
                  onChange={(e) => setNewLessonTitle(e.target.value)}
                  placeholder="새 레슨 제목"
                  className="h-8"
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddLesson(); }}
                />
                <Button size="sm" variant="outline" onClick={handleAddLesson}>
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * SortableLessonItem
 * -----------------------------------------------------------------------------------------------*/

interface SortableLessonItemProps {
  lesson: {
    id: string;
    title: string;
    isFree: boolean;
    videoFileId: string | null;
    videoDurationSeconds: number | null;
  };
  index: number;
  onUpdate: (data: { title?: string; isFree?: boolean }) => void;
  onDelete: () => void;
}

function SortableLessonItem({ lesson, index, onUpdate, onDelete }: SortableLessonItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lesson.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-muted/30"
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <span className="text-sm text-muted-foreground w-6">{index + 1}.</span>
      <span className="flex-1 text-sm">{lesson.title}</span>
      {lesson.videoFileId ? (
        <Video className="size-4 text-green-600" />
      ) : (
        <VideoOff className="size-4 text-muted-foreground" />
      )}
      {lesson.isFree && <Badge variant="secondary">무료</Badge>}
      <div className="flex items-center gap-1">
        <Switch
          checked={lesson.isFree}
          onCheckedChange={(checked) => onUpdate({ isFree: checked })}
        />
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>
            <Trash2 className="size-3 text-destructive" />
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>레슨 삭제</AlertDialogTitle>
              <AlertDialogDescription>
                &quot;{lesson.title}&quot;을(를) 삭제하시겠습니까?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete}>삭제</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

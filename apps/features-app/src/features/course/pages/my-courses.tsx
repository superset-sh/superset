/**
 * My Courses - 내 수강 목록 (Auth)
 * SCR-COURSE-003
 */
import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Play, RotateCcw } from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Progress } from "@superbuilder/feature-ui/shadcn/progress";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@superbuilder/feature-ui/shadcn/tabs";
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
import { toast } from "sonner";
import { useMyCourses, useCancelEnrollment } from "../hooks";

export function MyCourses() {
  const { data: courses, isLoading, isError, refetch } = useMyCourses();
  const cancelEnrollment = useCancelEnrollment();
  const [cancelTarget, setCancelTarget] = useState<{
    courseId: string;
    title: string;
  } | null>(null);

  const inProgress = courses?.filter((c) => !c.enrollment.completedAt) ?? [];
  const completed = courses?.filter((c) => !!c.enrollment.completedAt) ?? [];

  const handleCancel = () => {
    if (!cancelTarget) return;
    cancelEnrollment.mutate(
      { courseId: cancelTarget.courseId },
      {
        onSuccess: () => {
          toast.success("수강이 취소되었습니다.");
          setCancelTarget(null);
        },
        onError: () => toast.error("수강 취소에 실패했습니다."),
      },
    );
  };

  if (isLoading) return <MyCourseSkeleton />;

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-muted-foreground">수강 목록을 불러올 수 없습니다</p>
        <Button variant="outline" onClick={() => refetch()}>다시 시도</Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">내 학습</h1>
        <p className="text-sm text-muted-foreground">수강 중인 강의를 관리하세요</p>
      </div>

      <Tabs defaultValue="in-progress">
        <TabsList>
          <TabsTrigger value="in-progress">수강 중 ({inProgress.length})</TabsTrigger>
          <TabsTrigger value="completed">완료 ({completed.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="in-progress" className="mt-6">
          {inProgress.length === 0 ? (
            <EmptyState
              message="수강 중인 강의가 없습니다"
              actionLabel="강의 둘러보기"
              actionTo="/course"
            />
          ) : (
            <div className="space-y-2">
              {inProgress.map((item) => (
                <MyCourseItem
                  key={item.enrollment.id}
                  item={item}
                  onCancel={(courseId, title) => setCancelTarget({ courseId, title })}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="completed" className="mt-6">
          {completed.length === 0 ? (
            <EmptyState message="아직 완료한 강의가 없습니다" />
          ) : (
            <div className="space-y-2">
              {completed.map((item) => (
                <MyCourseItem
                  key={item.enrollment.id}
                  item={item}
                  isCompletedTab
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>수강 취소</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{cancelTarget?.title}&quot; 수강을 취소하시겠습니까?
              진행률이 모두 삭제됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} disabled={cancelEnrollment.isPending}>
              {cancelEnrollment.isPending ? "처리 중..." : "수강 취소"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * MyCourseItem
 * -----------------------------------------------------------------------------------------------*/

interface MyCourseItemProps {
  item: {
    course: {
      id: string;
      title: string;
      slug: string;
      thumbnailUrl: string | null;
      totalLessons: number;
      topic?: { name: string } | null;
    };
    enrollment: {
      id: string;
      completedAt: string | null;
    };
    completedLessons: number;
    totalLessons: number;
    progressPercent: number;
  };
  isCompletedTab?: boolean;
  onCancel?: (courseId: string, title: string) => void;
}

function MyCourseItem({ item, isCompletedTab, onCancel }: MyCourseItemProps) {
  const navigate = useNavigate();
  const isCompleted = !!item.enrollment.completedAt;

  return (
    <div className="group flex items-center gap-4 p-3 rounded-lg hover:bg-muted/30 transition-colors">
      {/* Thumbnail */}
      <button
        type="button"
        className="shrink-0 w-20 h-[60px] overflow-hidden rounded-md bg-muted/50"
        onClick={() =>
          navigate({
            to: "/course/$slug/learn",
            params: { slug: item.course.slug },
            search: { lessonId: undefined },
          })
        }
      >
        {item.course.thumbnailUrl ? (
          <img
            src={item.course.thumbnailUrl}
            alt={item.course.title}
            className="size-full object-cover"
          />
        ) : (
          <div className="size-full flex items-center justify-center text-muted-foreground/30 text-xs">
            강의
          </div>
        )}
      </button>

      {/* Info */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2">
          <Link
            to="/course/$slug/learn"
            params={{ slug: item.course.slug }}
            search={{ lessonId: undefined }}
            className="text-sm font-medium text-foreground hover:text-primary transition-colors truncate"
          >
            {item.course.title}
          </Link>
        </div>
        {item.course.topic && (
          <p className="text-xs text-muted-foreground">{item.course.topic.name}</p>
        )}
        <div className="flex items-center gap-3">
          <Progress value={item.progressPercent} className="h-1.5 flex-1 max-w-[200px]" />
          <span className="text-xs text-muted-foreground shrink-0">
            {item.completedLessons}/{item.totalLessons} 완료 ({Math.round(item.progressPercent)}%)
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant={isCompleted ? "outline" : "default"}
          size="sm"
          onClick={() =>
            navigate({
              to: "/course/$slug/learn",
              params: { slug: item.course.slug },
              search: { lessonId: undefined },
            })
          }
        >
          {isCompleted ? (
            <>
              <RotateCcw className="size-3.5 mr-1.5" />
              다시 학습
            </>
          ) : (
            <>
              <Play className="size-3.5 mr-1.5" />
              이어서 학습
            </>
          )}
        </Button>
        {!isCompletedTab && onCancel && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground text-xs"
            onClick={() => onCancel(item.course.id, item.course.title)}
          >
            취소
          </Button>
        )}
        <ChevronRight className="size-4 text-muted-foreground/50" />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * EmptyState
 * -----------------------------------------------------------------------------------------------*/

function EmptyState({
  message,
  actionLabel,
  actionTo,
}: {
  message: string;
  actionLabel?: string;
  actionTo?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <p className="text-muted-foreground">{message}</p>
      {actionLabel && actionTo && (
        <Link to={actionTo}>
          <Button variant="outline" size="sm">{actionLabel}</Button>
        </Link>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * MyCourseSkeleton
 * -----------------------------------------------------------------------------------------------*/

function MyCourseSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-1.5">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-20" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-3">
            <Skeleton className="w-20 h-[60px] rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-20" />
              <div className="flex items-center gap-3">
                <Skeleton className="h-1.5 w-[200px]" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

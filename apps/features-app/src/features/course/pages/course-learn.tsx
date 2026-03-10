/**
 * Course Learn - 강의 학습 뷰어 (Auth)
 * SCR-COURSE-004
 *
 * Route: /course/$slug/learn?lessonId=xxx
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckCircle,
  ChevronRight,
  Menu,
  X,
  FileText,
  Download,
} from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@superbuilder/feature-ui/shadcn/dialog";
import { toast } from "sonner";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { VideoPlayer } from "../components/video-player";
import { CurriculumSidebar } from "../components/curriculum-sidebar";
import {
  useCourseBySlug,
  useCourseProgress,
  useLessonWithVideo,
  useToggleLessonComplete,
  useCourseAttachments,
} from "../hooks";
import { useProgressTracker } from "../hooks/use-progress-tracker";

export function CourseLearn() {
  const { slug } = useParams({ strict: false });
  const search = useSearch({ strict: false }) as { lessonId?: string };
  const navigate = useNavigate();

  const { data: course, isLoading: courseLoading } = useCourseBySlug(slug ?? "");
  const { data: progress, isLoading: progressLoading } = useCourseProgress(course?.id ?? "");
  const { data: attachments } = useCourseAttachments(course?.id ?? "");

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentLessonId, setCurrentLessonId] = useState<string | null>(null);
  const [showCompletionDialog, setShowCompletionDialog] = useState(false);

  useEffect(() => {
    if (!progress?.sections?.length) return;

    if (search?.lessonId) {
      setCurrentLessonId(search.lessonId);
      return;
    }

    let lastInProgress: string | null = null;
    let firstIncomplete: string | null = null;

    for (const section of progress.sections) {
      for (const lesson of section.lessons) {
        if (!lesson.isCompleted && lesson.progressPercent > 0 && !lastInProgress) {
          lastInProgress = lesson.id;
        }
        if (!lesson.isCompleted && !firstIncomplete) {
          firstIncomplete = lesson.id;
        }
      }
    }

    setCurrentLessonId(lastInProgress ?? firstIncomplete ?? progress.sections[0]?.lessons[0]?.id ?? null);
  }, [progress, search?.lessonId]);

  const currentLessonProgress = (() => {
    if (!progress || !currentLessonId) return null;
    for (const section of progress.sections) {
      for (const lesson of section.lessons) {
        if (lesson.id === currentLessonId) return lesson;
      }
    }
    return null;
  })();

  const { data: lessonData, isLoading: lessonLoading } = useLessonWithVideo(currentLessonId ?? "");
  const toggleComplete = useToggleLessonComplete();

  const [videoDuration, setVideoDuration] = useState(0);

  const { trackProgress, flush, cleanup } = useProgressTracker({
    lessonId: currentLessonId ?? "",
    totalDuration: videoDuration,
  });

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [currentLessonId, cleanup]);

  const allLessons = (() => {
    if (!progress?.sections) return [];
    return progress.sections.flatMap((s) => s.lessons);
  })();

  const currentIndex = allLessons.findIndex((l) => l.id === currentLessonId);
  const isLastLesson = currentIndex === allLessons.length - 1;

  const handleSelectLesson = useCallback(
    (lessonId: string) => {
      if (currentLessonId && videoDuration > 0) {
        const video = document.querySelector("video");
        if (video) {
          flush(video.currentTime);
        }
      }
      setCurrentLessonId(lessonId);
    },
    [currentLessonId, videoDuration, flush],
  );

  const handleTimeUpdate = useCallback(
    (currentTime: number) => {
      trackProgress(currentTime);
    },
    [trackProgress],
  );

  const goToNextLesson = useCallback(() => {
    if (currentIndex < allLessons.length - 1) {
      setCurrentLessonId(allLessons[currentIndex + 1]!.id);
    }
  }, [currentIndex, allLessons]);

  const goToPrevLesson = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentLessonId(allLessons[currentIndex - 1]!.id);
    }
  }, [currentIndex, allLessons]);

  const handleVideoEnded = useCallback(() => {
    if (!currentLessonId) return;
    if (!currentLessonProgress?.isCompleted) {
      toggleComplete.mutate(
        { lessonId: currentLessonId, completed: true },
        {
          onSuccess: () => {
            toast.success("레슨을 완료했습니다!");
            if (isLastLesson) {
              setShowCompletionDialog(true);
            } else {
              goToNextLesson();
            }
          },
        },
      );
    } else if (!isLastLesson) {
      goToNextLesson();
    }
  }, [currentLessonId, currentLessonProgress, toggleComplete, isLastLesson, goToNextLesson]);

  const handleDurationChange = useCallback((duration: number) => {
    setVideoDuration(duration);
  }, []);

  const handleToggleComplete = useCallback(() => {
    if (!currentLessonId || !currentLessonProgress) return;
    toggleComplete.mutate(
      { lessonId: currentLessonId, completed: !currentLessonProgress.isCompleted },
      {
        onSuccess: () => {
          toast.success(
            currentLessonProgress.isCompleted ? "완료 취소되었습니다." : "레슨을 완료했습니다!",
          );
        },
      },
    );
  }, [currentLessonId, currentLessonProgress, toggleComplete]);

  if (courseLoading || progressLoading) {
    return <LearnSkeleton />;
  }

  if (!course || !progress) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">강의를 찾을 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mini Header */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-border/40 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ to: "/course/$slug", params: { slug: slug ?? "" } })}
            className="text-muted-foreground hover:text-foreground gap-1.5"
          >
            <ArrowLeft className="size-4" />
            강의 상세
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-medium text-muted-foreground truncate">{course.title}</h1>
            {lessonData && (
              <p className="text-base font-medium text-foreground tracking-tight truncate">
                {lessonData.title}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              navigate({ to: "/my/courses" })
            }
            className="text-muted-foreground hover:text-foreground text-xs"
          >
            내 학습
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden size-8"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </Button>
        </header>

        {/* Video Area */}
        <div className="flex-1 flex flex-col overflow-y-auto">
          <div className="w-full max-w-5xl mx-auto">
            {lessonLoading ? (
              <Skeleton className="w-full aspect-video rounded-lg" />
            ) : lessonData?.videoUrl ? (
              <VideoPlayer
                videoUrl={lessonData.videoUrl}
                startPosition={currentLessonProgress?.lastPosition ?? 0}
                onTimeUpdate={handleTimeUpdate}
                onEnded={handleVideoEnded}
                onDurationChange={handleDurationChange}
              />
            ) : (
              <div className="w-full aspect-video bg-muted rounded-lg flex flex-col items-center justify-center gap-2">
                <p className="text-muted-foreground">이 레슨에는 동영상이 없습니다</p>
                {lessonData?.description && (
                  <p className="text-sm text-muted-foreground/70 max-w-md text-center">
                    {lessonData.description}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Lesson info + Navigation */}
          <div className="w-full max-w-5xl mx-auto px-6 py-8 space-y-6">
            {/* Navigation */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={currentIndex <= 0}
                  onClick={goToPrevLesson}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="size-4 mr-1.5" />
                  이전
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isLastLesson && !!currentLessonProgress?.isCompleted}
                  onClick={isLastLesson ? () => setShowCompletionDialog(true) : goToNextLesson}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {isLastLesson ? "강의 완료" : "다음"}
                  {!isLastLesson && <ChevronRight className="size-4 ml-1.5" />}
                </Button>
              </div>

              <Button
                variant={currentLessonProgress?.isCompleted ? "secondary" : "default"}
                size="sm"
                onClick={handleToggleComplete}
                disabled={toggleComplete.isPending}
              >
                <CheckCircle className="size-4 mr-1" />
                {currentLessonProgress?.isCompleted ? "완료 취소" : "완료 표시"}
              </Button>
            </div>

            {/* Lesson title + description */}
            {lessonData && (
              <div className="space-y-3">
                <h2 className="text-xl font-semibold tracking-tight">{lessonData.title}</h2>
                {lessonData.description && (
                  <p className="text-base text-muted-foreground leading-relaxed">
                    {lessonData.description}
                  </p>
                )}
              </div>
            )}

            {/* Attachments */}
            {attachments && attachments.length > 0 && (
              <div className="space-y-3 pt-4 border-t">
                <h3 className="text-sm font-medium text-muted-foreground">첨부파일</h3>
                <div className="space-y-1.5">
                  {attachments.map((attachment) => (
                    <a
                      key={attachment.id}
                      href={attachment.file?.url ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-muted/30 transition-colors text-sm"
                    >
                      <FileText className="size-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate">
                        {attachment.title ?? attachment.file?.name ?? "파일"}
                      </span>
                      <Download className="size-3.5 text-muted-foreground shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div
        className={cn(
          "border-l border-border/40 bg-muted/10 transition-all duration-300 shrink-0",
          sidebarOpen ? "w-[320px]" : "w-0 overflow-hidden",
          "max-lg:absolute max-lg:right-0 max-lg:top-0 max-lg:h-full max-lg:z-10 max-lg:shadow-lg",
        )}
      >
        {sidebarOpen && (
          <CurriculumSidebar
            sections={progress.sections.map((s) => ({
              ...s,
              lessons: s.lessons.map((l) => ({ ...l, isFree: false })),
            }))}
            currentLessonId={currentLessonId}
            overallProgress={progress.courseProgress}
            onSelectLesson={handleSelectLesson}
          />
        )}
      </div>

      {/* Completion Dialog */}
      <Dialog open={showCompletionDialog} onOpenChange={setShowCompletionDialog}>
        <DialogContent className="text-center">
          <DialogHeader>
            <DialogTitle className="text-xl">강의를 모두 완료했습니다!</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground py-4">수고하셨습니다.</p>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              onClick={() => {
                setShowCompletionDialog(false);
                navigate({ to: "/my/courses" });
              }}
            >
              내 학습으로 이동
            </Button>
            <DialogClose render={<Button variant="outline" />}>
              계속 둘러보기
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * LearnSkeleton
 * -----------------------------------------------------------------------------------------------*/

function LearnSkeleton() {
  return (
    <div className="flex h-screen">
      <div className="flex-1 flex flex-col">
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <Skeleton className="h-8 w-24" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-5 w-48" />
          </div>
        </div>
        <Skeleton className="w-full aspect-video" />
        <div className="px-6 py-8 space-y-4">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-full" />
        </div>
      </div>
      <div className="w-80 border-l p-4 space-y-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    </div>
  );
}

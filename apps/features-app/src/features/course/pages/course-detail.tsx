/**
 * Course Detail - 강의 상세 (Public)
 * SCR-COURSE-002
 */
import { useNavigate, useParams } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import {
  Clock,
  BookOpen,
  Users,
  ChevronDown,
  ChevronRight,
  Play,
  Lock,
  FileText,
  Download,
} from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@superbuilder/feature-ui/shadcn/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@superbuilder/feature-ui/shadcn/collapsible";
import { TipTapViewer } from "@superbuilder/feature-ui/editor/tiptap-viewer";
import { toast } from "sonner";
import { authenticatedAtom } from "@superbuilder/features-client/core/auth";
import {
  useCourseBySlug,
  useCourseCurriculum,
  useCourseAttachments,
} from "../hooks";
import { useIsEnrolled, useEnroll, useCancelEnrollment } from "../hooks";

export function CourseDetail() {
  const { slug } = useParams({ strict: false });
  const navigate = useNavigate();
  const authenticated = useAtomValue(authenticatedAtom);

  const { data: course, isLoading, isError, refetch } = useCourseBySlug(slug ?? "");
  const { data: sections } = useCourseCurriculum(course?.id ?? "");
  const { data: attachments } = useCourseAttachments(course?.id ?? "");
  const { data: enrollmentData } = useIsEnrolled(course?.id ?? "");
  const enroll = useEnroll();
  const cancelEnrollment = useCancelEnrollment();

  if (isLoading) return <DetailSkeleton />;

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-muted-foreground">강의 정보를 불러올 수 없습니다</p>
        <Button variant="outline" onClick={() => refetch()}>다시 시도</Button>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-muted-foreground">강의를 찾을 수 없습니다</p>
        <Button variant="outline" onClick={() => navigate({ to: "/course" })}>
          목록으로 돌아가기
        </Button>
      </div>
    );
  }

  const isEnrolled = !!enrollmentData;
  const isCompleted = false; // TODO: enrollment completedAt 체크

  const handleEnroll = () => {
    if (!authenticated) {
      navigate({ to: "/sign-in" as string, search: { returnUrl: `/course/${slug}` } });
      return;
    }
    enroll.mutate(
      { courseId: course.id },
      {
        onSuccess: () => toast.success("수강 신청이 완료되었습니다."),
        onError: (error) => toast.error(error.message || "수강 신청에 실패했습니다. 다시 시도해주세요."),
      },
    );
  };

  const handleCancel = () => {
    cancelEnrollment.mutate(
      { courseId: course.id },
      {
        onSuccess: () => toast.success("수강이 취소되었습니다."),
        onError: () => toast.error("수강 취소에 실패했습니다."),
      },
    );
  };

  const totalLessons = sections?.reduce((acc, s) => acc + (s.lessons?.length ?? 0), 0) ?? course.totalLessons;

  return (
    <div className="max-w-6xl mx-auto pb-16">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6">
        <button className="hover:text-foreground transition-colors" onClick={() => navigate({ to: "/course" })}>
          강의
        </button>
        {course.topic && (
          <>
            <ChevronRight className="size-3.5" />
            <span>{course.topic.name}</span>
          </>
        )}
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium truncate max-w-[200px]">{course.title}</span>
      </nav>

      <div className="flex flex-col lg:flex-row gap-10">
        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-8">
          {/* Thumbnail */}
          <div className="aspect-video w-full overflow-hidden rounded-lg bg-muted/30">
            {course.thumbnailUrl ? (
              <img
                src={course.thumbnailUrl}
                alt={course.title}
                className="size-full object-cover"
              />
            ) : (
              <div className="size-full flex items-center justify-center text-muted-foreground/20">
                <BookOpen className="size-16" />
              </div>
            )}
          </div>

          {/* Tabs */}
          <Tabs defaultValue="description">
            <TabsList>
              <TabsTrigger value="description">설명</TabsTrigger>
              <TabsTrigger value="curriculum">커리큘럼</TabsTrigger>
              {attachments && attachments.length > 0 && (
                <TabsTrigger value="attachments">첨부파일</TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="description" className="mt-6">
              {course.content ? (
                <TipTapViewer
                  content={course.content as Record<string, unknown>}
                  className="prose prose-sm max-w-none dark:prose-invert"
                />
              ) : (
                <p className="text-muted-foreground py-8 text-center">
                  강의 설명이 준비 중입니다
                </p>
              )}
            </TabsContent>

            <TabsContent value="curriculum" className="mt-6">
              {!sections?.length ? (
                <p className="text-muted-foreground py-8 text-center">
                  커리큘럼이 준비 중입니다
                </p>
              ) : (
                <div className="space-y-2">
                  {sections.map((section, index) => (
                    <CurriculumSection
                      key={section.id}
                      section={section}
                      index={index}
                      isEnrolled={isEnrolled}
                      slug={slug ?? ""}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            {attachments && attachments.length > 0 && (
              <TabsContent value="attachments" className="mt-6">
                <div className="space-y-2">
                  {attachments.map((attachment) => (
                    <a
                      key={attachment.id}
                      href={attachment.file?.url ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-4 py-3 rounded-lg border hover:bg-muted/30 transition-colors"
                    >
                      <FileText className="size-5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {attachment.title ?? attachment.file?.name ?? "파일"}
                        </p>
                        {attachment.file?.size && (
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(attachment.file.size)}
                          </p>
                        )}
                      </div>
                      <Download className="size-4 text-muted-foreground shrink-0" />
                    </a>
                  ))}
                </div>
              </TabsContent>
            )}
          </Tabs>
        </div>

        {/* Side panel */}
        <aside className="w-full lg:w-[340px] shrink-0">
          <div className="lg:sticky lg:top-6 space-y-6 p-6 rounded-xl border bg-card">
            <div className="space-y-3">
              {course.topic && (
                <Badge variant="secondary" className="text-xs">
                  {course.topic.name}
                </Badge>
              )}
              <h1 className="text-2xl font-semibold tracking-tight leading-tight">
                {course.title}
              </h1>
              {course.summary && (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {course.summary}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <BookOpen className="size-4" />
                {totalLessons}개 레슨
              </span>
              {course.estimatedMinutes != null && course.estimatedMinutes > 0 && (
                <span className="flex items-center gap-1.5">
                  <Clock className="size-4" />
                  {formatMinutes(course.estimatedMinutes)}
                </span>
              )}
              {course.enrollmentCount != null && (
                <span className="flex items-center gap-1.5">
                  <Users className="size-4" />
                  {course.enrollmentCount}명 수강
                </span>
              )}
            </div>

            <div className="space-y-3">
              <CTAButton
                authenticated={!!authenticated}
                isEnrolled={isEnrolled}
                isCompleted={isCompleted}
                isPending={enroll.isPending || cancelEnrollment.isPending}
                onEnroll={handleEnroll}
                onLearn={() =>
                  navigate({
                    to: "/course/$slug/learn",
                    params: { slug: slug ?? "" },
                    search: { lessonId: undefined },
                  })
                }
              />
              {isEnrolled && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground"
                  onClick={handleCancel}
                  disabled={cancelEnrollment.isPending}
                >
                  수강 취소
                </Button>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * CTAButton
 * -----------------------------------------------------------------------------------------------*/

function CTAButton({
  authenticated,
  isEnrolled,
  isCompleted,
  isPending,
  onEnroll,
  onLearn,
}: {
  authenticated: boolean;
  isEnrolled: boolean;
  isCompleted: boolean;
  isPending: boolean;
  onEnroll: () => void;
  onLearn: () => void;
}) {
  if (!authenticated) {
    return (
      <Button className="w-full" onClick={onEnroll}>
        로그인 후 수강하기
      </Button>
    );
  }
  if (!isEnrolled) {
    return (
      <Button className="w-full" onClick={onEnroll} disabled={isPending}>
        {isPending ? "신청 중..." : "수강 신청하기"}
      </Button>
    );
  }
  if (isCompleted) {
    return (
      <Button variant="outline" className="w-full" onClick={onLearn}>
        <Play className="size-4 mr-1.5" />
        다시 학습하기
      </Button>
    );
  }
  return (
    <Button className="w-full" onClick={onLearn}>
      <Play className="size-4 mr-1.5" />
      이어서 학습하기
    </Button>
  );
}

/* -------------------------------------------------------------------------------------------------
 * CurriculumSection
 * -----------------------------------------------------------------------------------------------*/

interface CurriculumSectionProps {
  section: {
    id: string;
    title: string;
    lessons: Array<{
      id: string;
      title: string;
      isFree: boolean;
      videoDurationSeconds: number | null;
    }>;
  };
  index: number;
  isEnrolled: boolean;
  slug: string;
}

function CurriculumSection({ section, index, isEnrolled, slug }: CurriculumSectionProps) {
  const navigate = useNavigate();

  const handleLessonClick = (lesson: { id: string; isFree: boolean }) => {
    if (isEnrolled || lesson.isFree) {
      navigate({
        to: "/course/$slug/learn",
        params: { slug },
        search: { lessonId: lesson.id },
      });
    } else {
      toast.info("수강 신청 후 이용 가능합니다");
    }
  };

  return (
    <Collapsible defaultOpen={index === 0} className="group/section">
      <CollapsibleTrigger className="flex items-center justify-between w-full py-4 transition-colors hover:text-primary">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-muted-foreground/50 w-6 text-left">
            {(index + 1).toString().padStart(2, "0")}
          </span>
          <span className="font-medium text-base">{section.title}</span>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{section.lessons?.length ?? 0} 레슨</span>
          <ChevronDown className="size-4 transition-transform group-data-[state=open]/section:rotate-180" />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pb-4 space-y-1">
          {section.lessons?.map((lesson, lessonIndex) => (
            <button
              key={lesson.id}
              type="button"
              onClick={() => handleLessonClick(lesson)}
              className="group/lesson w-full flex items-center justify-between py-2.5 px-2 rounded-md hover:bg-muted/30 transition-colors text-left"
            >
              <div className="flex items-center gap-4 pl-10">
                <span className="text-sm text-muted-foreground/50 w-6">
                  {lessonIndex + 1}.
                </span>
                <span className="text-sm font-medium text-foreground/90 group-hover/lesson:text-foreground">
                  {lesson.title}
                </span>
                {lesson.isFree && (
                  <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    무료
                  </span>
                )}
                {!isEnrolled && !lesson.isFree && (
                  <Lock className="size-3.5 text-muted-foreground/50" />
                )}
              </div>
              {lesson.videoDurationSeconds != null && lesson.videoDurationSeconds > 0 && (
                <span className="text-sm text-muted-foreground">
                  {formatDuration(lesson.videoDurationSeconds)}
                </span>
              )}
            </button>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/* -------------------------------------------------------------------------------------------------
 * DetailSkeleton
 * -----------------------------------------------------------------------------------------------*/

function DetailSkeleton() {
  return (
    <div className="max-w-6xl mx-auto pb-16">
      <div className="flex gap-2 mb-6">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="flex flex-col lg:flex-row gap-10">
        <div className="flex-1 space-y-8">
          <Skeleton className="aspect-video w-full rounded-lg" />
          <div className="space-y-4">
            <div className="flex gap-2">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-20" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
        <div className="w-full lg:w-[340px] shrink-0">
          <div className="space-y-4 p-6 rounded-xl border">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <div className="flex gap-4 pt-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatMinutes(min: number): string {
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `약 ${h}시간 ${m}분` : `약 ${h}시간`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Course List - 강의 목록 (Public)
 * SCR-COURSE-001
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Clock, BookOpen, Users, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@superbuilder/feature-ui/shadcn/select";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { useCourseList, useTopicList } from "../hooks";

const PAGE_SIZE = 9;

export function CourseList() {
  const [page, setPage] = useState(1);
  const [topicFilter, setTopicFilter] = useState<string>("");
  const [sort, setSort] = useState<"latest" | "order">("latest");

  const {
    data: courseData,
    isLoading,
    isError,
    refetch,
  } = useCourseList({
    page,
    limit: PAGE_SIZE,
    topicId: topicFilter || undefined,
    sort,
  });
  const { data: topics } = useTopicList();

  const selectedTopicName = topics?.find((t) => t.id === topicFilter)?.name;

  const handleTopicChange = (v: string | null) => {
    setTopicFilter(v ?? "");
    setPage(1);
  };

  return (
    <div className="space-y-10">
      <div className="space-y-1.5">
        <h1 className="text-3xl font-semibold tracking-tight">강의</h1>
        <p className="text-muted-foreground">원하는 강의를 찾아보세요</p>
      </div>

      <div className="flex items-center gap-3">
        <Select value={topicFilter} onValueChange={handleTopicChange}>
          <SelectTrigger className="w-[160px]" disabled={isLoading}>
            <SelectValue placeholder="전체 주제" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">전체 주제</SelectItem>
            {topics?.map((topic) => (
              <SelectItem key={topic.id} value={topic.id}>
                {topic.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v: string | null) => setSort((v ?? "latest") as "latest" | "order")}>
          <SelectTrigger className="w-[140px]" disabled={isLoading}>
            <SelectValue placeholder="정렬" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="latest">최신순</SelectItem>
            <SelectItem value="order">추천순</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <CourseListSkeleton />
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <p className="text-muted-foreground">강의 목록을 불러올 수 없습니다</p>
          <Button variant="outline" onClick={() => refetch()}>
            다시 시도
          </Button>
        </div>
      ) : !courseData?.items?.length ? (
        <EmptyState
          topicName={selectedTopicName}
          onResetFilter={() => handleTopicChange("")}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {courseData.items.map((course) => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>

          {courseData.totalPages > 1 && (
            <PageNumbers
              page={page}
              totalPages={courseData.totalPages}
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * CourseCard
 * -----------------------------------------------------------------------------------------------*/

interface CourseCardProps {
  course: {
    id: string;
    title: string;
    slug: string;
    summary: string | null;
    thumbnailUrl: string | null;
    totalLessons: number;
    estimatedMinutes: number | null;
    enrollmentCount?: number;
    topic?: { name: string } | null;
  };
}

function CourseCard({ course }: CourseCardProps) {
  return (
    <Link
      to="/course/$slug"
      params={{ slug: course.slug }}
      className="group flex flex-col gap-3 pb-4 transition-all hover:-translate-y-1"
    >
      <div className="aspect-video w-full overflow-hidden rounded-md bg-muted/30">
        {course.thumbnailUrl ? (
          <img
            src={course.thumbnailUrl}
            alt={course.title}
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="size-full flex items-center justify-center text-muted-foreground/30">
            <BookOpen className="size-10" />
          </div>
        )}
      </div>
      <div className="space-y-1.5 px-0.5">
        {course.topic && (
          <span className="text-xs font-medium text-muted-foreground">{course.topic.name}</span>
        )}
        <h3 className="text-base font-medium leading-tight text-foreground group-hover:text-primary transition-colors line-clamp-2">
          {course.title}
        </h3>
        {course.summary && (
          <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">{course.summary}</p>
        )}
        <div className="flex items-center gap-3 pt-2 text-xs font-medium text-muted-foreground/80">
          <span className="flex items-center gap-1.5">
            <BookOpen className="size-3.5" />
            {course.totalLessons}개 레슨
          </span>
          {course.estimatedMinutes != null && course.estimatedMinutes > 0 && (
            <span className="flex items-center gap-1.5">
              <Clock className="size-3.5" />
              {formatMinutes(course.estimatedMinutes)}
            </span>
          )}
          {course.enrollmentCount != null && course.enrollmentCount > 0 && (
            <span className="flex items-center gap-1.5">
              <Users className="size-3.5" />
              {course.enrollmentCount}명
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

/* -------------------------------------------------------------------------------------------------
 * EmptyState
 * -----------------------------------------------------------------------------------------------*/

function EmptyState({
  topicName,
  onResetFilter,
}: {
  topicName?: string;
  onResetFilter: () => void;
}) {
  if (topicName) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-muted-foreground">
          &lsquo;{topicName}&rsquo;에 해당하는 강의가 없습니다
        </p>
        <Button variant="outline" size="sm" onClick={onResetFilter}>
          필터 초기화
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <p className="text-muted-foreground">아직 등록된 강의가 없습니다</p>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * CourseListSkeleton
 * -----------------------------------------------------------------------------------------------*/

function CourseListSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: PAGE_SIZE }).map((_, i) => (
        <div key={i} className="flex flex-col gap-3 pb-4">
          <Skeleton className="aspect-video w-full rounded-md" />
          <div className="space-y-2 px-0.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <div className="flex gap-3 pt-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-12" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * PageNumbers
 * -----------------------------------------------------------------------------------------------*/

function PageNumbers({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  const pages = buildPageRange(page, totalPages);

  return (
    <div className="flex items-center justify-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft className="size-4" />
      </Button>
      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`ellipsis-${i}`} className="px-1 text-sm text-muted-foreground">
            ...
          </span>
        ) : (
          <Button
            key={p}
            variant={p === page ? "default" : "ghost"}
            size="icon"
            className="size-8 text-sm"
            onClick={() => onPageChange(p as number)}
          >
            {p}
          </Button>
        ),
      )}
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

function formatMinutes(min: number): string {
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `약 ${h}시간 ${m}분` : `약 ${h}시간`;
}

function buildPageRange(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | "...")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  if (start > 2) pages.push("...");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push("...");
  pages.push(total);

  return pages;
}

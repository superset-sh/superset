/**
 * Course Admin Page - 강의 관리 메인 (강의 목록)
 * SCR-COURSE-006
 */
import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Users,
  BookOpen,
  Trash2,
  Eye,
  EyeOff,
  GraduationCap,
} from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@superbuilder/feature-ui/shadcn/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@superbuilder/feature-ui/shadcn/table";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@superbuilder/feature-ui/shadcn/dropdown-menu";
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
import { useAdminCourseList, useDeleteCourse, usePublishCourse, useUnpublishCourse } from "../hooks";
import { useTopics } from "../hooks";
import type { CourseStatus } from "../types";

const DEBOUNCE_MS = 300;

export function CourseAdmin() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [topicFilter, setTopicFilter] = useState<string>("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data: courseData, isLoading, isError, refetch } = useAdminCourseList({
    page,
    limit: 20,
    status: (statusFilter as "draft" | "published") || undefined,
    topicId: topicFilter || undefined,
    search: debouncedSearch || undefined,
  });
  const { data: topics } = useTopics();
  const deleteCourse = useDeleteCourse();
  const publishCourse = usePublishCourse();
  const unpublishCourse = useUnpublishCourse();

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteCourse.mutate(
      { id: deleteTarget.id },
      {
        onSuccess: () => {
          toast.success("강의가 삭제되었습니다.");
          setDeleteTarget(null);
        },
        onError: () => toast.error("삭제에 실패했습니다."),
      },
    );
  };

  const handleTogglePublish = (id: string, currentStatus: CourseStatus) => {
    if (currentStatus === "draft") {
      publishCourse.mutate(
        { id },
        {
          onSuccess: () => toast.success("강의가 발행되었습니다."),
          onError: (error) => toast.error(error.message || "최소 1개 섹션과 1개 레슨이 필요합니다."),
        },
      );
    } else {
      unpublishCourse.mutate(
        { id },
        {
          onSuccess: () => toast.success("강의가 미발행되었습니다."),
          onError: () => toast.error("미발행에 실패했습니다."),
        },
      );
    }
  };

  const hasFilter = !!debouncedSearch || !!statusFilter || !!topicFilter;

  return (
    <div className="space-y-6">
      <PageHeader
        title="강의 관리"
        description="강의를 생성, 수정, 발행할 수 있습니다."
        icon={<GraduationCap className="size-6" />}
        actions={
          <Button onClick={() => navigate({ to: "/course/new" })}>
            <Plus className="mr-2 size-4" />
            새 강의
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="강의 검색..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v: string | null) => { setStatusFilter(v ?? ""); setPage(1); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">전체</SelectItem>
            <SelectItem value="draft">초안</SelectItem>
            <SelectItem value="published">발행됨</SelectItem>
          </SelectContent>
        </Select>
        <Select value={topicFilter} onValueChange={(v: string | null) => { setTopicFilter(v ?? ""); setPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="주제" />
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
      </div>

      {/* Table */}
      {isLoading ? (
        <TableSkeleton />
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <p className="text-muted-foreground">목록을 불러올 수 없습니다</p>
          <Button variant="outline" onClick={() => refetch()}>다시 시도</Button>
        </div>
      ) : !courseData?.items?.length ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 border border-dashed rounded-lg">
          <p className="text-muted-foreground">
            {hasFilter ? "조건에 맞는 강의가 없습니다" : "등록된 강의가 없습니다"}
          </p>
          {hasFilter ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSearchInput(""); setStatusFilter(""); setTopicFilter(""); }}
            >
              필터 초기화
            </Button>
          ) : (
            <Button size="sm" onClick={() => navigate({ to: "/course/new" })}>
              <Plus className="mr-2 size-4" />
              강의 추가
            </Button>
          )}
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[300px]">제목</TableHead>
                <TableHead>주제</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-right">레슨</TableHead>
                <TableHead className="text-right">수강생</TableHead>
                <TableHead>작성일</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {courseData.items.map((course) => (
                <TableRow key={course.id}>
                  <TableCell>
                    <button
                      type="button"
                      className="font-medium text-left hover:text-primary transition-colors hover:underline"
                      onClick={() => navigate({ to: "/course/$courseId", params: { courseId: course.id } })}
                    >
                      {course.title}
                    </button>
                  </TableCell>
                  <TableCell>
                    {course.topic?.name ? (
                      <Badge variant="outline" className="text-xs">{course.topic.name}</Badge>
                    ) : "-"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={course.status as CourseStatus} />
                  </TableCell>
                  <TableCell className="text-right">{course.totalLessons}</TableCell>
                  <TableCell className="text-right">{course.enrollmentCount ?? 0}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {course.createdAt
                      ? new Date(course.createdAt).toLocaleDateString("ko-KR")
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => navigate({ to: "/course/$courseId", params: { courseId: course.id } })}
                        >
                          <Pencil className="size-4 mr-2" />
                          수정
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => navigate({ to: "/course/$courseId", params: { courseId: course.id } })}
                        >
                          <BookOpen className="size-4 mr-2" />
                          커리큘럼
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => navigate({ to: "/course/$courseId", params: { courseId: course.id } })}
                        >
                          <Users className="size-4 mr-2" />
                          수강생
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleTogglePublish(course.id, course.status as CourseStatus)}
                        >
                          {course.status === "published" ? (
                            <><EyeOff className="size-4 mr-2" />미발행</>
                          ) : (
                            <><Eye className="size-4 mr-2" />발행하기</>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeleteTarget({ id: course.id, title: course.title })}
                        >
                          <Trash2 className="size-4 mr-2" />
                          삭제
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {courseData.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                이전
              </Button>
              {Array.from({ length: Math.min(courseData.totalPages, 7) }, (_, i) => i + 1).map((p) => (
                <Button
                  key={p}
                  variant={p === page ? "default" : "ghost"}
                  size="icon"
                  className="size-8 text-sm"
                  onClick={() => setPage(p)}
                >
                  {p}
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                disabled={page >= courseData.totalPages}
                onClick={() => setPage(page + 1)}
              >
                다음
              </Button>
            </div>
          )}
        </>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>강의 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleteTarget?.title}&quot;을(를) 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleteCourse.isPending}>
              {deleteCourse.isPending ? "삭제 중..." : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

function StatusBadge({ status }: { status: CourseStatus }) {
  return status === "published" ? (
    <Badge variant="default">발행됨</Badge>
  ) : (
    <Badge variant="secondary">초안</Badge>
  );
}

function TableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[300px]">제목</TableHead>
          <TableHead>주제</TableHead>
          <TableHead>상태</TableHead>
          <TableHead className="text-right">레슨</TableHead>
          <TableHead className="text-right">수강생</TableHead>
          <TableHead>작성일</TableHead>
          <TableHead className="w-[60px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-48" /></TableCell>
            <TableCell><Skeleton className="h-5 w-16" /></TableCell>
            <TableCell><Skeleton className="h-5 w-14" /></TableCell>
            <TableCell className="text-right"><Skeleton className="h-4 w-8 ml-auto" /></TableCell>
            <TableCell className="text-right"><Skeleton className="h-4 w-8 ml-auto" /></TableCell>
            <TableCell><Skeleton className="h-4 w-20" /></TableCell>
            <TableCell><Skeleton className="h-8 w-8" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

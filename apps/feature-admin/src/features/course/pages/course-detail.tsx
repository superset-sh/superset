/**
 * Course Detail Page - 강의 상세/수정 (탭: 정보, 커리큘럼, 수강생, 첨부파일)
 * SCR-COURSE-007
 */
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "@tanstack/react-router";
import { Save, Eye, EyeOff, ChevronRight } from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@superbuilder/feature-ui/shadcn/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@superbuilder/feature-ui/shadcn/tabs";
import { TipTapEditor } from "@superbuilder/feature-ui/editor/tiptap-editor";
import { PageHeader } from "@superbuilder/feature-ui/components/page-header";
import { toast } from "sonner";
import {
  useAdminCourseById,
  useUpdateCourse,
  usePublishCourse,
  useUnpublishCourse,
  useTopics,
} from "../hooks";
import { CurriculumEditor } from "./curriculum-editor";
import { StudentList } from "./student-list";
import { AttachmentManager } from "./attachment-manager";
import type { CourseTab } from "../types";

export function CourseDetail() {
  const { courseId } = useParams({ strict: false });
  const navigate = useNavigate();
  const { data: course, isLoading } = useAdminCourseById(courseId ?? "");
  const updateCourse = useUpdateCourse();
  const publishCourse = usePublishCourse();
  const unpublishCourse = useUnpublishCourse();
  const [activeTab, setActiveTab] = useState<CourseTab>("info");

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
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

  const isPublished = course.status === "published";

  const handleTogglePublish = () => {
    const mutation = isPublished ? unpublishCourse : publishCourse;
    mutation.mutate(
      { id: course.id },
      {
        onSuccess: () => toast.success(isPublished ? "미발행되었습니다." : "발행되었습니다."),
        onError: (error) => toast.error(error.message || "작업에 실패했습니다."),
      },
    );
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <button className="hover:text-foreground transition-colors" onClick={() => navigate({ to: "/course" })}>
          강의 관리
        </button>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium truncate max-w-[200px]">{course.title}</span>
      </nav>

      <PageHeader
        title={course.title}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={isPublished ? "default" : "secondary"}>
              {isPublished ? "발행됨" : "초안"}
            </Badge>
            <Button variant="outline" onClick={handleTogglePublish}>
              {isPublished ? <EyeOff className="mr-2 size-4" /> : <Eye className="mr-2 size-4" />}
              {isPublished ? "미발행" : "발행"}
            </Button>
          </div>
        }
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as CourseTab)}>
        <TabsList>
          <TabsTrigger value="info">기본 정보</TabsTrigger>
          <TabsTrigger value="curriculum">커리큘럼</TabsTrigger>
          <TabsTrigger value="students">수강생</TabsTrigger>
          <TabsTrigger value="attachments">첨부파일</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-6">
          <CourseInfoForm course={course} onUpdate={updateCourse} />
        </TabsContent>

        <TabsContent value="curriculum" className="mt-6">
          <CurriculumEditor courseId={course.id} />
        </TabsContent>

        <TabsContent value="students" className="mt-6">
          <StudentList courseId={course.id} />
        </TabsContent>

        <TabsContent value="attachments" className="mt-6">
          <AttachmentManager courseId={course.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * CourseInfoForm
 * -----------------------------------------------------------------------------------------------*/

interface CourseInfoFormProps {
  course: {
    id: string;
    title: string;
    slug: string;
    summary: string | null;
    estimatedMinutes: number | null;
    topicId?: string | null;
    content?: unknown;
    thumbnailUrl?: string | null;
  };
  onUpdate: ReturnType<typeof useUpdateCourse>;
}

function CourseInfoForm({ course, onUpdate }: CourseInfoFormProps) {
  const { data: topics } = useTopics(false);
  const [title, setTitle] = useState(course.title);
  const [slug, setSlug] = useState(course.slug);
  const [summary, setSummary] = useState(course.summary ?? "");
  const [estimatedMinutes, setEstimatedMinutes] = useState(
    course.estimatedMinutes?.toString() ?? "",
  );
  const [topicId, setTopicId] = useState(course.topicId ?? "");
  const [content, setContent] = useState<Record<string, unknown> | undefined>(
    course.content as Record<string, unknown> | undefined,
  );
  const [thumbnailUrl, setThumbnailUrl] = useState(course.thumbnailUrl ?? "");

  useEffect(() => {
    setTitle(course.title);
    setSlug(course.slug);
    setSummary(course.summary ?? "");
    setEstimatedMinutes(course.estimatedMinutes?.toString() ?? "");
    setTopicId(course.topicId ?? "");
    setContent(course.content as Record<string, unknown> | undefined);
    setThumbnailUrl(course.thumbnailUrl ?? "");
  }, [course]);

  const handleSave = () => {
    onUpdate.mutate(
      {
        id: course.id,
        data: {
          title,
          slug,
          summary: summary || null,
          estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : null,
          topicId: topicId || undefined,
          content,
          thumbnailUrl: thumbnailUrl || null,
        },
      },
      {
        onSuccess: () => toast.success("강의 정보가 저장되었습니다."),
        onError: (error) => {
          if (error.message?.includes("slug") || error.message?.includes("409")) {
            toast.error("이미 사용 중인 URL 주소입니다.");
          } else {
            toast.error("저장에 실패했습니다. 다시 시도해주세요.");
          }
        },
      },
    );
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label>주제</Label>
          <Select value={topicId} onValueChange={(v: string | null) => setTopicId(v ?? "")}>
            <SelectTrigger>
              <SelectValue placeholder="주제를 선택하세요" />
            </SelectTrigger>
            <SelectContent>
              {topics?.map((topic) => (
                <SelectItem key={topic.id} value={topic.id}>
                  {topic.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>예상 수강 시간 (분)</Label>
          <Input
            type="number"
            value={estimatedMinutes}
            onChange={(e) => setEstimatedMinutes(e.target.value)}
            min={1}
            placeholder="예: 120"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>강의 제목 <span className="text-destructive">*</span></Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
      </div>

      <div className="space-y-2">
        <Label>Slug</Label>
        <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="url-friendly-name" />
        <p className="text-xs text-muted-foreground">URL에 사용되는 식별자입니다.</p>
      </div>

      <div className="space-y-2">
        <Label>요약</Label>
        <Textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="강의에 대한 간단한 설명 (최대 500자)"
        />
      </div>

      <div className="space-y-2">
        <Label>썸네일 URL</Label>
        <Input
          value={thumbnailUrl}
          onChange={(e) => setThumbnailUrl(e.target.value)}
          placeholder="https://..."
        />
        {thumbnailUrl && (
          <div className="w-48 aspect-video rounded-md overflow-hidden bg-muted">
            <img
              src={thumbnailUrl}
              alt="썸네일 미리보기"
              className="size-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label>강의 설명 (상세)</Label>
        <TipTapEditor
          content={content}
          onChange={setContent}
          placeholder="강의에 대한 상세 설명을 작성하세요..."
          toolbar="full"
          minHeight="300px"
        />
      </div>

      <Button onClick={handleSave} disabled={onUpdate.isPending}>
        <Save className="mr-2 size-4" />
        {onUpdate.isPending ? "저장 중..." : "저장"}
      </Button>
    </div>
  );
}

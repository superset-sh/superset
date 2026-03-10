/**
 * Course Create Page - 강의 생성
 * SCR-COURSE-007
 */
import { useState, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@superbuilder/feature-ui/shadcn/select";
import { TipTapEditor } from "@superbuilder/feature-ui/editor/tiptap-editor";
import { PageHeader } from "@superbuilder/feature-ui/components/page-header";
import { toast } from "sonner";
import { useCreateCourse } from "../hooks";
import { useTopics } from "../hooks";

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9가-힣\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function CourseCreate() {
  const navigate = useNavigate();
  const { data: topics } = useTopics(false);
  const createCourse = useCreateCourse();

  const [topicId, setTopicId] = useState("");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [content, setContent] = useState<Record<string, unknown> | undefined>();
  const slugManuallyEdited = useRef(false);

  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (!slugManuallyEdited.current) {
      setSlug(toSlug(value));
    }
  };

  const handleSlugChange = (value: string) => {
    slugManuallyEdited.current = true;
    setSlug(value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!topicId) {
      toast.error("주제를 선택해주세요.");
      return;
    }
    if (!title.trim()) {
      toast.error("강의 제목을 입력해주세요.");
      return;
    }

    createCourse.mutate(
      {
        topicId,
        title,
        summary: summary || undefined,
        estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : undefined,
        thumbnailUrl: thumbnailUrl || undefined,
        content,
      },
      {
        onSuccess: (data) => {
          toast.success("강의가 생성되었습니다.");
          navigate({ to: "/course/$courseId", params: { courseId: data.id } });
        },
        onError: (error) => {
          if (error.message?.includes("slug") || error.message?.includes("409")) {
            toast.error("이미 사용 중인 URL 주소입니다.");
          } else {
            toast.error("생성에 실패했습니다.");
          }
        },
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
        <span className="text-foreground font-medium">새 강의</span>
      </nav>

      <PageHeader title="강의 생성" description="새로운 강의를 생성합니다." />

      <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label>주제 <span className="text-destructive">*</span></Label>
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
              placeholder="예: 120"
              min={1}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>강의 제목 <span className="text-destructive">*</span></Label>
          <Input
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="예: React 완전 정복"
            maxLength={200}
          />
        </div>

        <div className="space-y-2">
          <Label>Slug</Label>
          <Input
            value={slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            placeholder="자동 생성됩니다"
          />
          <p className="text-xs text-muted-foreground">URL에 사용되는 식별자입니다. 비워두면 자동 생성됩니다.</p>
        </div>

        <div className="space-y-2">
          <Label>요약</Label>
          <Textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="강의에 대한 간단한 설명 (최대 500자)"
            rows={3}
            maxLength={500}
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

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={createCourse.isPending}>
            {createCourse.isPending ? "생성 중..." : "강의 생성"}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/course" })}>
            취소
          </Button>
        </div>
      </form>
    </div>
  );
}

/**
 * ContentEditor - 마케팅 콘텐츠 작성/편집
 */
import { useState, useEffect } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import {
  useMarketingContentById,
  useCreateMarketingContent,
  useUpdateMarketingContent,
} from "../hooks";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@superbuilder/feature-ui/shadcn/resizable";
import { ArrowLeft, Save } from "lucide-react";
import { PlatformPreview } from "../components/platform-preview";

interface Props {
  contentId?: string;
}

export function ContentEditor({ contentId }: Props) {
  const navigate = useNavigate();
  const isEditing = !!contentId;
  const { data: existingContent, isLoading } = useMarketingContentById(contentId ?? "");
  const createContent = useCreateMarketingContent();
  const updateContent = useUpdateMarketingContent();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [tags, setTags] = useState("");

  // 기존 콘텐츠 데이터 로드
  useEffect(() => {
    if (existingContent) {
      setTitle(existingContent.title ?? "");
      setBody(existingContent.body ?? "");
      setLinkUrl(existingContent.linkUrl ?? "");
      setTags(existingContent.tags?.join(", ") ?? "");
    }
  }, [existingContent]);

  const handleSave = () => {
    const parsedTags = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    if (isEditing && contentId) {
      updateContent.mutate(
        {
          id: contentId,
          data: {
            title: title.trim(),
            body: body.trim(),
            linkUrl: linkUrl.trim() || undefined,
            tags: parsedTags.length > 0 ? parsedTags : undefined,
          },
        },
        { onSuccess: () => navigate({ to: "/marketing" }) },
      );
    } else {
      createContent.mutate(
        {
          title: title.trim(),
          body: body.trim(),
          linkUrl: linkUrl.trim() || undefined,
          tags: parsedTags.length > 0 ? parsedTags : undefined,
        },
        { onSuccess: () => navigate({ to: "/marketing" }) },
      );
    }
  };

  const isPending = createContent.isPending || updateContent.isPending;

  if (isEditing && isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/marketing">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />
            목록으로
          </Button>
        </Link>
        <Button onClick={handleSave} disabled={isPending || !title.trim() || !body.trim()}>
          <Save className="mr-1 h-4 w-4" />
          {isPending ? "저장 중..." : "저장"}
        </Button>
      </div>

      <ResizablePanelGroup orientation="horizontal" className="min-h-[600px] rounded-lg border">
        {/* 좌측: 에디터 */}
        <ResizablePanel defaultSize={60} minSize={40}>
          <div className="p-6 space-y-4 h-full overflow-y-auto">
            <div className="space-y-2">
              <Label>제목</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="콘텐츠 제목"
              />
            </div>

            <div className="space-y-2">
              <Label>본문</Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="콘텐츠 본문을 입력하세요..."
                rows={12}
                className="min-h-[300px]"
              />
            </div>

            <div className="space-y-2">
              <Label>링크 URL (선택)</Label>
              <Input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://example.com"
                type="url"
              />
            </div>

            <div className="space-y-2">
              <Label>태그 (콤마로 구분)</Label>
              <Input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="태그1, 태그2, 태그3"
              />
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* 우측: 플랫폼 미리보기 */}
        <ResizablePanel defaultSize={40} minSize={30}>
          <div className="p-6 space-y-4 h-full overflow-y-auto bg-muted/30">
            <h3 className="text-sm font-medium text-muted-foreground">플랫폼별 미리보기</h3>
            {PREVIEW_PLATFORMS.map((platform) => (
              <PlatformPreview
                key={platform}
                platform={platform}
                title={title}
                body={body}
              />
            ))}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const PREVIEW_PLATFORMS = ["x", "instagram", "facebook", "linkedin", "threads"];

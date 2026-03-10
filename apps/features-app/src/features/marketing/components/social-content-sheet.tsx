/**
 * SocialContentSheet - 소셜 콘텐츠 작성 및 발행 Sheet
 *
 * 다른 Feature에서 소스 콘텐츠를 소셜 미디어로 발행할 때 사용하는 위젯
 */
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@superbuilder/feature-ui/shadcn/sheet";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { Send } from "lucide-react";
import { PlatformSelector } from "./platform-selector";
import { PlatformPreview } from "./platform-preview";
import { useSocialPublish } from "../hooks/use-social-publish";

interface Props {
  targetType: string;
  targetId: string;
  defaultTitle?: string;
  defaultDescription?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SocialContentSheet({
  targetType,
  targetId,
  defaultTitle,
  defaultDescription,
  open,
  onOpenChange,
}: Props) {
  const [title, setTitle] = useState(defaultTitle ?? "");
  const [body, setBody] = useState(defaultDescription ?? "");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const { createFromSource, publishNow } = useSocialPublish();

  const handlePublish = async () => {
    if (selectedPlatforms.length === 0) return;

    // 소스 콘텐츠에서 마케팅 콘텐츠 초안 생성
    const sourceType = targetType as "board_post" | "community_post" | "content_studio";
    const content = await createFromSource.mutateAsync({
      sourceType,
      sourceId: targetId,
    });

    if (!content?.id) return;

    // 발행 (계정 ID는 빈 레코드로 전달 — 서버에서 기본 계정 사용)
    const accountIds: Record<string, string> = {};
    await publishNow.mutateAsync({
      contentId: content.id,
      platforms: selectedPlatforms as Array<"facebook" | "instagram" | "threads" | "x" | "linkedin">,
      accountIds,
    });

    onOpenChange(false);
  };

  const isPending = createFromSource.isPending || publishNow.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>소셜 발행</SheetTitle>
          <SheetDescription>
            콘텐츠를 SNS 플랫폼에 발행합니다.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* 플랫폼 선택 */}
          <div className="space-y-2">
            <Label>발행 플랫폼</Label>
            <PlatformSelector
              selected={selectedPlatforms}
              onChange={setSelectedPlatforms}
            />
          </div>

          <Separator />

          {/* 콘텐츠 편집 */}
          <div className="space-y-4">
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
                placeholder="본문을 입력하세요..."
                rows={6}
              />
            </div>
          </div>

          <Separator />

          {/* 플랫폼별 미리보기 */}
          {selectedPlatforms.length > 0 && (
            <div className="space-y-3">
              <Label>미리보기</Label>
              {selectedPlatforms.map((platform) => (
                <PlatformPreview
                  key={platform}
                  platform={platform}
                  title={title}
                  body={body}
                />
              ))}
            </div>
          )}

          {/* 발행 버튼 */}
          <Button
            onClick={handlePublish}
            disabled={isPending || selectedPlatforms.length === 0}
            className="w-full"
          >
            <Send className="mr-2 h-4 w-4" />
            {isPending ? "발행 중..." : "지금 발행"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

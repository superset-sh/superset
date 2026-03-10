/**
 * SocialPublishButton - 소셜 발행 위젯 버튼
 *
 * 다른 Feature 페이지에서 소셜 발행 Sheet를 열기 위한 트리거 버튼
 */
import { useState } from "react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Share2 } from "lucide-react";
import { SocialContentSheet } from "./social-content-sheet";

interface Props {
  targetType: string;
  targetId: string;
  defaultTitle?: string;
  defaultDescription?: string;
}

export function SocialPublishButton({
  targetType,
  targetId,
  defaultTitle,
  defaultDescription,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Share2 className="mr-2 h-4 w-4" />
        소셜 발행
      </Button>
      <SocialContentSheet
        targetType={targetType}
        targetId={targetId}
        defaultTitle={defaultTitle}
        defaultDescription={defaultDescription}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

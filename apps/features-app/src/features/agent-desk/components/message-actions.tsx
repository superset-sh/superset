import { useState } from "react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superbuilder/feature-ui/shadcn/tooltip";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { Copy, Check, RefreshCw, ThumbsUp, ThumbsDown } from "lucide-react";
import { toast } from "sonner";
import { useFeatureTranslation } from "@superbuilder/features-client/core/i18n";
import { useUpdateMessageFeedback } from "../hooks";

type FeedbackValue = "like" | "dislike" | null;

interface Props {
  content: string;
  variant: "user" | "assistant";
  isLastAssistant?: boolean;
  onRegenerate?: () => void;
  messageId?: string;
  sessionId?: string;
  initialFeedback?: FeedbackValue;
}

export function MessageActions({
  content,
  variant,
  isLastAssistant,
  onRegenerate,
  messageId,
  sessionId,
  initialFeedback = null,
}: Props) {
  const { t } = useFeatureTranslation("agent-desk");
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackValue>(initialFeedback);

  const feedbackMutation = useUpdateMessageFeedback(sessionId ?? "");

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    toast.success(t("copiedToClipboard"));
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFeedback = (type: "like" | "dislike") => {
    const next: FeedbackValue = feedback === type ? null : type;
    const previous = feedback;
    setFeedback(next);

    if (messageId) {
      feedbackMutation.mutate(
        { messageId, feedback: next },
        { onError: () => setFeedback(previous) },
      );
    }
  };

  return (
    <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/message:opacity-100">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button variant="ghost" size="icon" className="size-7" onClick={handleCopy} />
          }
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </TooltipTrigger>
        <TooltipContent>{t("copyMessage")}</TooltipContent>
      </Tooltip>

      {variant === "assistant" && (
        <>
          {isLastAssistant && onRegenerate && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button variant="ghost" size="icon" className="size-7" onClick={onRegenerate} />
                }
              >
                <RefreshCw className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent>{t("regenerateMessage")}</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => handleFeedback("like")}
                />
              }
            >
              <ThumbsUp
                className={cn("size-3.5", feedback === "like" && "fill-current text-foreground")}
              />
            </TooltipTrigger>
            <TooltipContent>{t("likeMessage")}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => handleFeedback("dislike")}
                />
              }
            >
              <ThumbsDown
                className={cn("size-3.5", feedback === "dislike" && "fill-current text-foreground")}
              />
            </TooltipTrigger>
            <TooltipContent>{t("dislikeMessage")}</TooltipContent>
          </Tooltip>
        </>
      )}
    </div>
  );
}

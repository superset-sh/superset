/**
 * Task Comment Input - 댓글 입력 컴포넌트
 */
import { useState } from "react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { useCreateComment } from "../hooks";

interface Props {
  taskId: string;
}

export function TaskCommentInput({ taskId }: Props) {
  const [content, setContent] = useState("");
  const createComment = useCreateComment(taskId);

  const handleSubmit = () => {
    const trimmed = content.trim();
    if (!trimmed) return;

    createComment.mutate(
      { taskId, content: trimmed },
      {
        onSuccess: () => {
          setContent("");
        },
        onError: () => {
          toast.error("Failed to post comment.");
        },
      },
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        aria-label="Write a comment"
        placeholder="Write a comment... (Cmd+Enter to submit)"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={3}
        className="resize-none"
        disabled={createComment.isPending}
      />
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={!content.trim() || createComment.isPending}
          onClick={handleSubmit}
          className="gap-1.5"
        >
          <Send className="size-3.5" />
          {createComment.isPending ? "Sending..." : "Comment"}
        </Button>
      </div>
    </div>
  );
}

import { useState } from "react";
import { Reply, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Avatar, AvatarFallback } from "@superbuilder/feature-ui/shadcn/avatar";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { VoteButtons } from "./vote-buttons";
import { ReactionSection } from "@superbuilder/widgets/reaction";
import type { CommunityComment } from "@superbuilder/drizzle";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { useCreateComment } from "../hooks";

interface CommentItemProps {
  comment: CommunityComment;
  depth?: number;
  replies?: CommunityComment[];
}

export function CommentItem({ comment, depth = 0, replies = [] }: CommentItemProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyText, setReplyText] = useState("");
  const createComment = useCreateComment();
  const timeAgo = formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true, locale: ko });

  const handleSubmitReply = () => {
    if (!replyText.trim()) return;

    createComment.mutate(
      {
        postId: comment.postId,
        content: replyText,
        parentId: comment.id,
      },
      {
        onSuccess: () => {
          setReplyText("");
          setShowReplyForm(false);
        },
      }
    );
  };

  const borderColors = [
    "border-blue-500/30",
    "border-green-500/30",
    "border-yellow-500/30",
    "border-red-500/30",
    "border-purple-500/30",
    "border-pink-500/30",
  ];

  return (
    <div
      className={cn(
        "relative",
        depth > 0 && "ml-4 pl-4 border-l-2",
        depth > 0 && borderColors[depth % borderColors.length]
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center gap-1.5 hover:text-foreground transition-colors"
        >
          {isCollapsed ? <ChevronDown className="size-3" /> : <ChevronUp className="size-3" />}
          <Avatar size="sm" className="size-5">
            <AvatarFallback className="text-[9px]">U</AvatarFallback>
          </Avatar>
          <span className="font-semibold text-foreground">작성자</span>
        </button>
        {comment.distinguished && (
          <Badge variant="outline" className="text-green-600 border-green-200 dark:border-green-800 py-0 px-1.5 text-[10px]">
            MOD
          </Badge>
        )}
        <span className="text-muted-foreground/40">·</span>
        <span>{timeAgo}</span>
        {comment.isEdited && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <span className="italic">수정됨</span>
          </>
        )}
        {comment.isStickied && (
          <Badge variant="outline" className="text-green-600 border-green-200 dark:border-green-800 py-0 px-1.5 text-[10px]">
            고정
          </Badge>
        )}
      </div>

      {!isCollapsed && (
        <>
          {/* Content */}
          <div className="mb-2 ml-7">
            {comment.isDeleted ? (
              <p className="text-muted-foreground italic text-sm">[삭제된 댓글]</p>
            ) : comment.isRemoved ? (
              <p className="text-muted-foreground italic text-sm">[운영 정책에 의해 삭제됨]</p>
            ) : (
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{comment.content}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 mb-3 ml-5">
            <VoteButtons
              targetType="comment"
              targetId={comment.id}
              voteScore={comment.voteScore}
              upvoteCount={comment.upvoteCount}
              downvoteCount={comment.downvoteCount}
              size="sm"
            />
            <ReactionSection targetType="community_comment" targetId={comment.id} />
            <Button
              size="xs"
              variant="ghost"
              className="gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => setShowReplyForm(!showReplyForm)}
            >
              <Reply className="size-3" />
              <span>답글</span>
            </Button>
          </div>

          {/* Reply Form */}
          {showReplyForm && (
            <div className="mb-4 ml-7 p-3 rounded-lg bg-muted/30 border">
              <Textarea
                placeholder="답글을 입력하세요..."
                className="min-h-20"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
              />
              <div className="flex items-center gap-2 mt-2 justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowReplyForm(false);
                    setReplyText("");
                  }}
                >
                  취소
                </Button>
                <Button
                  size="sm"
                  onClick={handleSubmitReply}
                  disabled={!replyText.trim() || createComment.isPending}
                >
                  {createComment.isPending ? "등록 중..." : "답글 등록"}
                </Button>
              </div>
            </div>
          )}

          {/* Replies */}
          {replies.length > 0 && (
            <div className="space-y-3">
              {replies.map((reply) => (
                <CommentItem key={reply.id} comment={reply} depth={depth + 1} />
              ))}
            </div>
          )}
        </>
      )}

      {isCollapsed && (
        <p className="text-xs text-muted-foreground ml-7 mb-3">
          답글 {comment.replyCount}개 접힘
        </p>
      )}
    </div>
  );
}

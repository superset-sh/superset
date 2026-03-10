import { useCallback, useEffect, useMemo, useState } from "react";
import type { CommunityComment } from "@superbuilder/drizzle";
import { TipTapEditor } from "@superbuilder/feature-ui/editor/tiptap-editor";
import { TipTapViewer } from "@superbuilder/feature-ui/editor/tiptap-viewer";
import { cn } from "@superbuilder/feature-ui/lib/utils";
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
import { Avatar, AvatarFallback } from "@superbuilder/feature-ui/shadcn/avatar";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { ChevronDown, ChevronUp, Reply } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ReactionSection } from "@superbuilder/widgets/reaction";
import { useCreateComment } from "../hooks";
import type { KarmaSummary } from "../hooks/use-karma";
import { extractPlainText, isRichContent } from "../utils/content-helpers";
import { KarmaBadge } from "./karma-badge";
import { VoteButtons } from "./vote-buttons";

export type CommentWithAuthor = Omit<CommunityComment, 'createdAt' | 'updatedAt' | 'editedAt'> & { createdAt: Date | string; updatedAt: Date | string; editedAt?: Date | string | null; authorName?: string | null };

interface CommentItemProps {
  comment: CommentWithAuthor;
  depth?: number;
  allComments: CommentWithAuthor[];
  karmaMap?: Map<string, KarmaSummary>;
}

export function CommentItem({ comment, depth = 0, allComments, karmaMap }: CommentItemProps) {
  const [isCollapsed, setIsCollapsed] = useState(depth >= 3);
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyContent, setReplyContent] = useState<Record<string, unknown> | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const createComment = useCreateComment();
  const timeAgo = formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true, locale: ko });
  const shouldFlatten = depth >= 4;
  const karma = karmaMap?.get(comment.authorId);
  const authorName = comment.authorName ?? "알 수 없음";

  const replies = useMemo(
    () => allComments.filter((c) => c.parentId === comment.id),
    [allComments, comment.id],
  );

  const handleSubmitReply = () => {
    const content = replyContent ? JSON.stringify(replyContent) : "";
    if (!content.trim() || !extractPlainText(content).trim()) return;

    createComment.mutate(
      {
        postId: comment.postId,
        content,
        parentId: comment.id,
      },
      {
        onSuccess: () => {
          setReplyContent(null);
          setShowReplyForm(false);
        },
      },
    );
  };

  const closeReplyForm = () => {
    setShowReplyForm(false);
    setReplyContent(null);
  };

  const handleCancelReply = useCallback(() => {
    const hasReplyContent = Boolean(
      replyContent && extractPlainText(JSON.stringify(replyContent)).trim(),
    );
    if (hasReplyContent) {
      setShowCancelDialog(true);
      return;
    }
    closeReplyForm();
  }, [replyContent]);

  useEffect(() => {
    if (!showReplyForm) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleCancelReply();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [showReplyForm, handleCancelReply]);

  return (
    <motion.div
      key={comment.id}
      layout
      initial={false}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
      style={{ overflow: "hidden" }}
      className={cn(
        "relative",
        depth > 0 &&
          (shouldFlatten ? "border-border border-l-2 pl-4" : "border-border ml-6 border-l-2 pl-4"),
      )}
    >
      <div className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hover:text-foreground focus-visible:ring-ring flex items-center gap-1.5 rounded transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          {isCollapsed ? <ChevronDown className="size-3" /> : <ChevronUp className="size-3" />}
          <Avatar size="sm" className="size-5">
            <AvatarFallback className="text-[9px]">{authorName.charAt(0)}</AvatarFallback>
          </Avatar>
          <span className="text-foreground font-semibold">{authorName}</span>
        </button>
        {karma && (
          <>
            <span className="text-muted-foreground/40">{"\u00B7"}</span>
            <KarmaBadge karma={karma.totalKarma} />
          </>
        )}
        {comment.distinguished && (
          <Badge
            variant="outline"
            className="border-green-200 px-1.5 py-0 text-[10px] text-green-600 dark:border-green-800"
          >
            MOD
          </Badge>
        )}
        <span className="text-muted-foreground/40">·</span>
        <span>{timeAgo}</span>
        {shouldFlatten && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <span className="text-muted-foreground text-xs italic">↩ 답글</span>
          </>
        )}
        {comment.isEdited && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <span className="italic">수정됨</span>
          </>
        )}
        {comment.isStickied && (
          <Badge
            variant="outline"
            className="border-green-200 px-1.5 py-0 text-[10px] text-green-600 dark:border-green-800"
          >
            고정
          </Badge>
        )}
      </div>

      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
            style={{ overflow: "hidden" }}
          >
            <div className="mb-2 ml-7">
              {comment.isDeleted ? (
                <p className="text-muted-foreground text-sm italic">[삭제된 댓글]</p>
              ) : comment.isRemoved ? (
                <p className="text-muted-foreground text-sm italic">[운영 정책에 의해 삭제됨]</p>
              ) : isRichContent(comment.content) ? (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  {(() => {
                    try {
                      return <TipTapViewer content={JSON.parse(comment.content)} />;
                    } catch {
                      return (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">
                          {comment.content}
                        </p>
                      );
                    }
                  })()}
                </div>
              ) : (
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{comment.content}</p>
              )}
            </div>

            <div className="mb-3 ml-5 flex items-center gap-2">
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
                className="text-muted-foreground hover:text-foreground gap-1"
                onClick={() => setShowReplyForm(!showReplyForm)}
              >
                <Reply className="size-3" />
                <span>답글</span>
              </Button>
            </div>

            <AnimatePresence initial={false}>
              {showReplyForm && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
                  style={{ overflow: "hidden" }}
                >
                  <div className="bg-muted/30 mb-4 ml-7 rounded-lg border p-3">
                    <TipTapEditor
                      placeholder="답글을 입력하세요..."
                      toolbar="compact"
                      minHeight="100px"
                      content={replyContent ?? undefined}
                      onChange={(json) => setReplyContent(json)}
                    />
                    <div className="mt-2 flex items-center justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={handleCancelReply}>
                        취소
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSubmitReply}
                        disabled={
                          !replyContent ||
                          !extractPlainText(JSON.stringify(replyContent)).trim() ||
                          createComment.isPending
                        }
                      >
                        {createComment.isPending ? "등록 중..." : "답글 등록"}
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>답글 작성 취소</AlertDialogTitle>
                  <AlertDialogDescription>
                    작성 중인 내용이 사라집니다. 계속하시겠습니까?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>취소</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      closeReplyForm();
                      setShowCancelDialog(false);
                    }}
                  >
                    확인
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {replies.length > 0 && (
              <div className="space-y-3">
                {replies.map((reply) => (
                  <CommentItem
                    key={reply.id}
                    comment={reply}
                    depth={depth + 1}
                    allComments={allComments}
                    karmaMap={karmaMap}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {isCollapsed && replies.length > 0 && (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring mb-3 ml-7 rounded text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
          onClick={() => setIsCollapsed(false)}
        >
          ▼ {replies.length}개 답글 더 보기
        </button>
      )}
    </motion.div>
  );
}

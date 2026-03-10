/**
 * Comment List - 댓글 목록 (Connected)
 *
 * 내부에서 대댓글 조회를 수행하며, 부모 CommentSection에서
 * root 댓글 목록과 mutation 콜백을 전달받습니다.
 */
import { useState } from "react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { ChevronDown, ChevronUp, MessageSquare } from "lucide-react";
import { useCreateComment } from "../hooks/use-comment-mutations";
import { useCommentReplies } from "../hooks/use-comments";
import type { CommentTargetType, CommentWithAuthor } from "../types";
import { CommentForm } from "./comment-form";
import { CommentItem } from "./comment-item";

interface CommentListProps {
  /** 댓글 목록 (root comments) */
  comments: CommentWithAuthor[];
  /** 더 불러올 댓글이 있는지 */
  hasMore?: boolean;
  /** 로딩 상태 */
  isLoading?: boolean;
  /** 에러 */
  error?: unknown;
  /** 현재 사용자 정보 */
  currentUser?: {
    id: string;
    name: string;
    avatar?: string | null;
  } | null;
  /** 타겟 정보 (대댓글 생성 시 필요) */
  targetType: CommentTargetType;
  targetId: string;
  /** 더 보기 클릭 */
  onLoadMore?: () => void;
  /** 댓글 수정 */
  onEdit?: (commentId: string, content: string) => void;
  /** 댓글 삭제 */
  onDelete?: (commentId: string) => void;
}

export function CommentList({
  comments,
  hasMore,
  isLoading,
  error,
  currentUser,
  targetType,
  targetId,
  onLoadMore,
  onEdit,
  onDelete,
}: CommentListProps) {
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());

  const createReplyMutation = useCreateComment({ targetType, targetId });

  const handleToggleReplies = (parentId: string) => {
    const newExpanded = new Set(expandedReplies);
    if (newExpanded.has(parentId)) {
      newExpanded.delete(parentId);
    } else {
      newExpanded.add(parentId);
    }
    setExpandedReplies(newExpanded);
  };

  const handleReplySubmit = (parentId: string, content: string) => {
    createReplyMutation.mutate(
      {
        targetType,
        targetId,
        content,
        parentId,
      },
      {
        onSuccess: () => {
          setReplyingTo(null);
          // Expand replies to show the new reply
          setExpandedReplies((prev) => new Set([...prev, parentId]));
        },
      },
    );
  };

  if (isLoading) {
    return <CommentListSkeleton />;
  }

  if (error) {
    return (
      <div className="py-8 text-center">
        <p className="text-destructive">댓글을 불러오는데 실패했습니다.</p>
      </div>
    );
  }

  if (comments.length === 0) {
    return (
      <div className="py-8 text-center">
        <MessageSquare className="text-muted-foreground mx-auto h-12 w-12" />
        <p className="text-muted-foreground mt-2">아직 댓글이 없습니다.</p>
        <p className="text-muted-foreground text-sm">첫 번째 댓글을 남겨보세요!</p>
      </div>
    );
  }

  return (
    <div className="divide-y">
      {comments.map((comment) => {
        const isExpanded = expandedReplies.has(comment.id);

        return (
          <CommentItem
            key={comment.id}
            comment={comment}
            currentUserId={currentUser?.id}
            onReply={() => setReplyingTo(comment.id)}
            onEdit={onEdit}
            onDelete={onDelete}
          >
            {/* 답글 토글 버튼 */}
            <RepliesToggle
              parentId={comment.id}
              isExpanded={isExpanded}
              onToggle={handleToggleReplies}
            />

            {/* 답글 목록 */}
            {isExpanded ? (
              <RepliesSection
                parentId={comment.id}
                currentUserId={currentUser?.id}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ) : null}

            {/* 답글 폼 */}
            {replyingTo === comment.id ? (
              <div className="mt-2 ml-4">
                <CommentForm
                  currentUser={currentUser}
                  isReply
                  isLoading={createReplyMutation.isPending}
                  onSubmit={(content) => handleReplySubmit(comment.id, content)}
                  onCancel={() => setReplyingTo(null)}
                />
              </div>
            ) : null}
          </CommentItem>
        );
      })}

      {hasMore && onLoadMore ? (
        <div className="pt-4 text-center">
          <Button variant="outline" onClick={onLoadMore}>
            더 보기
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/* Components */

function CommentListSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface RepliesToggleProps {
  parentId: string;
  isExpanded: boolean;
  onToggle: (parentId: string) => void;
}

function RepliesToggle({ parentId, isExpanded, onToggle }: RepliesToggleProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="mt-2 h-7 px-2 text-xs"
      onClick={() => onToggle(parentId)}
    >
      {isExpanded ? (
        <>
          <ChevronUp className="mr-1 h-3 w-3" />
          답글 숨기기
        </>
      ) : (
        <>
          <ChevronDown className="mr-1 h-3 w-3" />
          답글 보기
        </>
      )}
    </Button>
  );
}

interface RepliesSectionProps {
  parentId: string;
  currentUserId?: string | null;
  onEdit?: (commentId: string, content: string) => void;
  onDelete?: (commentId: string) => void;
}

function RepliesSection({ parentId, currentUserId, onEdit, onDelete }: RepliesSectionProps) {
  const repliesQuery = useCommentReplies(parentId);

  return (
    <div className="mt-2 ml-4 border-l-2 pl-4">
      {repliesQuery.isLoading ? (
        <div className="py-2">
          <Skeleton className="h-4 w-full" />
        </div>
      ) : (
        (repliesQuery.data?.items ?? []).map((reply) => (
          <CommentItem
            key={reply.id}
            comment={reply}
            currentUserId={currentUserId}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))
      )}
    </div>
  );
}

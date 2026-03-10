/**
 * Comment Item - 개별 댓글 표시 (Presentational)
 */
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@superbuilder/feature-ui/shadcn/avatar";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@superbuilder/feature-ui/shadcn/dropdown-menu";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { MessageSquare, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { CommentWithAuthor } from "../types";

export interface CommentItemProps {
  comment: CommentWithAuthor;
  currentUserId?: string | null;
  isDeleted?: boolean;
  onReply?: (commentId: string) => void;
  onEdit?: (commentId: string, content: string) => void;
  onDelete?: (commentId: string) => void;
  children?: React.ReactNode;
}

export function CommentItem({
  comment,
  currentUserId,
  isDeleted = false,
  onReply,
  onEdit,
  onDelete,
  children,
}: CommentItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);

  const isOwner = currentUserId === comment.authorId;
  const authorInitial = comment.author?.name?.charAt(0).toUpperCase() ?? "?";

  const handleEditSubmit = () => {
    if (editContent.trim() && onEdit) {
      onEdit(comment.id, editContent);
      setIsEditing(false);
    }
  };

  const handleEditCancel = () => {
    setEditContent(comment.content);
    setIsEditing(false);
  };

  if (isDeleted || comment.status === "deleted") {
    return (
      <div className="flex gap-3 py-4">
        <Avatar className="h-8 w-8">
          <AvatarFallback>?</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <p className="text-muted-foreground text-sm italic">삭제된 댓글입니다.</p>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 py-4">
      <Avatar className="h-8 w-8">
        {comment.author?.avatar ? <AvatarImage src={comment.author.avatar} /> : null}
        <AvatarFallback>{authorInitial}</AvatarFallback>
      </Avatar>

      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{comment.author?.name ?? "알 수 없음"}</span>
          {comment.createdAt ? (
            <span className="text-muted-foreground text-xs">
              {formatDistanceToNow(new Date(comment.createdAt), {
                addSuffix: true,
                locale: ko,
              })}
            </span>
          ) : null}
          {comment.updatedAt && comment.createdAt && comment.updatedAt !== comment.createdAt ? (
            <span className="text-muted-foreground text-xs">(수정됨)</span>
          ) : null}
        </div>

        {isEditing ? (
          <div className="mt-2 space-y-2">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="min-h-[80px]"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleEditSubmit}>
                저장
              </Button>
              <Button size="sm" variant="outline" onClick={handleEditCancel}>
                취소
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-1 text-sm whitespace-pre-wrap">{comment.content}</p>

            <div className="mt-2 flex items-center gap-2">
              {onReply && comment.depth < 2 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => onReply(comment.id)}
                >
                  <MessageSquare className="mr-1 h-3 w-3" />
                  답글
                </Button>
              ) : null}

              {isOwner ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button variant="ghost" size="sm" className="h-7 w-7 p-0" />}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => setIsEditing(true)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      수정
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => onDelete?.(comment.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      삭제
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          </>
        )}

        {children}
      </div>
    </div>
  );
}

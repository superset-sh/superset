/**
 * PostList - 게시물 목록 컴포넌트
 */
import { Link } from "@tanstack/react-router";
import { Avatar, AvatarFallback, AvatarImage } from "@superbuilder/feature-ui/shadcn/avatar";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@superbuilder/feature-ui/shadcn/table";
import { Eye, MessageSquare, Pin } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { usePosts } from "../hooks";

interface PostListProps {
  boardId: string;
  boardSlug: string;
  page?: number;
  limit?: number;
  onPageChange?: (page: number) => void;
}

export function PostList({ boardId, boardSlug, page = 1, limit = 20, onPageChange }: PostListProps) {
  const { data, isLoading, error } = usePosts(boardId, { page, limit });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">로딩 중...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-destructive">오류가 발생했습니다.</div>
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <div className="text-muted-foreground">게시물이 없습니다.</div>
        <Link to={`/board/${boardSlug}/write` as "/"}>
          <Button>첫 글 작성하기</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[60%]">제목</TableHead>
            <TableHead className="w-[15%]">작성자</TableHead>
            <TableHead className="w-[10%] text-center">조회</TableHead>
            <TableHead className="w-[15%] text-right">작성일</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.items.map((post) => (
            <TableRow key={post.id}>
              <TableCell>
                <Link
                  to={`/board/${boardSlug}/${post.id}` as "/"}
                  className="hover:text-primary flex items-center gap-2"
                >
                  {post.isPinned && (
                    <Pin className="text-primary size-4 shrink-0" />
                  )}
                  {post.isNotice && (
                    <Badge variant="destructive" className="shrink-0">
                      공지
                    </Badge>
                  )}
                  <span className="line-clamp-1">{post.title}</span>
                  {post.commentCount > 0 && (
                    <span className="text-muted-foreground flex items-center gap-1 text-xs">
                      <MessageSquare className="size-3" />
                      {post.commentCount}
                    </span>
                  )}
                </Link>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Avatar className="size-6">
                    <AvatarImage src={post.author?.avatar ?? undefined} />
                    <AvatarFallback className="text-xs">
                      {post.author?.name?.charAt(0)?.toUpperCase() ?? "?"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm">{post.author?.name ?? "익명"}</span>
                </div>
              </TableCell>
              <TableCell className="text-center">
                <span className="text-muted-foreground flex items-center justify-center gap-1 text-sm">
                  <Eye className="size-3" />
                  {post.viewCount}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground text-right text-sm">
                {formatDistanceToNow(new Date(post.createdAt), {
                  addSuffix: true,
                  locale: ko,
                })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* 페이지네이션 */}
      {data.total > limit && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange?.(page - 1)}
          >
            이전
          </Button>
          <span className="text-muted-foreground text-sm">
            {page} / {Math.ceil(data.total / limit)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!data.hasMore}
            onClick={() => onPageChange?.(page + 1)}
          >
            다음
          </Button>
        </div>
      )}
    </div>
  );
}

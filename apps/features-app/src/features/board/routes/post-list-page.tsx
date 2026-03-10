/**
 * Post List Page - 게시물 목록 페이지
 */
import { useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { ArrowLeft, PenSquare } from "lucide-react";
import { useBoardBySlug } from "../hooks";
import { PostList } from "../pages";

export function PostListPage() {
  const { slug } = useParams({ strict: false }) as { slug: string };
  const [page, setPage] = useState(1);
  const { data: board, isLoading } = useBoardBySlug(slug);

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-muted-foreground">로딩 중...</div>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-destructive">게시판을 찾을 수 없습니다.</div>
        <Link to="/board">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="mr-2 size-4" />
            게시판 목록으로
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      {/* 헤더 */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link to="/board">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-2 size-4" />
                목록
              </Button>
            </Link>
          </div>
          <h1 className="mt-2 text-3xl font-bold">{board.name}</h1>
          {board.description && (
            <p className="text-muted-foreground mt-2">{board.description}</p>
          )}
        </div>
        <Link to={`/board/${slug}/write` as "/"}>
          <Button>
            <PenSquare className="mr-2 size-4" />
            글쓰기
          </Button>
        </Link>
      </div>

      {/* 게시물 목록 */}
      <PostList
        boardId={board.id}
        boardSlug={slug}
        page={page}
        onPageChange={setPage}
      />
    </div>
  );
}

/**
 * Post Edit Page - 게시물 수정 페이지
 */
import { useParams } from "@tanstack/react-router";
import { useBoardBySlug } from "../hooks";
import { PostEditor } from "../pages";

export function PostEditPage() {
  const { slug, postId } = useParams({ strict: false }) as {
    slug: string;
    postId: string;
  };
  const { data: board, isLoading } = useBoardBySlug(slug);

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-4xl py-8">
        <div className="text-muted-foreground">로딩 중...</div>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="container mx-auto max-w-4xl py-8">
        <div className="text-destructive">게시판을 찾을 수 없습니다.</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl py-8">
      <PostEditor boardId={board.id} boardSlug={slug} postId={postId} />
    </div>
  );
}

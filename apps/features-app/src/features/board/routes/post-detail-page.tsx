/**
 * Post Detail Page - 게시물 상세 페이지
 */
import { useParams } from "@tanstack/react-router";
import { PostDetail } from "../pages";

export function PostDetailPage() {
  const { slug, postId } = useParams({ strict: false }) as {
    slug: string;
    postId: string;
  };

  return (
    <div className="container mx-auto max-w-4xl py-8">
      <PostDetail postId={postId} boardSlug={slug} />
    </div>
  );
}

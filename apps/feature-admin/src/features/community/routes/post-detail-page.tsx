/**
 * Post Detail Page - /c/:slug/post/:postId
 */
import { useParams } from "@tanstack/react-router";
import { PostDetail } from "../pages/post-detail";

export function PostDetailPage() {
  const { slug, postId } = useParams({ strict: false }) as {
    slug: string;
    postId: string;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <PostDetail slug={slug} postId={postId} />
    </div>
  );
}

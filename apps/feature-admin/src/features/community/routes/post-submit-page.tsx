import { useParams } from "@tanstack/react-router";
import { PostSubmitForm } from "../pages";

export function PostSubmitPage() {
  const { slug } = useParams({ strict: false });

  if (!slug) {
    return <div>Community not found</div>;
  }

  return (
    <div className="container mx-auto py-8">
      <PostSubmitForm communitySlug={slug} />
    </div>
  );
}

import { useParams } from "@tanstack/react-router";
import { ModQueue } from "../pages";

export function ModQueuePage() {
  const { slug } = useParams({ strict: false });

  if (!slug) {
    return <div>Community not found</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <ModQueue communitySlug={slug} />
    </div>
  );
}

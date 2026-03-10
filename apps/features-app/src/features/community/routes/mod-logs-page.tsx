import { useParams } from "@tanstack/react-router";
import { ModLogs } from "../pages";

export function ModLogsPage() {
  const { slug } = useParams({ strict: false });

  if (!slug) {
    return <div>Community not found</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <ModLogs communitySlug={slug} />
    </div>
  );
}

import { useParams } from "@tanstack/react-router";
import { ModDashboard } from "../pages";

export function ModDashboardPage() {
  const { slug } = useParams({ strict: false });

  if (!slug) {
    return <div>Community not found</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <ModDashboard communitySlug={slug} />
    </div>
  );
}

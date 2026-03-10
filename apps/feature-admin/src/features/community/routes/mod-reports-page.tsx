import { useParams } from "@tanstack/react-router";
import { ModReports } from "../pages";

export function ModReportsPage() {
  const { slug } = useParams({ strict: false });

  if (!slug) {
    return <div>Community not found</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <ModReports communitySlug={slug} />
    </div>
  );
}

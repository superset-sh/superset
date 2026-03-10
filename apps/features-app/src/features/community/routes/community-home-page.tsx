/**
 * Community Home Page - /c/:slug
 */
import { useParams } from "@tanstack/react-router";
import { CommunityHome } from "../pages/community-home";

export function CommunityHomePage() {
  const { slug } = useParams({ strict: false }) as { slug: string };

  return (
    <div className="container mx-auto px-4 py-8">
      <CommunityHome slug={slug} />
    </div>
  );
}

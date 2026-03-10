/**
 * Campaign Detail Page - 캠페인 상세
 */
import { useParams } from "@tanstack/react-router";
import { CampaignDetail } from "../pages/campaign-detail";

export function CampaignDetailPage() {
  const { id } = useParams({ strict: false }) as { id: string };

  return (
    <div className="container mx-auto py-8">
      <CampaignDetail campaignId={id} />
    </div>
  );
}

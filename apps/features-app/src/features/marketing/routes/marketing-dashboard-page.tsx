/**
 * Marketing Dashboard Page - 마케팅 캠페인 대시보드
 */
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { PageHeader } from "@superbuilder/feature-ui/components/page-header";
import { MarketingDashboard } from "../pages/marketing-dashboard";

export function MarketingDashboardPage() {
  return (
    <div className="container mx-auto py-8 space-y-6">
      <PageHeader
        title="마케팅"
        description="SNS 콘텐츠 관리 및 발행"
        actions={
          <Link to="/marketing/campaigns/new">
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" />
              새 캠페인
            </Button>
          </Link>
        }
      />
      <MarketingDashboard />
    </div>
  );
}

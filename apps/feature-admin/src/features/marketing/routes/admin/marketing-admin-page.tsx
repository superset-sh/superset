/**
 * Marketing Admin Page - 관리자 마케팅 대시보드
 */
import { MarketingAdmin } from "../../pages/marketing-admin";

export function MarketingAdminPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">마케팅 관리</h1>
        <p className="text-muted-foreground mt-2">
          마케팅 캠페인, 콘텐츠, 발행 현황을 관리합니다.
        </p>
      </div>
      <MarketingAdmin />
    </div>
  );
}

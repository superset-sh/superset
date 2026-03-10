/**
 * Account Page - SNS 계정 관리
 */
import { PageHeader } from "@superbuilder/feature-ui/components/page-header";
import { AccountManager } from "../pages/account-manager";

export function AccountPage() {
  return (
    <div className="container mx-auto py-8 space-y-6">
      <PageHeader title="SNS 계정" description="SNS 플랫폼 계정을 연결하고 관리합니다." />
      <AccountManager />
    </div>
  );
}

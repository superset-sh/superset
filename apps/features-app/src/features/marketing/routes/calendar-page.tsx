/**
 * Calendar Page - 발행 캘린더
 */
import { PageHeader } from "@superbuilder/feature-ui/components/page-header";
import { PublishCalendar } from "../pages/publish-calendar";

export function CalendarPage() {
  return (
    <div className="container mx-auto py-8 space-y-6">
      <PageHeader title="발행 캘린더" description="예약된 콘텐츠 발행 일정을 확인합니다." />
      <PublishCalendar />
    </div>
  );
}

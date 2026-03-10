/**
 * Tracker List Page - 데이터 트래커 목록 페이지
 */
import { TrackerList } from "../pages";

export function TrackerListPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">데이터 트래커</h1>
        <p className="text-muted-foreground mt-2">
          데이터를 기록하고 차트로 시각화합니다.
        </p>
      </div>
      <TrackerList />
    </div>
  );
}

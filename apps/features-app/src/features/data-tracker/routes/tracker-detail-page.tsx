/**
 * Tracker Detail Page - 데이터 트래커 상세 페이지
 */
import { useParams, Link } from "@tanstack/react-router";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { ArrowLeft } from "lucide-react";
import { useTrackerBySlug } from "../hooks";
import { TrackerDetail } from "../pages";

export function TrackerDetailPage() {
  const { slug } = useParams({ strict: false }) as { slug: string };
  const { data: tracker, isLoading, error } = useTrackerBySlug(slug);

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="mb-8 flex flex-col gap-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-5 w-80" />
        </div>
        <Skeleton className="h-10 w-48 rounded-lg" />
        <Skeleton className="mt-6 h-80 w-full rounded-lg" />
      </div>
    );
  }

  if (error || !tracker) {
    return (
      <div className="container mx-auto py-8">
        <p className="text-destructive">트래커를 찾을 수 없습니다.</p>
        <Link to="/data-tracker">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="mr-2 size-4" />
            트래커 목록으로
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2">
          <Link to="/data-tracker">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 size-4" />
              목록
            </Button>
          </Link>
        </div>
        <h1 className="mt-2 text-3xl font-bold">{tracker.name}</h1>
        {tracker.description && (
          <p className="text-muted-foreground mt-2">{tracker.description}</p>
        )}
      </div>

      {/* Detail Content */}
      <TrackerDetail tracker={tracker} />
    </div>
  );
}

/**
 * Task Detail Page - 태스크 상세 페이지
 */
import { useParams, Link, useSearch } from "@tanstack/react-router";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { ArrowLeft } from "lucide-react";
import { TaskDetail } from "../pages";

export function TaskDetailPage() {
  const { identifier } = useParams({ strict: false }) as {
    identifier: string;
  };
  const search = useSearch({ strict: false }) as { from?: string };

  return (
    <div className="container mx-auto py-8 h-full">
      {/* Header */}
      <div className="mb-4">
        <Link
          to="/tasks"
          search={{
            view: search.from === "board" ? "board" : undefined,
          }}
        >
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ArrowLeft className="size-4" />
            Tasks
          </Button>
        </Link>
      </div>

      {/* Detail Content */}
      <div className="rounded-lg border h-[calc(100vh-12rem)]">
        <TaskDetail identifier={identifier} />
      </div>
    </div>
  );
}

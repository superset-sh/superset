/**
 * TrackerList - 트래커 목록 컴포넌트
 */
import { Link } from "@tanstack/react-router";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@superbuilder/feature-ui/shadcn/card";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { LineChart, BarChart3, PieChart } from "lucide-react";
import { useTrackerList } from "../hooks";

interface Props {}

export function TrackerList({}: Props) {
  const { data: trackers, isLoading, error } = useTrackerList();

  if (isLoading) {
    return <TrackerListSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-destructive">오류가 발생했습니다.</p>
      </div>
    );
  }

  if (!trackers || trackers.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">등록된 트래커가 없습니다</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {trackers.map((tracker) => (
        <Link
          key={tracker.id}
          to="/data-tracker/$slug"
          params={{ slug: tracker.slug }}
        >
          <Card className="hover:bg-muted/30 cursor-pointer transition-colors">
            <CardHeader className="flex flex-row items-center gap-3">
              <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
                {CHART_TYPE_ICON[tracker.chartType]}
              </div>
              <div className="flex-1 min-w-0">
                <CardTitle className="text-lg truncate">
                  {tracker.name}
                </CardTitle>
                <CardDescription className="line-clamp-1">
                  {tracker.description || "설명이 없습니다."}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {CHART_TYPE_LABEL[tracker.chartType]}
                </Badge>
                <Badge variant="outline">{SCOPE_LABEL[tracker.scope]}</Badge>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

function TrackerListSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center gap-3">
            <Skeleton className="size-10 rounded-lg" />
            <div className="flex-1 flex flex-col gap-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-12 rounded-md" />
              <Skeleton className="h-5 w-16 rounded-md" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const CHART_TYPE_ICON: Record<string, React.ReactNode> = {
  line: <LineChart className="size-5" />,
  bar: <BarChart3 className="size-5" />,
  pie: <PieChart className="size-5" />,
};

const CHART_TYPE_LABEL: Record<string, string> = {
  line: "Line",
  bar: "Bar",
  pie: "Pie",
};

const SCOPE_LABEL: Record<string, string> = {
  personal: "개인",
  organization: "조직",
  all: "전체",
};

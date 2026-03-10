import { useState } from "react";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { PageHeader } from "@superbuilder/feature-ui/components/page-header";
import { Layers } from "lucide-react";
import { useCatalogFeatures } from "../hooks";
import { CatalogFilter } from "../components/catalog-filter";
import { CatalogCard } from "../components/catalog-card";

export function CatalogListPage() {
  const [group, setGroup] = useState("");
  const [search, setSearch] = useState("");

  const { data: features, isLoading } = useCatalogFeatures({
    group: group || undefined,
    search: search || undefined,
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Feature 카탈로그"
        description="사용 가능한 기능을 탐색하고, 의존성을 확인하세요."
        icon={<Layers className="h-6 w-6" />}
      />

      <CatalogFilter
        group={group}
        search={search}
        onGroupChange={setGroup}
        onSearchChange={setSearch}
      />

      {isLoading ? (
        <CatalogGridSkeleton />
      ) : features && features.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <CatalogCard
              key={feature.id}
              slug={feature.slug}
              name={feature.name}
              description={feature.description}
              group={feature.group}
              tags={feature.tags ?? []}
              icon={feature.icon}
              isCore={feature.isCore}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Layers className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">
            {search || group ? "검색 결과가 없습니다." : "등록된 Feature가 없습니다."}
          </p>
        </div>
      )}
    </div>
  );
}

/* Components */

function CatalogGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-5 w-32" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-12 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

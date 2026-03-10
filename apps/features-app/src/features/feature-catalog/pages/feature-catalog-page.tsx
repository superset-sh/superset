import { useState } from "react";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Search } from "lucide-react";
import {
  FEATURE_CATALOG,
  FEATURE_GROUPS,
  getFeatureCounts,
  getFeaturesByGroup,
} from "../data/feature-catalog";
import { CatalogSummary } from "../components/catalog-summary";
import { FeatureGroupSection } from "../components/feature-group-section";

export function FeatureCatalogPage() {
  const [search, setSearch] = useState("");
  const counts = getFeatureCounts();

  const filteredCatalog = search.trim()
    ? FEATURE_CATALOG.filter(
        (f) =>
          f.name.toLowerCase().includes(search.toLowerCase()) ||
          f.description.toLowerCase().includes(search.toLowerCase()) ||
          f.services.some((s) => s.toLowerCase().includes(search.toLowerCase())) ||
          f.tables.some((t) => t.toLowerCase().includes(search.toLowerCase())),
      )
    : FEATURE_CATALOG;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Feature 카탈로그</h1>
        <p className="text-muted-foreground">시스템 전체 기능 인벤토리</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Feature, 서비스, 테이블 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <CatalogSummary {...counts} />

      <div className="flex flex-col gap-4">
        {FEATURE_GROUPS.map((group) => {
          const features = search.trim()
            ? filteredCatalog.filter((f) => f.group === group.id)
            : getFeaturesByGroup(group.id);

          return features.length > 0 ? (
            <FeatureGroupSection
              key={group.id}
              group={group}
              features={features}
            />
          ) : null;
        })}
      </div>
    </div>
  );
}

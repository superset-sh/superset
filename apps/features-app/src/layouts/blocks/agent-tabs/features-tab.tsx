/**
 * Features Tab - 보유기능 탭
 *
 * 좌측: Feature 목록 (그룹별 사이드바)
 * 우측: 선택된 Feature의 상세 정보 및 동작 확인
 */
import { useState } from "react";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { ScrollArea } from "@superbuilder/feature-ui/shadcn/scroll-area";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { Link } from "@tanstack/react-router";
import {
  Boxes,
  ChevronRight,
  ExternalLink,
  Play,
  Search,
  Server,
  Database,
  Layout,
} from "lucide-react";
import { OnboardingModal, useOnboarding } from "@superbuilder/widgets/onboarding";
import {
  FEATURE_CATALOG,
  FEATURE_GROUPS,
  getFeaturesByGroup,
  type FeatureCatalogItem,
} from "@/features/feature-catalog/data/feature-catalog";

export function FeaturesTab() {
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const selectedFeature = FEATURE_CATALOG.find((f) => f.id === selectedFeatureId) ?? null;

  return (
    <div className="flex h-full">
      {/* 좌측: Feature 목록 */}
      <FeatureSidebar
        selectedId={selectedFeatureId}
        onSelect={setSelectedFeatureId}
      />
      {/* 우측: Feature 상세 */}
      <div className="flex-1 min-w-0 overflow-auto">
        {selectedFeature ? (
          <FeatureDetail feature={selectedFeature} />
        ) : (
          <FeatureEmptyState />
        )}
      </div>
      <OnboardingModal />
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

function FeatureSidebar({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredCatalog = searchQuery.trim()
    ? FEATURE_CATALOG.filter(
        (f) =>
          f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          f.description.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : FEATURE_CATALOG;

  return (
    <div className="flex w-72 shrink-0 flex-col border-r">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold">보유 기능</h2>
        <Badge variant="secondary" className="text-xs">
          {FEATURE_CATALOG.length}
        </Badge>
      </div>

      {/* 검색 */}
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="기능 검색..."
            className="h-8 pl-8 text-sm bg-muted/40 border-none rounded-lg"
          />
        </div>
      </div>

      <Separator />

      {/* Feature 목록 (그룹별) */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {FEATURE_GROUPS.map((group) => {
            const features = searchQuery.trim()
              ? filteredCatalog.filter((f) => f.group === group.id)
              : getFeaturesByGroup(group.id);

            if (features.length === 0) return null;

            return (
              <div key={group.id} className="mb-3">
                <p className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {group.label}
                </p>
                {features.map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <Button
                      key={feature.id}
                      variant="ghost"
                      onClick={() => onSelect(feature.id)}
                      className={cn(
                        "group flex h-auto w-full items-center justify-start gap-2.5 rounded-lg px-2 py-1.5 text-left",
                        selectedId === feature.id
                          ? "bg-accent text-accent-foreground"
                          : "text-foreground hover:bg-muted/50",
                      )}
                    >
                      <div className="rounded-md bg-muted p-1.5 shrink-0">
                        <Icon className="size-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm">{feature.name}</p>
                      </div>
                      <StatusDot status={feature.status} />
                    </Button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

function FeatureDetail({ feature }: { feature: FeatureCatalogItem }) {
  const Icon = feature.icon;
  const { reopen } = useOnboarding();

  return (
    <ScrollArea className="h-full">
      <div className="max-w-3xl mx-auto p-8">
        {/* 헤더 */}
        <div className="flex items-start gap-4 mb-8">
          <div className="rounded-xl bg-muted p-3 shrink-0">
            <Icon className="size-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold">{feature.name}</h1>
              <Badge variant={STATUS_VARIANT[feature.status]}>
                {STATUS_LABEL[feature.status]}
              </Badge>
              <Badge variant="outline">{TYPE_LABEL[feature.type]}</Badge>
            </div>
            <p className="text-muted-foreground">{feature.description}</p>
          </div>
        </div>

        {/* 온보딩 시작 버튼 */}
        {feature.id === "onboarding" ? (
          <div className="mb-8 rounded-lg border bg-muted/30 p-6">
            <h3 className="mb-2 text-sm font-semibold">온보딩 가이드</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Atlas의 주요 기능과 사용 방법을 단계별로 안내합니다.
            </p>
            <Button onClick={reopen} className="gap-2">
              <Play className="size-4" />
              온보딩 시작
            </Button>
          </div>
        ) : null}

        {/* 페이지 */}
        {feature.pages.length > 0 ? (
          <DetailSection
            icon={<Layout className="size-4" />}
            title="페이지"
            count={feature.pages.length}
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {feature.pages.map((page) => (
                <Link
                  key={page.path}
                  to={page.path}
                  className="flex items-center gap-2 rounded-lg border p-3 text-sm hover:bg-muted/50 transition-colors"
                >
                  <ExternalLink className="size-3.5 text-muted-foreground shrink-0" />
                  <span className="font-medium">{page.label}</span>
                  <span className="text-xs text-muted-foreground ml-auto font-mono">
                    {page.path}
                  </span>
                </Link>
              ))}
            </div>
          </DetailSection>
        ) : null}

        {/* 서비스 */}
        {feature.services.length > 0 ? (
          <DetailSection
            icon={<Server className="size-4" />}
            title="서비스"
            count={feature.services.length}
          >
            <div className="grid gap-1.5 sm:grid-cols-2">
              {feature.services.map((service) => (
                <div
                  key={service}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm bg-muted/30"
                >
                  <ChevronRight className="size-3 text-muted-foreground shrink-0" />
                  {service}
                </div>
              ))}
            </div>
          </DetailSection>
        ) : null}

        {/* 테이블 */}
        {feature.tables.length > 0 ? (
          <DetailSection
            icon={<Database className="size-4" />}
            title="테이블"
            count={feature.tables.length}
          >
            <div className="flex flex-wrap gap-2">
              {feature.tables.map((table) => (
                <Badge key={table} variant="outline" className="font-mono text-xs py-1">
                  {table}
                </Badge>
              ))}
            </div>
          </DetailSection>
        ) : null}
      </div>
    </ScrollArea>
  );
}

function FeatureEmptyState() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="rounded-2xl bg-muted/50 p-6">
          <Boxes className="size-12 text-muted-foreground/50" />
        </div>
        <div>
          <h3 className="text-lg font-medium">보유 기능</h3>
          <p className="text-sm text-muted-foreground mt-1">
            좌측에서 기능을 선택하여 상세 정보를 확인하세요
          </p>
        </div>
      </div>
    </div>
  );
}

function DetailSection({
  icon,
  title,
  count,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        <Badge variant="secondary" className="text-xs">
          {count}
        </Badge>
      </div>
      {children}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "size-2 rounded-full shrink-0",
        status === "active" && "bg-green-500",
        status === "wip" && "bg-yellow-500",
        status === "planned" && "bg-muted-foreground/50",
      )}
    />
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const STATUS_VARIANT: Record<string, "success" | "warning" | "secondary"> = {
  active: "success",
  wip: "warning",
  planned: "secondary",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  wip: "WIP",
  planned: "Planned",
};

const TYPE_LABEL: Record<string, string> = {
  page: "Page",
  widget: "Widget",
  agent: "Agent",
};

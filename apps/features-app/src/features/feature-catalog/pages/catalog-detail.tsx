import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Card, CardContent, CardHeader, CardTitle } from "@superbuilder/feature-ui/shadcn/card";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { PageHeader } from "@superbuilder/feature-ui/components/page-header";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle, Link as LinkIcon } from "lucide-react";
import { useCatalogFeatureBySlug } from "../hooks";

interface Props {
  slug: string;
}

export function CatalogDetailPage({ slug }: Props) {
  const { data: feature, isLoading, error } = useCatalogFeatureBySlug(slug);

  if (isLoading) {
    return <DetailSkeleton />;
  }

  if (error || !feature) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <p className="text-muted-foreground">Feature를 찾을 수 없습니다.</p>
        <Button variant="outline" render={<Link to="/features" />}>
          <ArrowLeft className="h-4 w-4" />
          목록으로 돌아가기
        </Button>
      </div>
    );
  }

  const requiredDeps = feature.dependencies?.filter(
    (d) => d.dependencyType === "required" && d.dependsOn,
  ) ?? [];
  const recommendedDeps = feature.dependencies?.filter(
    (d) => d.dependencyType === "recommended" && d.dependsOn,
  ) ?? [];
  const optionalDeps = feature.dependencies?.filter(
    (d) => d.dependencyType === "optional" && d.dependsOn,
  ) ?? [];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" render={<Link to="/features" />}>
          <ArrowLeft className="h-4 w-4" />
          목록
        </Button>
      </div>

      <PageHeader
        title={feature.name}
        description={feature.description ?? undefined}
        icon={feature.icon ? <span className="text-2xl">{feature.icon}</span> : undefined}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={GROUP_VARIANT[feature.group] ?? "secondary"}>
              {GROUP_LABEL[feature.group] ?? feature.group}
            </Badge>
            {feature.isCore ? <Badge variant="outline">Core</Badge> : null}
          </div>
        }
      />

      {(feature.tags ?? []).length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {(feature.tags ?? []).map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
        </div>
      ) : null}

      <Separator />

      {/* Capabilities */}
      {(feature.capabilities ?? []).length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">주요 기능</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2">
              {(feature.capabilities ?? []).map((cap) => (
                <li key={cap} className="flex items-start gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 shrink-0 text-green-500 mt-0.5" />
                  {cap}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {/* Dependencies */}
      {requiredDeps.length > 0 || recommendedDeps.length > 0 || optionalDeps.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">의존성</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {requiredDeps.length > 0 ? (
              <DependencySection label="필수" deps={requiredDeps} variant="default" />
            ) : null}
            {recommendedDeps.length > 0 ? (
              <DependencySection label="권장" deps={recommendedDeps} variant="secondary" />
            ) : null}
            {optionalDeps.length > 0 ? (
              <DependencySection label="선택" deps={optionalDeps} variant="outline" />
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Tech Stack */}
      {feature.techStack ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">기술 스택</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {feature.techStack.server && feature.techStack.server.length > 0 ? (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Server
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {feature.techStack.server.map((item) => (
                    <Badge key={item} variant="outline" className="font-mono text-xs">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
            {feature.techStack.client && feature.techStack.client.length > 0 ? (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Client
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {feature.techStack.client.map((item) => (
                    <Badge key={item} variant="outline" className="font-mono text-xs">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Preview Images */}
      {(feature.previewImages ?? []).length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">미리보기</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(feature.previewImages ?? []).map((url, idx) => (
                <div key={url} className="relative aspect-video rounded-lg border overflow-hidden bg-muted">
                  <img
                    src={url}
                    alt={`${feature.name} preview ${idx + 1}`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

/* Components */

interface DependencySectionProps {
  label: string;
  deps: Array<{
    dependsOn: { slug: string; name: string } | null;
    dependencyType: string;
  }>;
  variant: "default" | "secondary" | "outline";
}

function DependencySection({ label, deps, variant }: DependencySectionProps) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {deps.map((dep) =>
          dep.dependsOn ? (
            <Link key={dep.dependsOn.slug} to="/features/$slug" params={{ slug: dep.dependsOn.slug }}>
              <Badge variant={variant} className="cursor-pointer hover:opacity-80">
                <LinkIcon className="h-3 w-3 mr-1" />
                {dep.dependsOn.name}
              </Badge>
            </Link>
          ) : null,
        )}
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <Skeleton className="h-5 w-20" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      <Skeleton className="h-px w-full" />
      <div className="rounded-lg border p-4 space-y-3">
        <Skeleton className="h-5 w-24" />
        <div className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

/* Constants */

const GROUP_LABEL: Record<string, string> = {
  core: "Core",
  content: "Content",
  commerce: "Commerce",
  system: "System",
};

const GROUP_VARIANT: Record<string, "default" | "secondary" | "outline" | "success" | "warning"> = {
  core: "default",
  content: "secondary",
  commerce: "warning",
  system: "outline",
};

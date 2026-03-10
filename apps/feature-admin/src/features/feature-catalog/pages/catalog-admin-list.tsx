import { Card, CardContent, CardHeader, CardTitle } from "@superbuilder/feature-ui/shadcn/card";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Switch } from "@superbuilder/feature-ui/shadcn/switch";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@superbuilder/feature-ui/shadcn/table";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useAdminCatalogFeatures, useToggleCatalogPublish } from "../hooks";

/* Types */
interface CatalogAdminListProps {
  onEdit: (id: string) => void;
  onNew: () => void;
}

/* Constants */
const GROUP_LABELS: Record<string, string> = {
  core: "Core",
  content: "Content",
  commerce: "Commerce",
  system: "System",
};

const GROUP_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  core: "destructive",
  content: "default",
  commerce: "secondary",
  system: "outline",
};

export function CatalogAdminList({ onEdit, onNew }: CatalogAdminListProps) {
  const { data: features, isLoading } = useAdminCatalogFeatures();
  const togglePublish = useToggleCatalogPublish();

  const handleTogglePublish = async (id: string, currentPublished: boolean) => {
    try {
      await togglePublish.mutateAsync({
        id,
        data: { isPublished: !currentPublished },
      });
      toast.success(
        currentPublished ? "Feature 비공개 처리됨" : "Feature 공개됨",
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "발행 상태 변경 실패";
      toast.error(message);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Feature 목록</CardTitle>
        <Button onClick={onNew} size="sm">
          <Plus className="size-4 mr-2" />
          새 Feature 등록
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[60px]">순서</TableHead>
              <TableHead>이름</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>그룹</TableHead>
              <TableHead>Core</TableHead>
              <TableHead>발행</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeletonRows />
            ) : !features || features.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-8 text-muted-foreground"
                >
                  등록된 Feature가 없습니다
                </TableCell>
              </TableRow>
            ) : (
              features.map((feature: FeatureItem) => (
                <TableRow key={feature.id}>
                  <TableCell className="text-muted-foreground">
                    {feature.order}
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {feature.icon ? (
                        <span className="text-muted-foreground text-sm">
                          {feature.icon}
                        </span>
                      ) : null}
                      {feature.name}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-sm">
                    {feature.slug}
                  </TableCell>
                  <TableCell>
                    <Badge variant={GROUP_VARIANTS[feature.group] ?? "outline"}>
                      {GROUP_LABELS[feature.group] ?? feature.group}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {feature.isCore ? (
                      <Badge variant="destructive" className="text-xs">
                        Core
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={feature.isPublished}
                      onCheckedChange={() =>
                        handleTogglePublish(feature.id, feature.isPublished)
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEdit(feature.id)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* Types */
interface FeatureItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  group: string;
  tags: string[] | null;
  capabilities: string[] | null;
  isCore: boolean;
  isPublished: boolean;
  order: number;
}

/* Components */
function TableSkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={`skeleton-${i}`}>
          <TableCell>
            <Skeleton className="h-4 w-8" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-32" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-24" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-16" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-8" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-10" />
          </TableCell>
          <TableCell className="text-right">
            <Skeleton className="h-8 w-8 ml-auto" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

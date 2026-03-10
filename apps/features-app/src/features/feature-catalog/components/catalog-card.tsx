import { Card, CardContent, CardHeader, CardTitle } from "@superbuilder/feature-ui/shadcn/card";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

interface Props {
  slug: string;
  name: string;
  description: string | null;
  group: string;
  tags: string[];
  icon: string | null;
  isCore: boolean;
}

export function CatalogCard({ slug, name, description, group, tags, icon, isCore }: Props) {
  return (
    <Link to="/features/$slug" params={{ slug }}>
      <Card className="h-full transition-colors hover:border-primary/50">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {icon ? (
                <span className="text-lg shrink-0">{icon}</span>
              ) : null}
              <CardTitle className="text-base truncate">{name}</CardTitle>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {description ? (
            <p className="text-sm text-muted-foreground line-clamp-2">{description}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={GROUP_VARIANT[group] ?? "secondary"} className="text-xs">
              {GROUP_LABEL[group] ?? group}
            </Badge>
            {isCore ? (
              <Badge variant="outline" className="text-xs">
                Core
              </Badge>
            ) : null}
            {tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
            {tags.length > 3 ? (
              <span className="text-xs text-muted-foreground">+{tags.length - 3}</span>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </Link>
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

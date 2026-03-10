/**
 * Project Row - 프로젝트 목록의 단일 행
 */
import type { StoryStudioProject } from "@superbuilder/drizzle";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { BookOpen } from "lucide-react";

type ProjectResponse = Omit<StoryStudioProject, "createdAt" | "updatedAt" | "deletedAt"> & {
  createdAt: string | Date;
  updatedAt: string | Date | null;
  deletedAt: string | Date | null;
};

interface Props {
  project: ProjectResponse;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export function ProjectRow({ project, className, onClick }: Props) {
  const isArchived = project.status === "archived";

  return (
    <div className="flex items-center">
      <Link
        to="/story-studio/$id"
        params={{ id: project.id }}
        className={cn(
          "group hover:bg-muted/50 flex flex-1 items-center gap-3 rounded-md px-4 py-3 transition-colors",
          isArchived && "opacity-60",
          className,
        )}
        onClick={onClick}
      >
        {/* Icon */}
        <div className="bg-muted/50 text-muted-foreground group-hover:bg-background flex size-8 shrink-0 items-center justify-center rounded-md border transition-all group-hover:shadow-sm">
          <BookOpen className="size-4" />
        </div>

        {/* Title & Description */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{project.title}</span>
            <StatusBadge status={project.status} />
          </div>
          {project.description ? (
            <span className="text-muted-foreground max-w-[500px] truncate text-xs">
              {project.description}
            </span>
          ) : null}
        </div>

        {/* Right side info (Genre, Date) */}
        <div className="hidden shrink-0 items-center gap-4 sm:flex">
          {project.genre ? (
            <Badge variant="outline" className="h-5 px-1.5 py-0 text-[10px] font-normal">
              {project.genre}
            </Badge>
          ) : null}
          <div className="text-muted-foreground w-24 text-right text-xs">
            {project.updatedAt
              ? formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true, locale: ko })
              : ""}
          </div>
        </div>
      </Link>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variantMap: Record<string, "default" | "secondary" | "outline"> = {
    draft: "secondary",
    active: "default",
    archived: "outline",
  };

  const labelMap: Record<string, string> = {
    draft: "초안",
    active: "진행 중",
    archived: "보관",
  };

  return (
    <Badge
      variant={variantMap[status] ?? "secondary"}
      className="h-5 px-1.5 text-[10px] whitespace-nowrap"
    >
      {labelMap[status] ?? status}
    </Badge>
  );
}

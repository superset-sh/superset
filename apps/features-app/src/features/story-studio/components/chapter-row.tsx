import { cn } from "@superbuilder/feature-ui/lib/utils";
import { Link } from "@tanstack/react-router";

interface Chapter {
  id: string;
  title: string;
  code: string;
  status?: string | null;
}

interface Props {
  chapter: Chapter;
  projectId: string;
  index: number;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export function ChapterRow({ chapter, projectId, index, className, onClick }: Props) {
  return (
    <div className="flex items-center">
      <Link
        to="/story-studio/$id/chapters/$chId"
        params={{ id: projectId, chId: chapter.id }}
        className={cn(
          "group hover:bg-muted/50 flex flex-1 items-center gap-3 rounded-md px-4 py-3 transition-colors",
          className,
        )}
        onClick={onClick}
      >
        <div className="bg-muted/50 text-muted-foreground group-hover:bg-background flex size-8 shrink-0 items-center justify-center rounded-md border text-sm font-medium transition-all group-hover:shadow-sm">
          {index + 1}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{chapter.title}</span>
          </div>
          <span className="text-muted-foreground max-w-[500px] truncate text-xs">
            {chapter.code} {chapter.status ? ` / ${chapter.status}` : ""}
          </span>
        </div>
      </Link>
    </div>
  );
}

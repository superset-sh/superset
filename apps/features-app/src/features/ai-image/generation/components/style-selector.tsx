import { cn } from "@superbuilder/feature-ui/lib/utils";
import { useStyleTemplates } from "../../hooks/use-image-generation";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";

interface Props {
  selectedId: string | undefined;
  onSelect: (id: string | undefined) => void;
}

export function StyleSelector({ selectedId, onSelect }: Props) {
  const { data: styles, isLoading } = useStyleTemplates();

  if (isLoading) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-20 shrink-0 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!styles?.length) return null;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-foreground">스타일</span>
      <div className="flex gap-2 overflow-x-auto pb-2">
        <button
          type="button"
          onClick={() => onSelect(undefined)}
          className={cn(
            "flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border-2 text-xs transition-colors",
            !selectedId
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-muted text-muted-foreground hover:border-primary/50",
          )}
        >
          기본
        </button>
        {styles.map((style) => (
          <button
            key={style.id}
            type="button"
            onClick={() => onSelect(style.id)}
            className={cn(
              "flex h-20 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border-2 text-xs transition-colors",
              selectedId === style.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-muted text-muted-foreground hover:border-primary/50",
            )}
          >
            {style.thumbnailUrl ? (
              <img
                src={style.thumbnailUrl}
                alt={style.name}
                className="h-12 w-12 rounded object-cover"
              />
            ) : null}
            <span className="max-w-[72px] truncate">{style.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

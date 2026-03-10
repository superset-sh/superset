import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";
import { useImageHistory } from "../../hooks/use-image-generation";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  RotateCcw,
  Trash2,
} from "lucide-react";

interface Props {
  onReuse?: (prompt: string, styleTemplateId?: string) => void;
}

export function ImageHistory({ onReuse }: Props) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useImageHistory(page);
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    ...trpc.aiImage.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.aiImage.history.queryKey(),
      });
    },
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-lg" />
        ))}
      </div>
    );
  }

  if (!data?.data.length) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        아직 생성된 이미지가 없습니다
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        {data.data.map((item) => (
          <HistoryItem
            key={item.id}
            item={item}
            onReuse={onReuse}
            onDelete={(id) => deleteMutation.mutate({ id })}
          />
        ))}
      </div>
      {data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {data.totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            disabled={page >= data.totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface HistoryItemProps {
  item: {
    id: string;
    prompt: string;
    outputImageUrl: string | null;
    styleTemplateId: string | null;
    status: string;
  };
  onReuse?: (prompt: string, styleTemplateId?: string) => void;
  onDelete: (id: string) => void;
}

function HistoryItem({ item, onReuse, onDelete }: HistoryItemProps) {
  const handleDownload = () => {
    if (!item.outputImageUrl) return;
    const link = document.createElement("a");
    link.href = item.outputImageUrl;
    link.download = `ai-image-${item.id}.png`;
    link.click();
  };

  return (
    <div className="group relative aspect-square overflow-hidden rounded-lg border bg-muted">
      {item.outputImageUrl && item.status === "completed" ? (
        <img
          src={item.outputImageUrl}
          alt={item.prompt}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
          {item.status === "failed" ? "실패" : item.status}
        </div>
      )}
      <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100">
        <div className="flex w-full items-center justify-between p-2">
          <span className="max-w-[60%] truncate text-xs text-white">
            {item.prompt}
          </span>
          <div className="flex gap-1">
            {onReuse && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-white hover:text-white"
                onClick={() => onReuse(item.prompt, item.styleTemplateId ?? undefined)}
              >
                <RotateCcw className="h-3 w-3" />
              </Button>
            )}
            {item.outputImageUrl && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-white hover:text-white"
                onClick={handleDownload}
              >
                <Download className="h-3 w-3" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-white hover:text-destructive"
              onClick={() => onDelete(item.id)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

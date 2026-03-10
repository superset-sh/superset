import { cn } from "@superbuilder/feature-ui/lib/utils";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { Download, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import type { GenerationStreamEvent, AiImageFormat } from "@superbuilder/features-server/ai-image/types";

interface Props {
  streamStatus: GenerationStreamEvent | null;
  format?: AiImageFormat;
  className?: string;
}

export function ProgressiveImage({ streamStatus, format = "feed", className }: Props) {
  if (!streamStatus) return null;

  const { status, progress = 0 } = streamStatus;

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-lg border bg-muted",
        FORMAT_ASPECT_MAP[format],
        className,
      )}
    >
      {status === "pending" && <PendingState />}
      {status === "generating" && <GeneratingState progress={progress} />}
      {status === "completed" && <CompletedState streamStatus={streamStatus} />}
      {status === "failed" && <FailedState errorMessage={streamStatus.errorMessage} />}
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

function PendingState() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">준비 중...</span>
      </div>
    </div>
  );
}

function GeneratingState({ progress }: { progress: number }) {
  return (
    <div className="flex h-full items-center justify-center">
      <Skeleton className="absolute inset-0 animate-pulse" />
      <div className="relative z-10 flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <div className="flex flex-col items-center gap-1">
          <span className="text-sm font-medium">이미지 생성 중...</span>
          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted-foreground/20">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">{progress}%</span>
        </div>
      </div>
    </div>
  );
}

function CompletedState({ streamStatus }: { streamStatus: GenerationStreamEvent }) {
  const imageBase64 = streamStatus.imageBase64;
  if (!imageBase64) return null;

  const imageSrc = `data:image/png;base64,${imageBase64}`;

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = imageSrc;
    link.download = `ai-image-${Date.now()}.png`;
    link.click();
  };

  return (
    <>
      <img
        src={imageSrc}
        alt="Generated image"
        className="h-full w-full object-cover"
      />
      <div className="absolute bottom-2 right-2">
        <Button size="icon" variant="secondary" onClick={handleDownload}>
          <Download className="h-4 w-4" />
        </Button>
      </div>
    </>
  );
}

/* Constants */

const FORMAT_ASPECT_MAP: Record<AiImageFormat, string> = {
  feed: "aspect-square",
  carousel: "aspect-[4/5]",
  story: "aspect-[9/16]",
  reels_cover: "aspect-[9/16]",
};

function FailedState({ errorMessage }: { errorMessage?: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-2 px-4 text-center">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <span className="text-sm font-medium text-destructive">생성 실패</span>
        {errorMessage && (
          <span className="text-xs text-muted-foreground">{errorMessage}</span>
        )}
      </div>
    </div>
  );
}

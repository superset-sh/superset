import { useEffect, useRef } from "react";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { isNil } from "es-toolkit";
import { DynamicIcon } from "lucide-react/dynamic";
import { useAsync } from "../hooks/use-async";

export interface Props extends React.ComponentProps<"img"> {
  fallback?: string;
  aspectRatio?: number;
}

export function Image({ className, src, alt, fallback = "", aspectRatio, ...props }: Props) {
  const { execute: _execute, loading, failed } = useAsync(loadImage);
  const execute = useRef(_execute).current;

  useEffect(() => {
    execute(src || fallback);
  }, [src, fallback, execute]);

  const commonStyles = {
    aspectRatio,
    width: props.width,
    height: props.height,
    ...props.style,
  };

  if (loading) {
    return (
      <Skeleton style={commonStyles} className={cn("bg-foreground/10 size-full", className)} />
    );
  }

  if (failed) {
    return (
      <div
        style={commonStyles}
        className={cn(
          "bg-foreground/5 text-muted-foreground flex size-full items-center justify-center",
          className,
        )}
      >
        <DynamicIcon name="image" />
      </div>
    );
  }

  return (
    <div style={commonStyles} className={cn("overflow-hidden", className)}>
      <img {...props} src={src} alt={alt} className="size-full object-cover" />
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

async function loadImage(src: string | undefined) {
  await new Promise<void>((resolve, reject) => {
    if (isNil(src)) {
      reject("No source URL provided");
      return;
    }

    const img = new window.Image();
    img.src = src;

    img.onload = () => {
      resolve();
    };

    img.onerror = () => {
      reject("Failed to load image");
    };
  });
}

import { cn } from "@superbuilder/feature-ui/lib/utils";
import { FORMAT_SIZE_MAP } from "@superbuilder/features-server/ai-image/types";
import type { AiImageFormat } from "@superbuilder/features-server/ai-image/types";
import { Square, RectangleVertical, Smartphone, Film } from "lucide-react";

interface Props {
  selectedFormat: AiImageFormat;
  onSelect: (format: AiImageFormat) => void;
}

export function FormatSelector({ selectedFormat, onSelect }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-muted-foreground text-sm font-medium">포맷</label>
      <div className="grid grid-cols-4 gap-2">
        {FORMAT_OPTIONS.map((option) => (
          <button
            key={option.format}
            type="button"
            onClick={() => onSelect(option.format)}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-center transition-colors",
              selectedFormat === option.format
                ? "border-primary bg-primary/5 text-primary"
                : "border-border hover:border-primary/50",
            )}
          >
            <option.icon className="h-5 w-5" />
            <span className="text-xs font-medium">{FORMAT_SIZE_MAP[option.format].label}</span>
            <span className="text-[10px] text-muted-foreground">
              {FORMAT_SIZE_MAP[option.format].ratio}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* Constants */

const FORMAT_OPTIONS: Array<{
  format: AiImageFormat;
  icon: typeof Square;
}> = [
  { format: "feed", icon: Square },
  { format: "carousel", icon: RectangleVertical },
  { format: "story", icon: Smartphone },
  { format: "reels_cover", icon: Film },
];

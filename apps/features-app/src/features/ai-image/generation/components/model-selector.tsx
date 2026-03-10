import { cn } from "@superbuilder/feature-ui/lib/utils";
import { AI_IMAGE_MODELS } from "@superbuilder/features-server/ai-image/types";
import type { AiImageModelId } from "@superbuilder/features-server/ai-image/types";

interface Props {
  selectedId: AiImageModelId;
  onSelect: (id: AiImageModelId) => void;
}

export function ModelSelector({ selectedId, onSelect }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-muted-foreground text-sm font-medium">모델</label>
      <div className="grid grid-cols-2 gap-2">
        {AI_IMAGE_MODELS.map((model) => (
          <button
            key={model.id}
            type="button"
            onClick={() => onSelect(model.id)}
            className={cn(
              "flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
              selectedId === model.id
                ? "border-primary bg-primary/5 text-primary"
                : "border-border hover:border-primary/50",
            )}
          >
            <span className="font-medium">{model.label}</span>
            <span className="text-muted-foreground text-xs">{model.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

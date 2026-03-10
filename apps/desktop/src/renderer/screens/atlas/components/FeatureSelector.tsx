import { cn } from "@superset/ui/cn";
import { Checkbox } from "@superset/ui/checkbox";
import { useState } from "react";
import { GroupFilter } from "./GroupFilter";

interface FeatureSelectorProps {
  registry: {
    features: Record<string, { name: string; type: string; group: string }>;
    groups: Array<{ id: string; label: string }>;
    core: string[];
  };
  selected: string[];
  onToggle: (id: string) => void;
}

export function FeatureSelector({
  registry,
  selected,
  onToggle,
}: FeatureSelectorProps) {
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const features = Object.entries(registry.features);

  const filtered = features.filter(([, f]) =>
    activeGroup ? f.group === activeGroup : true,
  );

  return (
    <div className="space-y-4">
      <GroupFilter
        groups={registry.groups}
        activeGroup={activeGroup}
        onGroupChange={setActiveGroup}
      />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
        {filtered.map(([id, feature]) => {
          const isCore = registry.core.includes(id);
          const isSelected = selected.includes(id) || isCore;
          return (
            <button
              key={id}
              type="button"
              disabled={isCore}
              onClick={() => !isCore && onToggle(id)}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg border text-left transition-all",
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/30",
                isCore && "opacity-60 cursor-not-allowed",
              )}
            >
              <Checkbox checked={isSelected} disabled={isCore} />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{feature.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {id} · {feature.type}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

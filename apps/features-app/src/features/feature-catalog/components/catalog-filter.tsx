import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Search } from "lucide-react";

interface Props {
  group: string;
  search: string;
  onGroupChange: (group: string) => void;
  onSearchChange: (search: string) => void;
}

export function CatalogFilter({ group, search, onGroupChange, onSearchChange }: Props) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-2">
        {GROUP_FILTERS.map((filter) => (
          <Button
            key={filter.value}
            variant={group === filter.value ? "default" : "outline"}
            size="sm"
            onClick={() => onGroupChange(filter.value)}
          >
            {filter.label}
          </Button>
        ))}
      </div>
      <div className="relative w-full max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Feature 검색..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>
    </div>
  );
}

/* Constants */

const GROUP_FILTERS = [
  { label: "전체", value: "" },
  { label: "Core", value: "core" },
  { label: "Content", value: "content" },
  { label: "Commerce", value: "commerce" },
  { label: "System", value: "system" },
] as const;

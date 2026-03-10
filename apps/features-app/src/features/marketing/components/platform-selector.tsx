/**
 * PlatformSelector - SNS 플랫폼 선택 체크박스 그룹
 */
import { Checkbox } from "@superbuilder/feature-ui/shadcn/checkbox";
import { Label } from "@superbuilder/feature-ui/shadcn/label";

interface Props {
  selected: string[];
  onChange: (platforms: string[]) => void;
}

export function PlatformSelector({ selected, onChange }: Props) {
  const handleToggle = (platform: string) => {
    if (selected.includes(platform)) {
      onChange(selected.filter((p) => p !== platform));
    } else {
      onChange([...selected, platform]);
    }
  };

  return (
    <div className="flex flex-wrap gap-4">
      {PLATFORMS.map((platform) => (
        <div key={platform.id} className="flex items-center gap-2">
          <Checkbox
            id={`platform-${platform.id}`}
            checked={selected.includes(platform.id)}
            onCheckedChange={() => handleToggle(platform.id)}
          />
          <Label htmlFor={`platform-${platform.id}`} className="text-sm cursor-pointer">
            {platform.label}
          </Label>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const PLATFORMS = [
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "threads", label: "Threads" },
  { id: "x", label: "X (Twitter)" },
  { id: "linkedin", label: "LinkedIn" },
] as const;

import { Checkbox } from "@superbuilder/feature-ui/shadcn/checkbox";
import { Label } from "@superbuilder/feature-ui/shadcn/label";

interface Props {
  value: string[];
  onChange: (value: string[]) => void;
}

export function ToolPicker({ value, onChange }: Props) {
  const handleToggle = (toolName: string) => {
    if (value.includes(toolName)) {
      onChange(value.filter((t) => t !== toolName));
    } else {
      onChange([...value, toolName]);
    }
  };

  const handleGroupToggle = (group: ToolGroup) => {
    const groupTools = group.tools.map((t) => t.name);
    const allSelected = groupTools.every((t) => value.includes(t));

    if (allSelected) {
      onChange(value.filter((t) => !groupTools.includes(t)));
    } else {
      const newValue = [...new Set([...value, ...groupTools])];
      onChange(newValue);
    }
  };

  return (
    <div className="space-y-4">
      <Label>도구 선택</Label>
      <div className="space-y-6">
        {TOOL_GROUPS.map((group) => {
          const groupTools = group.tools.map((t) => t.name);
          const selectedCount = groupTools.filter((t) =>
            value.includes(t),
          ).length;
          const allSelected = selectedCount === groupTools.length;

          return (
            <div key={group.id} className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={() => handleGroupToggle(group)}
                />
                <span className="text-sm font-medium">{group.label}</span>
                <span className="text-xs text-muted-foreground">
                  ({selectedCount}/{groupTools.length})
                </span>
              </div>
              <div className="ml-6 grid grid-cols-2 gap-2">
                {group.tools.map((tool) => (
                  <div key={tool.name} className="flex items-center gap-2">
                    <Checkbox
                      checked={value.includes(tool.name)}
                      onCheckedChange={() => handleToggle(tool.name)}
                    />
                    <Label className="text-sm font-normal cursor-pointer">
                      {tool.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

type ToolGroup = {
  id: string;
  label: string;
  tools: { name: string; label: string }[];
};

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const TOOL_GROUPS: ToolGroup[] = [
  {
    id: "graph",
    label: "그래프 콘텐츠",
    tools: [
      { name: "graph.search", label: "그래프 검색" },
      { name: "graph.getDetail", label: "그래프 상세" },
    ],
  },
  {
    id: "board",
    label: "게시판",
    tools: [
      { name: "board.list", label: "게시판 목록" },
      { name: "board.postSearch", label: "게시글 검색" },
    ],
  },
  {
    id: "community",
    label: "커뮤니티",
    tools: [
      { name: "community.search", label: "커뮤니티 검색" },
      { name: "community.posts", label: "커뮤니티 게시글" },
    ],
  },
  {
    id: "file",
    label: "파일",
    tools: [{ name: "file.search", label: "파일 검색" }],
  },
  {
    id: "user",
    label: "사용자",
    tools: [{ name: "user.profile", label: "프로필 조회" }],
  },
];

/**
 * ConditionBuilder - 재귀적 조건 트리 편집기
 *
 * 플래그 검사(flag_check) 및 AND/OR 그룹을 트리 구조로 편집
 */
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@superbuilder/feature-ui/shadcn/select";
import { Minus, Plus } from "lucide-react";

interface Flag {
  id: string;
  name: string;
  category: string;
}

interface Condition {
  type: "flag_check" | "group";
  flagId?: string;
  operator?: "==" | "!=" | ">" | ">=" | "<" | "<=";
  value?: string | number | boolean;
  logic?: "AND" | "OR";
  children?: Condition[];
}

interface ConditionBuilderProps {
  conditions: Condition[];
  flags: Flag[];
  onChange: (conditions: Condition[]) => void;
}

export function ConditionBuilder({ conditions, flags, onChange }: ConditionBuilderProps) {
  const handleAdd = () => {
    onChange([...conditions, { type: "flag_check", flagId: undefined, operator: "==", value: "" }]);
  };

  const handleAddGroup = () => {
    onChange([...conditions, { type: "group", logic: "AND", children: [] }]);
  };

  const handleUpdate = (index: number, updated: Condition) => {
    onChange(conditions.map((c, i) => (i === index ? updated : c)));
  };

  const handleRemove = (index: number) => {
    onChange(conditions.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      {conditions.map((condition, index) => (
        <ConditionRow
          key={index}
          condition={condition}
          flags={flags}
          onChange={(updated) => handleUpdate(index, updated)}
          onRemove={() => handleRemove(index)}
        />
      ))}
      <div className="flex gap-1">
        <Button type="button" variant="outline" size="sm" onClick={handleAdd}>
          <Plus className="mr-1 h-3 w-3" />
          플래그 검사
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={handleAddGroup}>
          <Plus className="mr-1 h-3 w-3" />
          AND/OR 그룹
        </Button>
      </div>
    </div>
  );
}

/* Components */

const OPERATORS = [
  { value: "==", label: "==" },
  { value: "!=", label: "!=" },
  { value: ">", label: ">" },
  { value: ">=", label: ">=" },
  { value: "<", label: "<" },
  { value: "<=", label: "<=" },
] as const;

interface ConditionRowProps {
  condition: Condition;
  flags: Flag[];
  onChange: (updated: Condition) => void;
  onRemove: () => void;
}

function ConditionRow({ condition, flags, onChange, onRemove }: ConditionRowProps) {
  if (condition.type === "group") {
    return <GroupRow condition={condition} flags={flags} onChange={onChange} onRemove={onRemove} />;
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* Flag selector */}
      <Select
        value={condition.flagId ?? ""}
        onValueChange={(val) => onChange({ ...condition, flagId: val ?? undefined })}
      >
        <SelectTrigger className="h-8 w-36 text-xs">
          <SelectValue placeholder="플래그 선택" />
        </SelectTrigger>
        <SelectContent>
          {flags.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Operator */}
      <Select
        value={condition.operator ?? "=="}
        onValueChange={(val) =>
          onChange({ ...condition, operator: (val ?? undefined) as Condition["operator"] })
        }
      >
        <SelectTrigger className="h-8 w-16 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPERATORS.map((op) => (
            <SelectItem key={op.value} value={op.value}>
              {op.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Value */}
      <Input
        className="h-8 w-24 text-xs"
        value={String(condition.value ?? "")}
        onChange={(e) => onChange({ ...condition, value: parseConditionValue(e.target.value) })}
        placeholder="값"
      />

      {/* Remove */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={onRemove}
      >
        <Minus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

interface GroupRowProps {
  condition: Condition;
  flags: Flag[];
  onChange: (updated: Condition) => void;
  onRemove: () => void;
}

function GroupRow({ condition, flags, onChange, onRemove }: GroupRowProps) {
  const children = condition.children ?? [];

  return (
    <div className="border-muted rounded-md border p-2">
      <div className="mb-2 flex items-center gap-2">
        <Select
          value={condition.logic ?? "AND"}
          onValueChange={(val) => onChange({ ...condition, logic: val as "AND" | "OR" })}
        >
          <SelectTrigger className="h-7 w-20 text-xs font-medium">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AND">AND</SelectItem>
            <SelectItem value="OR">OR</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-muted-foreground text-xs">그룹</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ml-auto h-7 w-7"
          onClick={onRemove}
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Nested ConditionBuilder */}
      <ConditionBuilder
        conditions={children}
        flags={flags}
        onChange={(updated) => onChange({ ...condition, children: updated })}
      />
    </div>
  );
}

/* Helpers */

function parseConditionValue(raw: string): string | number | boolean {
  if (raw === "true") return true;
  if (raw === "false") return false;
  const num = Number(raw);
  if (!Number.isNaN(num) && raw.trim() !== "") return num;
  return raw;
}
